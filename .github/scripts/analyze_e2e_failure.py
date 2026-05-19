# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "anthropic>=0.50.0",
# ]
# ///
"""e2e-test の失敗を Anthropic Messages API で解析し、JSON を stdout に出力する。

入力は環境変数経由で受け取る。出力は stdout に JSON 1 オブジェクト。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any

from anthropic import Anthropic

LOG_TAIL_LINES = 100
HISTORY_LIMIT = 20
DEFAULT_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048
# matrix が大きいときに全セルのログを送ると prompt が肥大化するため、
# 失敗ジョブのうち最初の N 件だけログを取得し、残りはジョブ名だけ列挙する
MAX_LOG_JOBS = 5
# 外部呼び出しが暴走しないようにそれぞれの上限を設ける (実測は API ~14s, gh 各 ~1s)
ANTHROPIC_TIMEOUT_SEC = 60.0
SUBPROCESS_TIMEOUT_SEC = 30

SYSTEM_PROMPT = """\
あなたは GitHub Actions の e2e-test の失敗を解析する。

## 入力
ユーザーメッセージにメタ情報・失敗ジョブ・直近実行履歴・直近のコード変更・各失敗ジョブのログ末尾が
セクション分けされて与えられる。

## 出力
以下の構造で 1 つの JSON オブジェクトだけを出力する。前後に説明文・コードフェンスは一切付けない。

{
  "category": "flaky | external_dependency | code_issue | infrastructure | cancelled | unknown",
  "confidence": "low | medium | high",
  "summary": "1-2 文の日本語要約",
  "evidence": "判定根拠 (どのログのどの行か、何回中何回失敗しているか)",
  "suggested_action": "次の一手 (1 文、日本語)",
  "affected_matrix": ["ubuntu-24.04 / node-22 / Google Chrome", "..."]
}

## 判定指針
- flaky: 同じ matrix セルが直近 20 回で成功と失敗を混在させている (失敗率 5-50% 程度)。
  または「タイムアウトのみが原因」かつ「他セルは成功」。
- external_dependency: ログに以下のパターンが見える場合
  - Tailscale 関連エラー (`tailscale`, `ts.net`, `ping failed`)
  - Signaling/API URL への接続失敗 (`ECONNREFUSED`, `ETIMEDOUT`, `net::ERR_`, `getaddrinfo`)
  - Playwright ブラウザのダウンロード失敗
  - npm/pnpm レジストリエラー
- code_issue: Playwright のアサーション失敗 (`expect(...).toBe...`, `Timed out waiting for`) が安定再現していて、
  直近の `e2e-tests/` 配下に変更がある場合は confidence high。変更が無い場合は medium。
- infrastructure: runner の OOM, disk full, GitHub Actions 側の障害。
- cancelled: 全ジョブが cancelled で上記いずれにも該当しない。
- unknown: 判定材料が不足、または上記のいずれにも明確に該当しない。

## 注意
- affected_matrix は `<os> / node-<version> / <browser>` 形式で、失敗したセルだけを列挙する。
- summary は実装者がパッと読んで分かる粒度で具体的に書く。
- suggested_action は「再実行で様子見」「Tailscale の状態確認」「コード修正、テスト X 確認」のように行動可能な表現。
- 推測でカテゴリを決めないこと。証拠が薄ければ confidence: low か category: unknown。
"""


def env(name: str, default: str | None = None) -> str:
    """環境変数を取得する。未設定なら default、それも無ければ KeyError。"""
    value = os.environ.get(name, default)
    if value is None:
        raise KeyError(f"environment variable {name!r} is required")
    return value


def run(*args: str, check: bool = True) -> str:
    """subprocess.run のラッパー。stdout を str で返す。"""
    result = subprocess.run(
        args, capture_output=True, text=True, check=check, timeout=SUBPROCESS_TIMEOUT_SEC
    )
    return result.stdout


def collect_jobs(repo: str, run_id: str) -> list[dict[str, Any]]:
    """対象 run の失敗・キャンセルしたジョブ一覧を返す。"""
    raw = run(
        "gh",
        "api",
        f"repos/{repo}/actions/runs/{run_id}/jobs",
        "--paginate",
        "--jq",
        ".jobs[]",
    )
    failed: list[dict[str, Any]] = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        job = json.loads(line)
        if job.get("conclusion") in ("failure", "cancelled"):
            failed.append(
                {
                    "id": job["id"],
                    "name": job["name"],
                    "conclusion": job["conclusion"],
                    "started_at": job.get("started_at"),
                    "completed_at": job.get("completed_at"),
                    "failed_steps": [
                        {
                            "name": s["name"],
                            "conclusion": s.get("conclusion"),
                            "number": s.get("number"),
                        }
                        for s in job.get("steps", [])
                        if s.get("conclusion") in ("failure", "cancelled")
                    ],
                }
            )
    return failed


def collect_log_tail(repo: str, job_id: int) -> str:
    """ジョブのログ末尾を返す。取得失敗・タイムアウト時は理由付きで返す。"""
    try:
        log = run("gh", "api", f"repos/{repo}/actions/jobs/{job_id}/logs")
    except subprocess.CalledProcessError:
        return "(log fetch failed)"
    except subprocess.TimeoutExpired:
        return f"(log fetch timed out after {SUBPROCESS_TIMEOUT_SEC}s)"
    lines = log.splitlines()
    return "\n".join(lines[-LOG_TAIL_LINES:])


def collect_history(repo: str, workflow: str, branch: str) -> list[dict[str, Any]]:
    """直近 N 回の同 workflow / 同 branch の実行履歴を返す。"""
    raw = run(
        "gh",
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        workflow,
        "--branch",
        branch,
        "--limit",
        str(HISTORY_LIMIT),
        "--json",
        "databaseId,conclusion,status,createdAt,headSha,event",
    )
    return json.loads(raw)


def collect_recent_changes() -> str:
    """直近 5 コミットの e2e-tests/ 配下と playwright.config.ts の変更を返す。"""
    try:
        return run(
            "git",
            "log",
            "-5",
            "--name-status",
            "--pretty=format:commit %h %s%n%an %ad",
            "--date=short",
            "--",
            "e2e-tests/",
            "playwright.config.ts",
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return ""


def build_user_message(context: dict[str, Any]) -> str:
    """Claude に渡す user message を組み立てる。"""
    parts: list[str] = []

    parts.append("# meta")
    parts.append(json.dumps(context["meta"], indent=2, ensure_ascii=False))

    parts.append("\n# failed_jobs")
    parts.append(json.dumps(context["failed_jobs"], indent=2, ensure_ascii=False))

    parts.append(f"\n# history (直近 {HISTORY_LIMIT} 回)")
    parts.append(json.dumps(context["history"], indent=2, ensure_ascii=False))

    parts.append("\n# recent_changes (直近 5 コミットの e2e-tests/ 配下)")
    parts.append(context["recent_changes"] or "(変更なし)")

    parts.append("\n# logs (各失敗ジョブのログ末尾)")
    for name, log in context["logs"].items():
        parts.append(f"\n--- {name} ---\n{log}")

    return "\n".join(parts)


def call_anthropic(api_key: str, model: str, user_message: str) -> dict[str, Any]:
    """Messages API を呼び、レスポンスから JSON を抽出して返す。

    claude-sonnet-4-6 は assistant message prefill をサポートしないため、
    レスポンス本文から最初の `{` 〜 最後の `}` までを抽出して JSON としてパースする。
    """
    client = Anthropic(api_key=api_key, timeout=ANTHROPIC_TIMEOUT_SEC)
    response = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": user_message},
        ],
    )

    body = response.content[0].text
    # コードフェンスやチャット応答の前後を吸収して JSON を抽出する
    start = body.find("{")
    end = body.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"no JSON object found in response: {body!r}")
    return json.loads(body[start : end + 1])


def main() -> int:
    repo = env("GITHUB_REPOSITORY")
    run_id = env("GITHUB_RUN_ID")
    workflow = env("GITHUB_WORKFLOW")
    branch = env("GITHUB_REF_NAME")
    event_name = env("GITHUB_EVENT_NAME")
    sha = env("GITHUB_SHA")
    e2e_result = env("E2E_RESULT")
    api_key = env("ANTHROPIC_API_KEY")
    model = env("ANTHROPIC_MODEL", DEFAULT_MODEL)

    failed_jobs = collect_jobs(repo, run_id)
    # 大量の matrix セル失敗時に prompt が肥大化するのを防ぐため、ログは先頭 MAX_LOG_JOBS 件だけ取得する
    logs: dict[str, str] = {}
    for i, job in enumerate(failed_jobs):
        if i < MAX_LOG_JOBS:
            logs[job["name"]] = collect_log_tail(repo, job["id"])
        else:
            logs[job["name"]] = "(log omitted; same failure pattern expected)"
    history = collect_history(repo, workflow, branch)
    recent_changes = collect_recent_changes()

    context = {
        "meta": {
            "run_id": run_id,
            "workflow": workflow,
            "branch": branch,
            "event": event_name,
            "sha": sha,
            "e2e_test_result": e2e_result,
        },
        "failed_jobs": failed_jobs,
        "history": history,
        "recent_changes": recent_changes,
        "logs": logs,
    }

    user_message = build_user_message(context)
    print(f"=== user_message length: {len(user_message)} chars ===", file=sys.stderr)

    analysis = call_anthropic(api_key, model, user_message)
    print(json.dumps(analysis, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
