# ConnectionBase.pc に TypeDoc の @example を追加する

- Priority: Low
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/update-pc-typedoc-example
- Polished: 2026-09-16

## 目的

API リファレンス (TypeDoc) で `ConnectionBase.pc` から情報を取得する方法を確認できるようにする。現在はプロパティの型と一言説明のみで、`getStats()` などの利用方法にたどり着けない。

## 優先度根拠

Low。SDK の挙動には影響しない API ドキュメントの問題。0066 (open) はメソッドの `@example` を対象としており、プロパティは対象外であるため、0066 と同じ方針で `pc` の例を補う位置づけ。

## 現状

- `src/base.ts` の `ConnectionBase.pc` は public プロパティで型は `RTCPeerConnection | null`
- JSDoc は「PeerConnection インスタンス」のみで `@example` がない
- 配信中の `apidoc` (0063 で GitHub Pages にデプロイ済み: `https://shiguredo.github.io/sora-js-sdk/interfaces/ConnectionBase.html`) の `ConnectionBase` ページにも利用例は表示されない
- 0066 (open) はメソッドの `@example` (`on` / `disconnect` / `rpc` / `sendMessage` など) を対象としており、`pc` プロパティは範囲外

## 設計方針

- `ConnectionBase.pc` の JSDoc に `@example` を追加する
- 例のレシーバは `ConnectionBase` を継承する role 接続インスタンス (例: `sendrecv`) にする。`Sora.connection()` の戻り値 (`SoraConnection`) は `pc` プロパティを持たないため、`connection.pc` としない
- 接続後に `sendrecv.pc` の `getStats()` で統計情報を取得する例を示す
- 未接続時は `pc` が `null` であることに触れる (`@example` では null チェックの例示、または 0066 の `rpc` と同様に最小限の `@remarks` で補足する)
- コードフェンスは ` ```typescript ` を使い、0066 の設計方針 (トップレベル風の `await`、シグナリング URL の `wss://sora.example.com/signaling` 統一、1 例あたり 5 〜 15 行) と揃える

## 完了条件

- `src/base.ts` の `ConnectionBase.pc` に `@example` が追加されている
- `0089` の解消後に `vp run doc` で生成した `apidoc` の `ConnectionBase` ページに例が表示される (現 develop は typedoc / TypeScript 7 非互換のため `vp run doc` が実行不能。`apidoc` の出力先は `interfaces/` 配下)
- 0066 の設計方針と、0066 の実装後の `@example` に対して表現・方針が矛盾しない

## 解決方法

- `src/base.ts` の `ConnectionBase.pc` の JSDoc に `@example` を追加する
- `0089` の解消後に `vp install --frozen-lockfile && vp run doc` で `apidoc` を生成し、`ConnectionBase` ページの表示を確認する
- `CHANGES.md` の `## develop` の `### misc` に `[UPDATE]` として追記する

## 関連 issue

- **0066 (open)**: typedoc の @example を充実させる。メソッドが対象で `pc` プロパティは含まれていない
