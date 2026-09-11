# WebRTC Stats を必要な情報だけに絞って送信するフィルター機能を追加する

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/add-webrtc-stats-filter
- Polished: {YYYY-MM-DD}

## 目的

Sora へ送信する WebRTC Stats を type などで絞り込めるようにし、不要な情報を Sora に送らないようにする。Sora 側のログ量とネットワーク負荷を抑え、必要な情報だけを扱えるようにする。

## 優先度根拠

Low。Stats の送信は接続やメディアの挙動には影響しない観測性の機能であり、バグではない。ただし Stats は量が多く、Sora に送る情報を絞る仕組みは運用上有用なため、機能として検討する。

## 現状

### SDK は全 Stats をそのまま送る

- `src/base.ts` の `getStats()` は `pc.getStats()` の全エントリを `RTCStatsReport[]` として返すだけで、フィルタリングしない
- `src/base.ts` の `sendStatsMessage(reports)` は受け取った `reports` をそのまま DataChannel (`stats`) 経由で送信する
- `type: ping` に `stats: true` が付いていた場合は `signalingOnMessageTypePing` で `getStats()` の結果を `type: pong` の `stats` に積む。ここでも絞り込みは無い
- DataChannel の `type: req_stats` を受信した場合も `getStats()` の結果をそのまま送る
- `ConnectionOptions` に Stats を絞り込むオプションは無い

### 元 issue の要望

- できるだけ Sora に送りたくないため、必要な情報だけを送る仕組みが欲しい (例: `type` を指定してそれだけ送る)
- preset として recommend があると良いかもしれない

## 設計方針

未確定。少なくとも以下を決める必要がある。

- フィルターの指定方法 (`ConnectionOptions` に追加するか、`rpc()` などの既存 API から指定するか)
- 指定形式 (送信する `RTCStatsReport.type` の許可リストか、除外リストか、preset 名か)
- preset を用意するか (例: recommend)。用意する場合の中身
- フィルターを `getStats()` に適用するか、送信直前の `sendStatsMessage()` / `signalingOnMessageTypePing` に適用するか
- フィルター適用後も Sora 側の Stats 処理が壊れないことの確認

## 完了条件

- Stats を絞り込む手段が `ConnectionOptions` など利用者から指定できること
- 指定に従って `type: pong` / DataChannel の stats 送信が絞り込まれること
- フィルターを指定しない場合は従来どおり全 Stats が送られること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[ADD]` エントリが追記されていること

## pending にした理由

- **API が未確定**: フィルターの指定方法 (オプション / 既存 API)、指定形式 (type 許可リスト / 除外リスト / preset)、preset の有無が決まっていない
- **Sora 側の統計処理との整合確認が必要**: 送る Stats を絞ることで Sora 側の統計処理に影響が出ないか確認する必要がある
- **元 issue (shiguredo/sora-oss-private#1963) が「実装イメージ: Options に何かしらの設定を追加する」の段階で止まっている**

着手判断のトリガー:

- フィルターの指定方法と形式 (preset の有無を含む) が決定した
- 絞り込み後も Sora 側の統計処理が問題ないことを確認できた
