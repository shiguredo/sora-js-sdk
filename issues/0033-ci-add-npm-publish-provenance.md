# npm publish workflow に `--provenance` を追加する

- Priority: Low
- Created: 2026-05-25
- Polished: 2026-06-02
- Model: Composer 2.5
- Branch: feature/add-npm-publish-provenance

## 目的

npm の supply chain 透明性のため `npm publish --provenance` を整え、GitHub Actions から publish した artifact の出所 (provenance attestation) を npm に残す。

## 優先度根拠

Low。0024 (タグ検証) / 0026 (permissions 最小化) 完了後の運用改善。リリース信頼性の向上であり SDK の機能・実行時挙動には影響しない。

## 現状

`.github/workflows/npm-publish.yml` の publish コマンド (行番号は 0024/0026 マージで下にずれるため `npm publish --no-git-checks` を grep で特定する。着手時参考値):

- canary (`npm-publish-canary` ジョブ): `npm publish --no-git-checks --tag canary`
- latest (`npm-publish` ジョブ): `npm publish --no-git-checks`

provenance / `publishConfig.provenance` はいずれも未設定 (grep 0 件)。

**provenance attestation 生成の要件 (現状の充足状況):**

| 要件                                                      | 現状                                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm バージョン                                            | 充足。両 publish ジョブに `npm install -g npm@latest` がある。`--provenance` フラグ自体は npm 9.5.0+、Trusted Publishing による自動 provenance は npm 11.5.1+ が要件で、`npm@latest` がいずれも満たす |
| public パッケージ                                         | 充足。`package.json` の `name` は `sora-js-sdk`、`private` 未設定                                                                                                                                     |
| public **リポジトリ**                                     | 充足。`shiguredo/sora-js-sdk` は public。provenance は private リポジトリでは生成されない (public パッケージでも)                                                                                     |
| `package.json` の `repository.url` が当該リポジトリを指す | 充足。`git+https://github.com/shiguredo/sora-js-sdk.git`                                                                                                                                              |
| CI ジョブに `id-token: write`                             | 充足。publish ジョブレベルに `contents: read` + `id-token: write` あり                                                                                                                                |

**認証と Trusted Publishing:** リポジトリに `NPM_TOKEN` / `NODE_AUTH_TOKEN` は無い (grep 0 件)。トークンが無いため npm publish の **認証** は npm Trusted Publishing (OIDC) で行う前提。Trusted Publishing が npm 側で設定済みであることが着手前条件になる (未設定だと認証が通らず publish が失敗する)。

**provenance と `--provenance` の関係 (重要):** npm 公式は「Trusted Publishing で publish すると provenance attestation が**自動生成**され `--provenance` フラグは不要」とする。一方、実運用では `--provenance` を明示しないと attestation が付かなかったとの報告もあり、公式記述と実挙動にギャップがある。本 issue は **`--provenance` を明示する方針で確定**する (害はなく、意図を明示でき、自動生成されない場合の保険になる)。**最終的な成功条件は「フラグを足したこと」ではなく「canary publish 後に npm 上で attestation が確認できること」**とする (下記完了条件)。

**着手前確認:**

- Trusted Publishing が npmjs.com の `sora-js-sdk` パッケージで設定済みか。**npmjs.com の Package Settings → Trusted Publishing を直接確認する** (過去の publish 実績は token publish だった可能性を排除できず、TP 設定済みの証明にはならない)

**0026 マージ後の権限:** 0026 はトップレベル `permissions` から `id-token: write` を除去し publish ジョブレベルの `id-token: write` のみを残す。0033 はジョブレベルの `id-token: write` に依存するため、0026 マージ後もこれが維持されていることを確認する (完了条件)。

## 設計方針

0024 / 0026 マージ後の `npm-publish.yml` で `npm publish --no-git-checks` を grep し、publish コマンド 2 箇所に `--provenance` を付ける。

```yaml
# canary (npm-publish-canary ジョブ)
- run: npm publish --provenance --no-git-checks --tag canary

# latest (npm-publish ジョブ)
- run: npm publish --provenance --no-git-checks
```

`--no-git-checks` は維持する (artifact download 後の dirty working tree で publish が止まらないようにするため)。`setup-node` の `registry-url: https://registry.npmjs.org` も維持する。Slack 通知 (`status: ${{ job.status }}`) は issue 0023 (closed) のとおり変更不要。

参考: [npm provenance documentation](https://docs.npmjs.com/generating-provenance-statements)

### npm registry 側設定 (リポジトリ外作業)

Trusted Publishing 未設定のまま `--provenance` を入れない。npmjs.com の管理権限を持つ担当が以下を設定する (コード変更担当と別の場合あり)。

1. npmjs.com → Package `sora-js-sdk` → Settings → Trusted Publishing
2. Repository: `shiguredo/sora-js-sdk`
3. Workflow filename: `npm-publish.yml` (publish は `npm-publish-canary` / `npm-publish` の 2 ジョブ。両方をカバーできるか確認する)
4. Environment: ワークフローに `environment:` 宣言は無いため空

## 完了条件

- canary / latest 両経路で `npm publish --provenance --no-git-checks` (canary は `--tag canary` も維持) になる
- `package.json` の `repository.url` が `https://github.com/shiguredo/sora-js-sdk` を指し、`name` が public パッケージであることを確認する (provenance の前提、現状充足)
- 0026 マージ後、publish ジョブレベルに `permissions: contents: read` + `id-token: write` があることを確認する
- npm registry 側 Trusted Publishing 設定が完了していること (上記チェックリスト)
- PR 段階: YAML diff で `--provenance` が 2 箇所に入り、ジョブレベル `id-token: write` が残っていることをレビューで確認する
- マージ後の初回 canary tag push 後: `npm view sora-js-sdk@<canary-version>` または npm パッケージページで provenance / attestation が確認できること。失敗時はタグ削除と canary version 再採番で復旧する

## 変更履歴

- `CHANGES.md` `## develop` の `### misc` に追記する (CI / リリースパイプラインの変更で SDK の機能には影響しないため misc)。種別順 CHANGE → ADD → UPDATE → FIX を守り、`[ADD]` は **`[CHANGE]` 群と `[FIX]` 群の間** に置く (0024/0025/0026 が先にマージされ misc に `[FIX]` 3 件が並ぶため、それらの上)

  ```
  - [ADD] npm publish に --provenance を追加して supply chain 透明性を向上させる
    - @voluntas
  ```

## マージ順

```
0024 → 0025 → 0026 → 0033
```

0024 (タグ検証) / 0026 (permissions 最小化) 完了後に着手する。0025 (slack-notify の SHA 固定) は `npm-publish.yml` の slack-notify 行のみを触り、0033 は publish コマンド行のみを触るためコンフリクトしない (順序上 0025 を経由するだけ)。着手前条件として Trusted Publishing 設定が別途必要 (リポジトリ外作業)。
