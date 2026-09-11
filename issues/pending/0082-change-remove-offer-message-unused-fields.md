# SignalingOfferMessage から不要な項目 `ignore_disconnect_websocket` と `data_channel_signaling` を削除する

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/change-remove-offer-message-unused-fields
- Polished: {YYYY-MM-DD}

## 目的

`src/types.ts` の `SignalingOfferMessage` に定義されている `ignore_disconnect_websocket` と `data_channel_signaling` は、実際には `type: offer` メッセージに含まれない。型定義を実際の Sora の offer 仕様に揃え、利用者が存在しないフィールドを参照しないようにする。

あわせて、`type: offer` に含まれる `version` が型に無いため追加を検討する。

## 優先度根拠

Low。SDK の接続やメディア処理には影響しない型定義の正確性の問題であり、バグではない。ただし存在しないフィールドを型が advertise することで利用者の誤用を招くため、放置はしない。

## 現状

### offer に含まれない 2 項目が型に残っている

`src/types.ts` の `SignalingOfferMessage` に以下が定義されている。

- `ignore_disconnect_websocket?: boolean`
- `data_channel_signaling?: boolean`

`src/base.ts` を確認すると、`ignore_disconnect_websocket` を参照しているのは `signalingOnMessageTypeSwitched` の `message.ignore_disconnect_websocket` のみで、これは `SignalingSwitchedMessage` のプロパティ。`SignalingOfferMessage` の同フィールドはどこからも参照されていない。`data_channel_signaling` も `SignalingOfferMessage` としては未使用。

### `version` が型に無い

元 issue のコメントで、offer に含まれる `version` が `SignalingOfferMessage` に定義されていないことが指摘されている。現行の `SignalingOfferMessage` に `version` は無い。

## 設計方針

未確定。少なくとも以下を決める必要がある。

- `SignalingOfferMessage` から `ignore_disconnect_websocket` / `data_channel_signaling` を削除する。削除しても `SignalingSwitchedMessage` 側の同名フィールドには影響しない
- `SignalingOfferMessage` に `version?: string` を追加するか
- 削除は利用者にとっては optional フィールドの削除であり、後方互換の範囲を確認する

## 完了条件

- `SignalingOfferMessage` から不要な 2 項目が削除されていること
- 削除しても `pnpm typecheck` / `pnpm lint` / `pnpm test` が通ること
- `version` を追加する場合は型と実際の offer が一致していること
- `CHANGES.md` の `## develop` に変更を追記すること

## pending にした理由

- **Sora 側の offer 仕様の確認と合意が必要**: 元 issue の TODO に「対象項目が本当に入ってこないか検証チームで確認し、消して OK か合意を取る」とある。現行コードの参照状況から未使用は確認できるが、Sora 側の offer に含まれないことの最終確認が未完了
- **`version` 追加の要否が未確定**: offer の `version` を型に追加するかどうかを決める必要がある

着手判断のトリガー:

- offer に `ignore_disconnect_websocket` / `data_channel_signaling` が含まれないことが確認できた
- `version` を型に追加するかどうかが決定した
