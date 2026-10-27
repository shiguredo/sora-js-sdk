# `e2e-tests/simulcast` に video_codec_type と video_bit_rate の指定 UI を追加する

- Created: 2026-10-27
- Completed: 2026-10-27
- Branch: feature/add-simulcast-video-params-ui
- Polished: 2026-10-27
- Reporter: @miosakuma

## 目的

`e2e-tests/simulcast` は sendonly 側の `videoCodecType` と `videoBitRate` が `VP8` / `1500` に固定されており、画面から変更できない。コーデックやビットレートを変えた simulcast の手動検証・切り分けを行うたびに `main.ts` を編集して再ビルドする必要がある。`e2e-tests/simulcast_sendonly` と同じく画面から指定できるようにし、コーデック別・ビットレート別の確認を再ビルドなしで行えるようにする。

## 現状

- `e2e-tests/simulcast/index.html` には `#video-codec-type` と `#video-bit-rate` が無く、チャンネル名と connect / disconnect / getStats ボタンだけがある
- `e2e-tests/simulcast/main.ts` の `SimulcastSendonlySoraClient` コンストラクタは、`sora.sendonly()` のオプションに `videoCodecType: "VP8"` と `videoBitRate: 1500` を固定値で渡している
- `e2e-tests/tests/simulcast.test.ts` は `video/VP8` のコーデック統計と r0 / r1 / r2 の送出を確認しており、固定値の `VP8` / `1500` で pass している
- `e2e-tests/simulcast_sendonly` / `e2e-tests/simulcast_sendonly_firefox` / `e2e-tests/simulcast_sendonly_webkit` には同等の UI が既にある
  - `simulcast_sendonly_firefox` は未指定を `<option value="">` とし、`getVideoCodecType()` で `undefined` を返して `codec_type` を送らない
  - `simulcast_sendonly` / `simulcast_sendonly_webkit` は未指定を `<option value="undefined">` としており、選択すると文字列 `"undefined"` が `videoCodecType` として渡る

## 設計方針

`simulcast_sendonly` の UI 構成を参考にし、未指定の扱いだけ `simulcast_sendonly_firefox` に揃える。

- `e2e-tests/simulcast/index.html` に `#video-codec-type` セレクトボックスと `#video-bit-rate` 数値入力を追加する
  - `video_codec_type` の選択肢は `simulcast_sendonly` と同じ 未指定 / VP8 / VP9 / AV1 / H264 / H265 とする
  - 未指定は `<option value="">` とし、`getVideoCodecType()` を使って `undefined` として扱う
  - デフォルトは `VP8` と `1500` にする。これは現在の固定値であり、`e2e-tests/tests/simulcast.test.ts` が前提にしている値でもある
- `e2e-tests/simulcast/main.ts` の connect 時に両方の値を読み取り、`SimulcastSendonlySoraClient` のコンストラクタに渡す
  - `videoCodecType` は `getVideoCodecType()` で取得し、`sora.sendonly()` のオプションに設定する
  - `videoBitRate` は `Number.parseInt(value, 10)` で数値化し、`Number.isFinite()` かつ 0 より大きいことを検証してから設定する (不正値を Sora に送らない)
- コーデックはページ表示時ではなく connect 時に読み取る (表示後に変更しても反映されるようにする)
- 指定は sendonly 側だけに適用し、recvonly 側 (r0 / r1 / r2) の挙動は変更しない
- H264 / H265 の simulcast はブラウザと Sora の対応状況に依存するため、ページ側では制限せず、選択した結果のエラーは Sora に委ねる
- `e2e-tests/tests/simulcast.test.ts` はデフォルト値が現行の固定値と同一のため変更しない (テストはデフォルトのまま pass する)

## 完了条件

- `e2e-tests/simulcast/index.html` に `#video-codec-type` と `#video-bit-rate` が追加され、デフォルトが VP8 / 1500 になっている
- connect 時に選択した `video_codec_type` と `video_bit_rate` が `sora.sendonly()` のオプションに渡る
- 未指定を選んだとき `codec_type` がシグナリングに含まれない
- `video_bit_rate` が空・0・負数・非数値のときにエラーになり、接続しない
- `e2e-tests/tests/simulcast.test.ts` が変更なしで pass する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に [ADD] エントリを追加する

## 関連 issue

- closed 0062: `e2e-tests/sendonly` にビデオコーデック指定 UI を追加した
- 0123: WebKit の scaleResolutionDownBy テストで `video_codec_type` と `video_bit_rate` を明示している
- closed 0116 / closed 0118: `simulcast_sendonly_firefox` / `simulcast_sendonly_webkit` のコーデックとビットレートの扱い

## 解決方法

- `e2e-tests/simulcast/index.html` に `#video-codec-type` セレクトボックスと `#video-bit-rate` 数値入力を追加した。コーデックの選択肢は 未指定 / VP8 / VP9 / AV1 / H264 / H265 とし、ページの既定値は従来の固定値と同じ VP8 / 1500 にした。
- `e2e-tests/simulcast/main.ts` で connect 時に `getVideoCodecType()` と `#video-bit-rate` を読み取り、`SimulcastSendonlySoraClient` のコンストラクタに渡すようにした。ビットレートは `Number.parseInt(value, 10)` で数値化し、有限かつ 0 より大きいことを検証してから接続する。
- `SimulcastSendonlySoraClient` で `ConnectionOptions` を組み立て、未指定時は `videoCodecType` を設定しないことで `codec_type` をシグナリングに含めないようにした。
- 再接続時に旧接続を残したまま変数を上書きすると、新しい接続が失敗したときに旧接続への参照を失って解放できなくなるため、connect 時に旧 sendonly / recvonly を切断してから新しいクライアントを生成するようにした。この挙動変更は `CHANGES.md` にも記載した。設計方針の「recvonly 側の挙動は変更しない」はコーデック / ビットレートの適用範囲を指すものと解釈し、再接続時のライフサイクルは全クライアントで揃えている。
- 初回 connect 前や、入力検証・getUserMedia で接続に失敗した後に `#disconnect` / `#get-stats` を押しても例外にならないよう、未初期化ガードを追加した。
- `vp check` / `vp exec tsc --noEmit -p e2e-tests/tsconfig.json` / `vp test run` が pass することを確認した。E2E テストは Sora のテストサーバーが必要なためローカルでは実行していない。既定値を従来と同じにしたため `e2e-tests/tests/simulcast.test.ts` は変更していない。
- `CHANGES.md` の `## develop` の `### misc` に [ADD] エントリを追加した。
