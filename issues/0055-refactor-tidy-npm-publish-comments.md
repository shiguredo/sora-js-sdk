# `.github/workflows/npm-publish.yml` の publish 2 経路に並ぶ運用コメントを整理する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-tidy-npm-publish-comments
- Polished: 2026-10-16

## 目的

`.github/workflows/npm-publish.yml` の両 publish ジョブで、コメント 2 行 (`# pnpm publish は CI では正常に動作しない` + 参照 URL)、`npm install -g npm@latest`、`npm publish` の順に並んでおり、コメントの係り先 (どちらのステップを説明するものか) が読者に伝わらない状態を整理し、コメントの根拠範囲を明確にする。あわせて参照先 pnpm issue の鮮度を確認し、本 workaround がまだ必要かどうかをコメントの文面に反映する。0033 で `--provenance` が追加され、0058 で `--no-git-checks` が削除されるなど publish 行の変更は続いたが、コメントが publish ステップから切り離された並びは変わっておらず、誤読リスクの負債が残っている。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。可読性・保守性の改善であり、緊急性は無いが、2025-08-01 に `npm install -g npm@latest` がコメントと `npm publish` ステップの間に挿入されたことでコメントの係り先が曖昧になり、その後も 0033 / 0058 で publish 行の変更が続いたため、関連変更が記憶に新しいうちに整理しておく。

## 現状

`.github/workflows/npm-publish.yml` の `npm-publish-canary` ジョブと `npm-publish` ジョブに、同一のコメント・ステップ構成が並んでいる (`npm-publish-canary` 側):

```yaml
# pnpm publish は CI では正常に動作しない
# https://github.com/pnpm/pnpm/issues/4937
- run: npm install -g npm@latest
- run: npm publish --tag canary --provenance
```

(`npm-publish` 側は publish 行が `npm publish --provenance`)

- コメントは「`pnpm publish` が CI で使えないため `npm publish` で publish する」という publish 経路の理由を述べたもので、git 履歴上も 2025-05-05 の publish ジョブ独立時 (`7ec64660`)、latest 側は 2025-06-12 の stable ジョブ追加時 (`db8c2af5`) から `npm publish` ステップの直前にあった。2025-08-01 (`1538b3414`) に `npm install -g npm@latest` がコメントと publish の間に挿入され、現在はコメント、install、publish の順に並ぶため、コメントが install ステップの説明としても読めて係り先が一意に定まらない
- `npm install -g npm@latest` の実際の理由はコメントの内容とは別 (同梱 npm が Trusted Publishing 要件の npm 11.5.1+ を満たさないため。0056 で扱う) で、コメントと混同されやすい
- 0033 で publish 行末尾に `--provenance` が追加され (`npm publish --no-git-checks --tag canary --provenance`)、0058 で `--no-git-checks` が削除された現在の publish 行は `npm publish --tag canary --provenance` となっている。行の見た目が変わっても、コメント・install・publish の並びは変わっておらず、誤読リスクの負債が残ったまま
- 参照先 `https://github.com/pnpm/pnpm/issues/4937` (`pnpm publish doesn't work with npm access token`) は 2022-06-26 起票で、2026-09-15 時点では open だった。ただしコメントは 21 件あり、2022-07-09 のメンテナ (zkochan) の最初の返信 (`pnpm actually runs npm for publish...`) 以降、2025-01-14 の `.npmrc` の読み込み位置が原因とする分析 (faileon)、2025-09-18 に pnpm v10.17.0 でも再現する旨の追認 (std4453) などが続いており、他 issue / PR からのクロス参照も複数ある
- さらに 2026-09-19 に zkochan が closed 済み (`state_reason: not_planned`)。クローズコメントでは「publish 経路は書き直され、`npm_config_//registry/:_authToken` は尊重されることを確認済み」「サポート対象バージョンでの再現報告が無いためクローズ」「新たな再現報告があれば reopen する」とされており、`pnpm publish` が現在動作することを確認したわけではない。3 年以上経過しており、pnpm 9 / 10 / 11 系で挙動が変わっている可能性は残る。鮮度確認なしに残すのは「コードを読めば分かる」自明説明と紙一重

## 設計方針

以下のいずれかで対応する。実装時にどちらにするか決定する。

### 案 A: コメントを `npm publish` ステップの直前に戻す

- コメントを `npm install -g npm@latest` ステップの直上から `npm publish` ステップの直上 (install と publish の間) へ移動し、配置でコメントの係り先を publish 経路に限定する
- `npm install -g npm@latest` ステップの理由コメント (Trusted Publishing 要件) の付与は 0056 のスコープとし、本 issue ではコメントを付与しない
- canary / latest 両経路で同じ整理を行う

### 案 B: コメント文面を、コメント下に続く 2 ステップ (install + publish) の理由と明示

- コメント位置はそのまま、文面を対象ステップが伝わる形に書き換える: `# pnpm publish は CI では正常に動作しなかったため、npm CLI を最新化して npm publish で publish する (https://github.com/pnpm/pnpm/issues/4937、2026-09-19 に closed)`
- 行が伸びるが、コメントが「npm CLI の最新化 + `npm publish`」の 2 ステップ分の理由であることと、参照先が closed であることが文面で明示される

### 鮮度確認

- 参照先 pnpm issue `pnpm/pnpm#4937` の最新状態を確認する (2026-09-19 に closed・`not_planned` を確認済み。実装時にも再確認する)
- closed は「サポート対象バージョンでの再現報告が無い」ことに基づくもので `pnpm publish` の動作確認ではないため、workaround 自体 (npm CLI での publish) は見直さない
- コメントの文面には参照先の状態を反映する (参照 URL は残しつつ過去の経緯である旨を添えるか、参照を外して理由を補足する)
- 現行のコメントが示す「`pnpm publish` は CI では正常に動作しない」を現役の不具合として断言する書き方は避ける
- `pnpm publish` を直接使うように見直すかどうかの実機検証が必要と判断した場合は、本 issue のスコープ外として別 issue にする

## 完了条件

- 両 publish ジョブ (`npm-publish-canary` / `npm-publish`) のコメントが、係り先 (説明対象のステップ) を誤解させない配置・文面になっている (0057 統合後は 1 ジョブで同様。0056 案 C が先に成立して `npm install -g npm@latest` が削除された場合は、コメントが `npm publish` ステップ直上に残る形になることを本 issue 側でも確認する)
- コメントの係り先を巡る誤読リスクが解消されている
- 参照先 pnpm issue の現状確認結果 (2026-09-19 に closed・`not_planned`) と、コメントへの反映方針が PR 本文に明記されている

## スコープ外

- `npm install -g npm@latest` ステップ自体の共通化 (0056 で扱う)
- canary / latest 2 ジョブ統合 (0057 で扱う)
- `--no-git-checks` フラグの削除 (0058 closed で扱い済み)

## 関連 issue

- 0033 (closed): `--provenance` 追加。本 issue の動機
- 0056 (open): `npm install -g npm@latest` 重複共通化。案 C が成立した場合は対象ステップ自体が削除されるため、本 issue は publish 直上のコメント文面の整理のみ残る。マージ順に注意
- 0057 (open): canary / latest publish ジョブ統合。統合後はコメント整理対象が 1 箇所になる
- 0058 (closed): `--no-git-checks` フラグの削除。現行の publish 行からは削除済み
