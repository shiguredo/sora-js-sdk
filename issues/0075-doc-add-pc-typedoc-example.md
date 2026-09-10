# ConnectionBase.pc に TypeDoc の @example を追加する

- Priority: Low
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/update-pc-typedoc-example
- Polished: {YYYY-MM-DD}

## 目的

API リファレンス (TypeDoc) で `ConnectionBase.pc` から情報を取得する方法を確認できるようにする。現在はプロパティの型と一言説明のみで、`getStats()` などの利用方法にたどり着けない。

## 優先度根拠

Low。SDK の挙動には影響しない API ドキュメントの問題。0066 でメソッドの `@example` を充実させているが、プロパティは対象外であり、同じ方針で `pc` の例を補う位置づけ。

## 現状

- `src/base.ts` の `ConnectionBase.pc` は public プロパティで型は `RTCPeerConnection | null`
- JSDoc は「PeerConnection インスタンス」のみで `@example` がない
- 生成済み `apidoc` の `ConnectionBase` ページにも利用例は表示されない
- 0066 はメソッドの `@example` (`on` / `disconnect` / `rpc` / `sendMessage` など) を対象にしており、`pc` プロパティは範囲外

## 設計方針

- `ConnectionBase.pc` の JSDoc に `@example` を追加する
- 接続後に `connection.pc` の `getStats()` で統計情報を取得する例を示す
- 未接続時は `connection.pc` が `null` であることに触れる
- コードフェンスは ` ```typescript ` を使い、0066 の方針と揃える

## 完了条件

- `src/base.ts` の `ConnectionBase.pc` に `@example` が追加されている
- `vp run doc` で生成した `apidoc` の `ConnectionBase` に例が表示される
- 0066 の `@example` と表現・方針が矛盾しない

## 解決方法

- `src/base.ts` の `ConnectionBase.pc` の JSDoc に `@example` を追加する
- `vp install --frozen-lockfile && vp run doc` で `apidoc` を生成し、`ConnectionBase` ページの表示を確認する
- `CHANGES.md` の `## develop` の `### misc` に追記する

## 関連 issue

- **0066 (open)**: typedoc の @example を充実させる。メソッドが対象で `pc` プロパティは含まれていない
