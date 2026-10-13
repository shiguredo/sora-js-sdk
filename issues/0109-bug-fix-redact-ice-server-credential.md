# trace の redact が iceServers の credential を隠さない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-redact-ice-server-credential
- Polished: 2026-10-14

## 目的

`ConnectionBase.trace` が `callbacks.log` と debug 時の console へ渡すオブジェクトから、TURN などの `credential` を隠す。`debug` が false でもログコールバックには出るため、接続のたびに平文が利用者のログへ渡らないようにする。

## 優先度根拠

High。offer の `config` は `RTCPeerConnection` を作る前に `trace("PEER CONNECTION CONFIG", config)` へ渡る。offer メッセージ全体も `trace("SIGNALING OFFER MESSAGE", message)` へ渡る。Sora の offer は `iceServers` に `credential` を含む。`ConnectionBase.trace` は `debug` に関係なく `callbacks.log` を呼ぶ。

`issues/closed/0020-bug-fix-trace-leaks-jwt-and-metadata.md` は `metadata` 系と `access_token` と `secret` を隠す。`credential` は対象に入っていない。

## 現状

`src/utils.ts` の `REDACT_KEYS` は次だけである。

- `metadata`
- `signaling_notify_metadata`
- `authn_metadata`
- `authz_metadata`
- `access_token`
- `secret`

`redact` はキー名の完全一致で値を `[REDACTED]` にする。ネストした plain object と配列は再帰する。`iceServers` の要素の `credential` と `username` は一致しないため、そのまま残る。

`ConnectionBase.trace` は redact 済みの値を `callbacks.log` に渡し、`this.debug === true` のときだけ `utils.trace` で console へ出す。`utils.trace` も先頭で `redact` する。

SDP 文字列は redact しない。これは 0020 の方針のまま維持する。

## 設計方針

`REDACT_KEYS` に `credential` を追加する。`username` は認証情報なので同じく隠す。値の中身が JWT かどうかを走査する処理は追加しない。0020 と同じ完全一致である。

`REDACT_KEYS` は `types.ts` と自動連動しない。追加したキーは、既存の注意コメントのリストと単体テストの期待に合わせる。

実値の credential をテストや issue に書かない。テストはプレースホルダ文字列で、出力が `[REDACTED]` になることだけを見る。

## 完了条件

- `iceServers` 配列の要素に `credential` と `username` があるオブジェクトを `redact` すると、両方の値が `[REDACTED]` になる
- それ以外のキー (`urls` など) は残る
- `metadata` を値ごと隠す既存の動作は維持する
- `ConnectionBase.trace` 経由の `callbacks.log` にも、redact 後のオブジェクトが渡る
- SDP 文字列は redact しない
