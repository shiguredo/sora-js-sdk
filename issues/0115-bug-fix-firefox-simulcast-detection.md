# Firefox で simulcast を利用可能と判定する

- Created: 2026-10-21
- Completed: 2026-10-22
- Branch: feature/fix-firefox-simulcast-detection
- Polished: 2026-10-21

## 目的

Firefox は rid ベースの simulcast を SDP で扱えるが、SDK の `enabledSimulcast()` が `RTCRtpSender.getCapabilities("video").headerExtensions` の内容で判定するため、Firefox では常に simulcast 非対応と判定され `Simulcast can not be used with this browser` が throw される。Firefox でも simulcast を利用可能と判定できるようにし、Firefox と Sora での動作検証を可能にする。

## 現状

`src/utils.ts` の `enabledSimulcast()` は次の 3 つを `REQUIRED_HEADER_EXTENSIONS` として定義し、`RTCRtpSender.getCapabilities("video").headerExtensions` にすべて含まれる場合のみ `true` を返す。

- `urn:ietf:params:rtp-hdrext:sdes:mid`
- `urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id`
- `urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id`

`src/utils.ts` の `createSignalingMessage()` は、`message.simulcast` が真かつ role が `recvonly` 以外で `enabledSimulcast()` が偽のとき `Simulcast can not be used with this browser` を throw する。

Firefox の `RTCRtpSender.getCapabilities("video").headerExtensions` は `dom/media/webrtc/jsapi/PeerConnectionImpl.cpp` の `PeerConnectionImpl::GetDefaultRtpExtensions` が構築するデフォルトのリストから作られており、mid や abs-send-time、toffset、TWCC などは含まれるが rid 系は含まれない。このため Firefox では `enabledSimulcast()` が常に偽になる。

一方、Firefox の JSEP は `dom/media/webrtc/jsep/JsepSessionImpl.cpp` の `JsepSessionImpl::GetRtpExtensions` で、`a=rid` がある m-section に対して `urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id` の `a=extmap` を動的に追加する。RTX が有効な場合は `repaired-rtp-stream-id` も追加する。

Firefox は SDP レベルでは rid ベース simulcast を扱えるため、`getCapabilities` のヘッダ拡張リストだけを根拠にした現在の判定は Firefox に対して false negative になる。

### 再現手順

Firefox で `simulcast: true` の送信接続を行うと、`createSignalingMessage()` が `Simulcast can not be used with this browser` を throw し、`connect()` の Promise が同じエラーで reject される。呼び出し側で catch しない場合は DevTools に unhandled rejection として表示される。

Firefox 158.0.1 の `RTCRtpSender.getCapabilities("video").headerExtensions` に rid 系の URI が含まれないことは、`FIREFOX_158_0_1_RELEASE` の `PeerConnectionImpl::GetDefaultRtpExtensions` で確認済み。

## 設計方針

- `enabledSimulcast()` から `REQUIRED_HEADER_EXTENSIONS` と `headerExtensions` の判定を削除する
- `window.RTCRtpSender` と `RTCRtpSender.getCapabilities` の存在チェックは残し、API 自体が無い環境では従来どおり `false` を返す
- `RTCRtpSender.getCapabilities("video")` の戻り値が `null` でないことのチェックは、実質的に常に true となり判定の根拠にならないため削除する
- Firefox 固有の分岐 (`isFirefox()`) は追加しない。`getCapabilities` のヘッダ拡張リストは実装依存で不完全になり得るため、ヘッダ拡張リストを simulcast 可否の根拠にしない方針とする
- `createSignalingMessage()` のエラー条件は変えず、`enabledSimulcast()` の内部判定だけを変える
- Sora と接続したときの `setSenderParameters()` の encodings 制約など、判定以外の要因で追加の不具合が見つかった場合は本 issue には含めず、別 issue として切り出す

## 完了条件

- Firefox で `simulcast: true` を指定した送信接続時に、`createSignalingMessage()` が `Simulcast can not be used with this browser` を throw せず、`connect()` が同じエラーで reject されない
- Chromium / Google Chrome / Google Chrome Beta の既存 simulcast E2E (`e2e-tests/tests/simulcast_rid.test.ts`、`e2e-tests/tests/rpc.test.ts`、`e2e-tests/tests/authz_simulcast_encodings.test.ts`) が退行なく pass する
- WebKit の既存 simulcast E2E (`e2e-tests/tests/webkit.test.ts` の `test.fail("WebKit Authz simulcast_encodings ScaleResolutionDownTo")`) が引き続き期待どおり失敗し、suite が pass する
- Edge は CI matrix で一時的に無効化されているため、ローカルで `e2e-test-edge` を実行して退行がないことを確認する
- `vp run build` / `vp check` / `vp test run` が pass する
- Firefox と Sora の実接続でどこまで動作するかを確認し、結果 (r0 / r1 / r2 の送出状況、signaling のエラー有無、追加で判明した問題) を issue または PR 本文に記録する
- `CHANGES.md` の `## develop` に `[FIX] Firefox で simulcast を利用可能と判定する` を追記する。`shiguredo-changelog` に従い、担当者行 (`- @ユーザー名`) を 2 文字インデントで付ける

## 関連 issue

- pending 0014: `setSenderParameters()` の encodings と Firefox の `InvalidModificationError` に関する懸念。実接続検証で顕在化した場合は 0014 の対応として扱う
- open 0116: Firefox E2E の基盤整備。本 issue の確認は runner 整備前のため手動で行う
- 0040: `Sora.getCapabilities()` API の設計。Firefox を simulcast 可能とする判定結果を公開 API に反映するかは 0040 の範囲

## 解決方法

`src/utils.ts` の `enabledSimulcast()` から `REQUIRED_HEADER_EXTENSIONS` と `RTCRtpSender.getCapabilities("video").headerExtensions` の内容による判定を削除し、`window.RTCRtpSender` と `RTCRtpSender.getCapabilities` が存在する環境を simulcast 可能と判定するように変更した。`RTCRtpSender.getCapabilities("video")` の戻り値が `null` でないことのチェックは、実質的に常に true となり判定の根拠にならないため削除した。

- `src/utils.ts` の `enabledSimulcast()` を API の存在チェックだけに変更する
- `tests/utils.test.ts` に simulcast 非対応環境のフォールバック経路 (sendonly は throw、recvonly は throw しない) のテストを追加する
- `CHANGES.md` の `## develop` に `[FIX]` エントリを追加する

### 検証結果

- `vp run build` / `vp check` / `vp test run` は pass した
- Firefox 158.0.1 の実機で `RTCRtpSender.getCapabilities("video").headerExtensions` に rid 系の URI が含まれないことを確認した
- 同じ Firefox で、変更前は `Simulcast can not be used with this browser` で停止していた simulcast 送信接続が、変更後は接続に成功し r0 / r1 / r2 の outbound-rtp が送出されることを確認した
- Chromium / Google Chrome / Google Chrome Beta で `simulcast_rid.test.ts` / `rpc.test.ts` / `authz_simulcast_encodings.test.ts` が pass した
- WebKit で `webkit.test.ts` が期待どおりの失敗を含めて pass した
- Edge は確認に使用した macOS 27 環境で安定版 Edge が起動できずローカルでは確認できなかった。CI の e2e-test-canary で Edge Canary の E2E を確認する
