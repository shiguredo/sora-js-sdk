# Firefox で simulcast を利用可能と判定する

- Created: 2026-10-21
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-firefox-simulcast-detection
- Polished: {YYYY-MM-DD}

## 目的

Firefox は rid ベースの simulcast を SDP で扱えるが、SDK の `enabledSimulcast()` が `RTCRtpSender.getCapabilities("video").headerExtensions` の内容で判定するため、Firefox では常に simulcast 非対応と判定され `Simulcast can not be used with this browser` が throw される。Firefox でも simulcast を利用可能と判定できるようにし、Firefox と Sora での動作検証を可能にする。

## 現状

`src/utils.ts` の `enabledSimulcast()` は次の 3 つを `REQUIRED_HEADER_EXTENSIONS` として定義し、`RTCRtpSender.getCapabilities("video").headerExtensions` にすべて含まれる場合のみ `true` を返す。

- `urn:ietf:params:rtp-hdrext:sdes:mid`
- `urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id`
- `urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id`

`src/utils.ts` の `createSignalingMessage()` は、`message.simulcast` が真かつ role が `recvonly` 以外で `enabledSimulcast()` が偽のとき `Simulcast can not be used with this browser` を throw する。

Firefox の `RTCRtpSender.getCapabilities("video").headerExtensions` は固定リストから作られており、mid や abs-send-time、toffset、TWCC などは含まれるが rid 系は含まれない (Firefox の `PeerConnectionImpl::GetDefaultRtpExtensions`)。このため Firefox では `enabledSimulcast()` が常に偽になる。

一方、Firefox の JSEP は `a=rid` がある m-section に対して `urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id` の `a=extmap` を動的に追加し、RTX が有効な場合は `repaired-rtp-stream-id` も追加する (Firefox の `JsepSessionImpl::GetRtpExtensions`)。Firefox は SDP レベルでは rid ベース simulcast を扱えるため、`getCapabilities` のヘッダ拡張リストだけを根拠にした現在の判定は Firefox に対して false negative になる。

### 再現手順

Firefox で `simulcast: true` の送信接続を行うと、DevTools のコンソールに `Simulcast can not be used with this browser` が出力される。Firefox 158.0.1 の `RTCRtpSender.getCapabilities("video").headerExtensions` に rid 系の URI が含まれないことを確認済み。

## 設計方針

- `enabledSimulcast()` から `REQUIRED_HEADER_EXTENSIONS` と `headerExtensions` の判定を削除する
- `window.RTCRtpSender`、`RTCRtpSender.getCapabilities`、`RTCRtpSender.getCapabilities("video")` の存在チェックは残し、API 自体が無い環境では従来どおり `false` を返す
- Firefox 固有の分岐 (`isFirefox()`) は追加しない。`getCapabilities` のヘッダ拡張リストは実装依存で不完全になり得るため、ヘッダ拡張リストを simulcast 可否の根拠にしない方針とする
- `createSignalingMessage()` のエラー条件は変えず、`enabledSimulcast()` の内部判定だけを変える
- Sora と接続したときの `setSenderParameters()` の encodings 制約など、判定以外の要因で追加の不具合が見つかった場合は本 issue には含めず、別 issue として切り出す

## 完了条件

- Firefox で `simulcast: true` を指定した送信接続時に `Simulcast can not be used with this browser` が throw されない
- Chrome / Edge / Safari の既存 simulcast E2E が退行なく pass する
- `vp run build` / `vp check` / `vp test run` が pass する
- Firefox と Sora の実接続でどこまで動作するかを確認し、結果 (r0 / r1 / r2 の送出状況、signaling のエラー有無、追加で判明した問題) を issue または PR 本文に記録する
- `CHANGES.md` の `## develop` に `[FIX] Firefox で simulcast を利用可能と判定する` を追記する

## 関連 issue

- pending 0014: `setSenderParameters()` の encodings と Firefox の `InvalidModificationError` に関する懸念。実接続検証で顕在化した場合は 0014 の対応として扱う
- open 0116: Firefox E2E の基盤整備。本 issue の確認は runner 整備前のため手動で行う
- 0040: `Sora.getCapabilities()` API の設計。Firefox を simulcast 可能とする判定結果を公開 API に反映するかは 0040 の範囲
