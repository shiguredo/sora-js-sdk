# 変更履歴

- UPDATE
  - 後方互換がある変更
- ADD
  - 後方互換がある追加
- CHANGE
  - 後方互換のない変更
- FIX
  - バグ修正

## develop

- [CHANGE] dist/ ディレクトリはリポジトリに含めないようにする
  - 含めてもあまりメリットがない割に手間が増えるので削除してしまう
  - @sile

- [FIX] ユーザが直接使わない型には @internal を指定して .d.ts に含まれないようにする
    - sora-js-sdk 内部で使われている E2EE と Lyra 関連の型が生成される .d.ts ファイルに含まれないようにする
    - これによって sora-js-sdk の利用者は tsconfig.json に `skipLibCheck: true` を指定せずともコンパイルができるようになる
    - @sile

- [CHANGE] vitest 化
  - jest をやめる
  - @voluntas

- [CHANGE] pnpm 化
  - npx 利用をやめる
  - @voluntas

## 2023.1.0

**2023-06-20**

- [ADD] 接続オプションとしてビデオコーデック用パラメータの送信を追加
  - `ConnectionOptions` 型に `videoVP9Params` `videoH264Params` `videoAV1Params` フィールドを追加
  - @tnamao
- [ADD] GitHub Actions に Node.js 20 を追加する
  - @voluntas
- [UPDATE] TypeScript を 5 系に上げる
  - @voluntas
- [UPDATE] 接続オプションで転送フィルターを指定できるようにする
  - `ConnectionOptions` 型に `forwardingFilter` フィールドを追加
  - @sile
- [UPDATE] SDP の再利用に対応する
  - 主に Lyra 周りで同じ mid の使い回しを考慮していないところがあったのを修正
  - @sile
- [UPDATE] オファー SDP のメディアポートに 0 を指定することで古いトランシーバーを解放できるようにする
  - Firefox は 0 ポートを指定するとエラーになるので SDK 側で従来の 9 に置換している
  - @sile
- [UPDATE] .github 以下に renovate.json を移動する
  - @voluntas
- [UPDATE] Safari / Mobile Safari で Lyra コーデックを使用可能にする
  - これらのブラウザでは WebRTC Encoded Transform を使うようにする
  - @sile
- [UPDATE] @shiguredo/lyra-wasm を 2023.1.0 に更新する
  - Web Worker 対応と Mobile Safari 対応の取り込み
  - @sile
- [CHANGE] .prettierrc を統一する
  - @voluntas
- [CHANGE] サンプルのチャネル ID を sora に変更する
  - @voluntas

## 2022.3.3

- [FIX] npm 最新バージョンへのリリースミスを修正
  - @voluntas

## 2022.3.2

- [FIX] ミュート状態で接続すると、replace(Video|Audio)Track しても画像・音声データが送信されないのを修正
  - @melpon

## 2022.3.1

- [FIX] e2ee が有効で無い場合の判定は null かどうかに修正する
  - @voluntas

## 2022.3.0

- [UPDATE] E2EE 有効時に Lyra コーデックを使用可能にする
  - @sile

## 2022.2.0

- [ADD] audioCodecType に "LYRA" を追加
  - 注意: 現時点では Lyra コーデックと E2EE の併用はできず、両方が指定された場合には E2EE が優先される
  - @sile
- [ADD] Sora.initLyra() 関数を追加
  - Lyra でエンコードされた音声を送信ないし受信する場合には、事前にこの関数を呼び出しておく必要がある
  - wasm やモデルファイルのダウンロードは実際に必要になったタイミングで遅延して行われる
  - @sile
- [ADD] ConnectOptions に audioLyraParamsUsedtx を追加
  - @sile
- [ADD] ConnectOptions に audioLyraParamsBitrate を追加
  - @sile
- [ADD] audio_streaming_language_code を追加
  - @melpon
- [CHANGE] ts-jest を @swc/jest に変更する
  - @voluntas
- [CHANGE] サンプルの sora-e2ee-wasm のダウンロード先を変更する
  - @voluntas
- [CHANGE] sora.min.js を削除する
  - @yuitowest
- [FIX] 廃止になった opus_params の clock_rate を削除する
  - @voluntas

## 2022.1.0

- [CHANGE] 切断処理時に MediaStream の停止処理をしないように変更する
  - @yuitowest
- [CHANGE] ConnectionOptions からシグナリング type: connect メッセージを生成する仕組みを変更する
  - multistream オプションが false の場合、シグナリングメッセージに multistream: false を含めるように変更する
  - spotlight オプションは multistream: true の場合のみシグナリングメッセージに含まれていたが、multistream フラグに関係なく含まれるように変更する
  - spotlightFocusRid オプションは spotlight: true の場合のみシグナリングメッセージに含まれていたが、spotlight フラグに関係なく含まれるように変更する
  - spotlightUnfocusRid オプションは spotlight: true の場合のみシグナリングメッセージに含まれていたが、spotlight フラグに関係なく含まれるように変更する
  - spotlightNumber オプションは spotlight: true の場合のみシグナリングメッセージに含まれていたが、spotlight フラグに関係なく含まれるように変更する
  - simulcastRid オプションは simulcast: true の場合のみシグナリングメッセージに含まれていたが、simulcast フラグに関係なく含まれるように変更する
  - @yuitowest
- [ADD] sendrecv オブジェクトのオプションに bundle_id を追加する
  - @yuitowest
- [UPDATE] sendrecv API を使用して接続する場合に multistream option の初期値が true になるよう修正する
  - @yuitowest
- [UPDATE] sendrecv API を使用して multistream: false で接続した場合、Sora との接続前に例外が発生するように修正する
  - @yuitowest
- [UPDATE] パッケージを更新する
  - fflate "0.7.1" -> "0.7.2"
  - typescript "4.4.3" -> "4.5.4"
  - @yuitowest
- [CHANGE] connectedSignalingUrl は現在接続中の WebSocket の URL ではなく type offer メッセージを受信した URL を返すようにする
  - ignoreDisconnectWebSocket を使用して WebSocket を切断した場合にも URL を返すように修正する
  - @yuitowest
- [UPDATE] SendRecv オブジェクト に contactSignalingUrl プロパティを追加する
  - @yuitowest

## 2021.2.3

- [FIX] メッセージング機能で文字列データが送信されてきた場合にそのまま message callback に渡していた問題を修正する
  - @yuitowest

## 2021.2.2

- [FIX] fflate package のバージョンを 0.7.1 から 0.7.3 に更新する
  - 0.7.3 https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md#073
  - 0.7.2 https://github.com/101arrowz/fflate/blob/master/CHANGELOG.md#072
  - @yuitowest

## 2021.2.1

- [FIX] type redirect 時のシグナリングで接続エラーになった場合、例外が発火しなかった問題を修正する
  - @yuitowest

## 2021.2.0

- [UPDATE] simulcast 時の transceiver 判定条件に offer.mids.video での分岐を追加する
  - @yuitowest
- [UPDATE] 複数パッケージの管理を lerna から npm workspace に変更する
  - @yuitowest
- [ADD] DataChannel メッセージング機能を追加する
  - sendrecv オブジェクトのオプションに datachannels を追加する
  - sendrecv オブジェクトに sendMessage API を追加する
  - sendrecv オブジェクトに datachannels プロパティを追加する
  - on callback に "message" を追加する
  - on callback に "datachannel" を追加する
  - @yuitowest
- [CHANGE] 複数 Signaling URL への接続に対応する
  - Connection オブジェクト第一引数の type を `string` から `string | string[]` に変更する
  - Connection オブジェクト signalingUrl プロパティの戻り値の type を `string` から `string | string[]` に変更する
  - SendRecv オブジェクト signalingUrl プロパティの戻り値の type を `string` から `string | string[]` に変更する
  - Connection オブジェクトに signalingUrlCandidates プロパティを追加する
  - SendRecv オブジェクト に signalingUrlCandidates プロパティを追加する
  - SendRecv オブジェクト に connectedSignalingUrl プロパティを追加する
  - SendRecv オブジェクト に signalingCandidateTimeout オプションを追加する
  - @yuitowest
- [UPDATE] type redirect 対応を追加する
  - @yuitowest
- [CHANGE] spotlight_legacy 対応を削除する
  - ConnectionOptions の spotlight オプションの型を boolean のみに変更する

## 2021.1.7

- [ADD] SoraCloseEvent 関連の type を export する
  - @yuitowest

## 2021.1.6

- [FIX] timeline ログに re-answer のログが出力されていなかったので修正する
  - @yuitowest
- [UPDATE] timeline ログの ontrack ログに詳細情報を追加する
  - @yuitowest

## 2021.1.5

- [FIX] dataChannelSignaling false の場合に Disconnect API 経由で切断すると disconnect callback が発火しない問題を修正する
  - @yuitowest
- [UPDATE] 非同期で disconnect を複数回呼んだ場合の処理を修正する
  - @yuitowest

## 2021.1.4

- [FIX] DataChannel 切断のタイムアウト処理中に WebSocket が切断すると Uncaught (in promise) が発生する問題を修正する
  - @yuitowest
- [UPDATE] 切断処理中の WebSocket の onclose タイムラインログに code と reason を入れるようにする
  - @yuitowest

## 2021.1.3

- [FIX] DataChannel 切断処理を修正する
  - 切断タイムアウト処理時にすでに DataChannel の readyState が "closed" 状態であれば onclose を待たないように修正する
  - @yuitowest

## 2021.1.2

- [CHANGE] disconnect API を修正する
  - type: disconnect メッセージに reason を追加するように修正する
  - @yuitowest
- [CHANGE] disconnect callback を修正する
  - disconnect callback が受け取る event を CloseEvent から SoraCloseEvent に変更する
  - disconnect callback が受け取る event の type は "close" のみから "normal" か "abend" のどちらかが返るように変更する
  - disconnect callback が受け取る event の code, reason は undefined のパターンを追加する
  - disconnect callback が受け取る event に title を追加する
  - disconnect callback が受け取る event に params を追加する
  - @yuitowest
- [CHANGE] connect signaling 時の意図しない WebSocket の切断時のメッセージを統一する
  - "Signaling failed. {reason}" に統一する
  - @yuitowest
- [CHANGE] timeline callback Event の property を変更する
  - transportType を logType に変更する
  - @yuitowest
- [CHANGE] signaling callback Event の property を変更する
  - transportType は必須項目にする
  - @yuitowest
- [UPDATE] PeerConnecion の状態が不正な場合に切断処理に入るようにする
  - PeerConnecion connectionState が "failed" になった場合は切断する
  - PeerConnecion connectionState が undefined の場合 iceConnectionState が "disconnect" になって 1000ms 変化がない場合は切断する
  - @yuitowest
- [UPDATE] 型を export する
  - @yuitowest

## 2021.1.1

- [FIX] 接続処理が途中で失敗した場合の timeline ログに connected のログが出力されていた問題を修正する
  - @yuitowest

## 2021.1.0

- [CHANGE] fflate を導入して DataChannel zlib 対応を追加する
  - @yuitowest
- [ADD] get audio, get video を追加して接続がそれぞれに対応しているかを返すようにする
  - @yuitowest
- [ADD] stopAudioTrack, stopVideoTrack, replaceAudioTrack, replaceVideoTrack を追加する
  - @yuitowest
- [CHANGE] timeout option を connectionTimeout option に名前を変更する
  - timeout option を使用している場合は deprecated warning が出るように変更
  - @yuitowest
- [CHANGE] Notify callback, Push callback の第二引数に TransportType を追加する
  - @yuitowest
- [CHANGE] role から upstream と downstream を削除する
  - @voluntas
- [CHANGE] publisher と subscriber を削除する
  - @voluntas
- [CHANGE] helper メソッドを追加
  - @yuitowest
- [CHANGE] シグナリングメッセージに型定義を追加
  - @yuitowest
- [CHANGE] 型定義の修正
  - Callbacks の各 callback 型定義を Function から適切なものに修正する
  - on メソッドに渡す第 2 引数の型定義を適切なものに修正する
  - trace メソッドに渡す第 3 引数の型定義を any から unknown に変更する
  - @yuitowest
- [CHANGE] packages 以下の npm-client を yarn にする
  - @yuitowest
- [ADD] packages:upgrade コマンドを追加する
  - @yuitowest
- [ADD] Switch DataChannel を実装する
  - ConnectionOptions に dataChannelSignaling を追加する
  - ConnectionOptions に ignoreDisconnectWebSocket を追加する
  - @yuitowest
- [ADD] ConnectionOptions に spotlightFocusRid / spotlightUnfocusRid を追加する
  - @yuitowest
- [UPDATE] パッケージを更新する
  - typescript を 3 系から 4 系に変更
  - @yuitowest
- [UPDATE] サイマルキャストのサンプルを low / middle / high から r0 / r1 / r2 へ変更する
  - @voluntas

## 2020.6.2

- [FIX] simulcast が使用できるかどうかの判定を修正する
  - UserAgent を用いた判定から RTCRtpSender.getCapabilities を用いた判定に変更
  - @yuitowest

## 2020.6.1

- [FIX] simulcast 時に setParameters するための RTCRtpTransceiver 検索条件を変更する
  - getUserMedia constraints の audio/video と Sora signaling の audio/video が一致しなかった場合に `DOMException: Read-only field modified in setParameters().` が発生する
  - encodings が readonly な RTCRtpSender を持つ RTCRtpTransceiver を検索条件から除外して対応
  - @yuitowest

## 2020.6.0

- [UPDATE] e2ee 処理で signaling notify 時に metadata / authn_metadata どちらでも動作するように修正する
  - @yuitowest
- [UPDATE] connect 時の例外に code と reason を含めるようにする
  - WebSocket の onclose が発火した場合のみ Error オブジェクトに close event の code と reason を含める
  - @yuitowest
- [FIX] type offer 時に受け取った encodings を type update 時にも setParametes するように修正する
  - @yuitowest

## 2020.5.0

- [UPDATE] clientId option に空文字列を渡せるように修正する
  - @yuitowest
- [CHANGE] オプションの e2ee を boolean のみに変更する
  - @yuitowest
- [UPDATE] sora-e2ee パッケージを内包するように変更する
  - lerna を使って複数 package を管理するようにする
  - sdk package を作成して既存コードを sdk package 内へ移動する
  - e2ee package を作成して sora-e2ee コードを移植する
  - go-wasm package を作成して wasm_exec.js コードを内包する
  - @yuitowest
- [CHANGE] simulcastQuality を simulcastRid に変更する
  - @voluntas
- [CHANGE] simulcast を bool のみに変更する
  - @voluntas
- [CHANGE] simulcast_rid を追加する
  - @voluntas

## 2020.4.2

- [FIX] metadata に直接 undefined を渡せるように修正する
  - @yuitowest

## 2020.4.1

- [FIX] timeout option を設定時に特定の条件で正しく動かない問題を修正する
  - peerconnection connectionState が undefined の場合に timeout error が強制的に発動してしまう
  - peerconnection 接続前に timeout の時間に到達した場合 timeout error が発動しない
  - @yuitowest

## 2020.4.0

- [CHANGE] signaling 時に処理に失敗した場合の reject の引数を CloseEvent オブジェクトから Error オブジェクトに変更する
  - @yuitowest
- [CHANGE] connect() のタイムアウト処理にデフォルト値を設定する
  - 60000 ms でタイムアウトするように設定する
  - @yuitowest
- [UPDATE] connect() 実行時に PeerConnection connectionState が 'connected' になったら処理が完了するように変更する
  - @yuitowest
- [UPDATE] disconnect 処理を修正する
  - websocket で type: "disconnect" を send するように変更する
  - websocket の readyState の監視をやめる
  - peerConnection の 切断監視を signalingState から connectionState に変更する
  - @yuitowest
- [UPDATE] sora-e2ee のバージョンを 2020.3.0 に更新する
  - @yuitowest
- [FIX] `package.json` に定義されている `module` の向き先を `dist/sora.mjs` に変更し、対象ファイルがビルドされるよう Rollup の設定を追加する
  - https://github.com/shiguredo/sora-js-sdk/pull/44
  - @rosylilly
- [UPDATE] simulcast で active パラメーターを有効にするための実装を追加する
  - @yuitowest

## 2020.3.0

- [UPDATE] Safari 14 以降で Simulcast が使えるように変更
  - @yuitowest

## 2020.2.0

- [UPDATE] sora-e2ee を 2020.2.0 に上げる
  - @voluntas
- [FIX] disconnect() を複数回実行した場合に例外が発生しないようにする
  - @yuitowest
- [UPDATE] 新スポットライトに対応する
  - ConnectionOptions に spotlightNumber を追加する
  - ConnectionOptions の spotlight に boolean を受け取れるよう修正する
  - @yuitowest

## 2020.1.5

- [FIX] metadata が undefined の場合以外は signaling connect message に metadata を含めるように変更
  - @yuitowest

## 2020.1.4

- [UPDATE] type.ts にある type Json のインデックスシグネチャに undefined を許可する
  - @yuitowest

## 2020.1.3

- [CHANGE] type.ts にある Audio, Video をそれぞれ SignalingAudio, SignalingVideo に名前変更する
  - @yuitowest
- [ADD] SoraConnection の型定義を export する
  - @yuitowest
- [ADD] sendrecv, sendonly, recvonly の引数に渡す options に signalingNotifyMetadata を追加する
  - @yuitowest

## 2020.1.2

- [FIX] sendrecv, sendonly, recvonly の引数に渡す metadata の型を Json に変更
  - @yuitowest
- [FIX] authMetadata の型を Json に変更
  - @yuitowest

## 2020.1.1

- [UPDATE] type export を追加
  - AudioCodecType, Callbacks, ConnectionBase, ConnectionOptions, ConnectionPublisher, ConnectionSubscriber, Role, SimulcastQuality, VideoCodecType の型定義を export する
  - @yuitowest

## 2020.1

- [UPDATE] E2EE 対応
  - @yuitowest
- [UPDATE] TypeScript 化
  - @yuitowest
- [UPDATE] async / await 化
  - @yuitowest
- [ADD] Sora から `type: ping` が送られてきた際に `stats: true` だった場合 `type: pong` 送信時に `stats` に getStats の結果を入れる
  - @yuitowest @voluntas
- [CHANGE] @deprecated メッセージを追加する
  - publisher/subscriber を使用している場合に warning を出すように変更する
  - addstream/removestream を使用している場合に warning を出すように変更する
  - debug: true 時に disconnect の MediaStream close 処理で warning を出すように変更する
  - @yuitowest
- [CHANGE] property 名の変更とアクセス制限の追加する
  - `_pc` を `pc` に名前変更する
  - `_ws` を `ws` に名前変更してアクセス制限を protected に変更する
  - `_callbacks` を `callbacks` に名前変更してアクセス制限を protected に変更
  - @yuitowest
- [CHANGE] method 名の変更とアクセス制限の追加する
  - _ がついているメソッド名から _ を削除してアクセス制限を追加する
  - @yuitowest

## 1.16.0

- [UPDATE] サンプルで利用する role を新しいものに変更する
  - @voluntas
- [ADD] タイムアウトを指定可能にする
  - デフォルトではタイムアウトは有効にはなっていない
  - @yuitowest
- [ADD] 新しい role である sendrecv / sendonly / sendrecv を利用できるようにする
  - @voluntas
- [ADD] サンプルに multsitream_sendonly.html を追加する
  - @voluntas
- [CHANGE] サンプルの multistream.html を multistream_sendrecv.html に変更する
  - @voluntas
- [CHANGE] サンプルの multistream_down.html を multistream_recvonly.html に変更する
  - @voluntas
- [CHANGE] サンプルの spotlight.html を spotlight_sendrecv.html に変更する
  - @voluntas
- [CHANGE] サンプルの spotlight_down.html を spotlight_recvonly.html に変更する
  - @voluntas
- [CHANGE] サンプルの updown.html を sendonly_recvonly.html に変更する
  - @voluntas
- [CHANGE] sdk_version と sdk_type を廃止し sora_client を追加
  - @voluntas
- [CHANGE] user_agent を廃止し sora_client を追加
  - @voluntas
- [FIX] README から simulcast_rid を削除する
  - @voluntas

## 1.15.0

- [UPDATE] タスクランナーを webpack から rollupjs に変更
  - @yuitowest
- [UPDATE] babel core を 6 から 7 へアップデート
  - @yuitowest
- [ADD] multistream + simulcast に対応する
  - @yuitowest
- [ADD] opus params 関連のオプションを追加する
  - @yuitowest
- [CHANGE] Plan B のコードをすべて削除する
- [CHANGE] ssrc group simulcast のコードをすべて削除する
  - @yuitowest
- [CHANGE] signaling message 作成時のチェックを修正
  - role が 'upstream' または 'downstream' でない場合はエラーになるように修正
  - channelId が null または undefined な場合はエラーになるように修正
  - metadata が null または undefined な場合は signaling message に metadata を含めないように修正
  - @yuitowest

## 1.14.0

- [UPDATE] rid ベース simulcast で replaceTrack を使用しないで addTrack のみで実装する
  - @yuitowest
- [FIX] rid ベース simulcast で音声がでない問題を修正
  - @yuitowest

## 1.13.0

- [ADD] rid ベース simulcast への対応
  - firefox と safari では利用できないようにする
  - @yuitowest
- [CHANGE] userAgent を user_agent に変更する
  - @yuitowest

## 1.12.0

- [UPDATE] example の整理
  - @yuitowest
- [UPDATE] development build 時に sora-js-sdk の version に '-dev' をつけるようにする
  - @yuitowest
- [ADD] Signaling Option に client_id を追加する
  - @yuitowest

## 1.11.0

- [UPDATE] Safari の Unified Plan, Plan B 両方に対応する
  - @yuitowest
- [UPDATE] Simulcast option が使えるブラウザ判定を変更する
  - @yuitowest

## 1.10.2

- [FIX] direction を {direciton: ''} 形式に変更する
  - @yuitowest

## 1.10.1

- [UPDATE] Firefox の Media Panel addon の Media-Webrtc が動作するよう RTCPeerConnection の変数格納を削除する
  - @yuitowest
- [ADD] ConnectionOptions の新しいプロパティに型を追加する

  - @exKAZUu

- [FIX] setDirection を direction に変更する
  - Safari Technology Preview 73 への対応
  - @yuitowest

## 1.10.0

- [UPDATE] simulcast, simulcastQuality オプションを追加
  - @yuitowest

## 1.9.3

- [FIX] Single Stream の subscriber で on('addstream', callback) が発火しない問題を修正する
  - @yuitowest

## 1.9.2

- [UPDATE] package json の文言修正
  - @yuitowest

## 1.9.1

- [UPDATE] Unified Plan の適応を Chrome M71 以降のバージョンに変更する
  - @yuitowest

## 1.9.0

- [ADD] Chrome M68 以降のバージョンの動作変更
  - RTCPeerConnection の config に sdpSemantics: 'unified-plan' を追加
  - signaling message に plan_b: true オプションを渡さないように修正
  - @yuitowest
- [CHANGE] snapshot 関連を削除
  - @yuitowest
- [FIX] ontrack で stream が取得できなかった場合のエラーを修正する
  - @yuitowest

## 1.8.2

- [CHANGE] vad を spotlight に変更する
  - @yuitowest

## 1.8.1

- [FIX] addTransceiver を使うのは safari の場合だけにする
  - @yuitowest
- [FIX] pc が null の場合は reject するように修正する
  - @yuitowest

## 1.8.0

- [UPDATE] signaling connect 時のパラメータに vad を追加する
  - @yuitowest
- [ADD] auth metadata を参照できるように修正する
  - @yuitowest

## 1.7.7

- [UPDATE] example を修正する
  - @yuitowest
- [FIX] disconnect 時に Safari では PeerConnection Closing Error が出る問題を修正する
  - @yuitowest
- [FIX] subscriber multistream 時に Chrome では remoteClientIds が更新されていなかった問題を修正する
  - @yuitowest
- [FIX] disconnect 時に remote 接続の clientId リストを初期化するように修正する
  - @yuitowest
- [FIX] disconnect 時に peerConnection の oniceconnectionstatechange を初期化するように修正する
  - @yuitowest

## 1.7.6

- [FIX] multistream subscriber 利用時に ontrack が video でしか発火しなかったのを修正する
  - @yuitowest
- [FIX] multistream subscriber 利用時に onremovestream を ontrack の動作に合わせる
  - @yuitowest

## 1.7.5

- [CHANGE] offer 作成用の peerConnection を close するように修正する
  - @yuitowest

## 1.7.4

- [UPDATE] signaling connect 時のパラメータに UserAgent を追加する
  - @yuitowest
- [CHANGE] publisher, subscriber の引数の options に渡したオブジェクトの value 値が null の場合は処理しないように修正する
  - @yuitowest

## 1.7.3

- [UPDATE] Firefox で icecandidate に時間がかかる問題を修正する
  - @yuitowest

## 1.7.2

- [UPDATE] 最新の Edge に対応する
- [FIX] signaling offer 時の message に config が含まれていない場合の処理を追加する
  - @yuitowest

## 1.7.1

- [UPDATE] signaling connect 時のパラメータに sdp を追加する
  - @yuitowest

## 1.7.0

- [ADD] event type に log を追加する
- [FIX] disconnect を同時に複数回呼ぶとエラーになる問題を修正する
  - @yuitowest

## 1.6.1

- [ADD] RTCPeerConnection の引数に MediaConstraints を渡せるようにする
  - @yuitowest

## 1.6.0

- [ADD] Publisher と Subscriber の options に AudioBitRate を追加する
  - @yuitowest

## 1.5.0

- [UPDATE] パッケージの更新
  - @yuitowest
- [CHANGE] Signaling 時の WebSocket onerror では reject しないようにする
  - @yuitowest

## 1.4.1

- [FIX] Signaling message の metadata が旧仕様(access_token)のままだったので修正する
  - @yuitowest

## 1.4.0

- [ADD] Signaling notify 用の callback を追加できるように変更する
  - @yuitowest

## 1.3.0

- [UPDATE] Safari に対応する
  - @yuitowest

## 1.2.0

- [ADD] Subscriber の multistream に対応する
  - @yuitowest
- [CHANGE] iceServers が指定されていない場合に 'stun:stun.l.google.com:19302' を使用していたのをやめる
  - @yuitowest

## 1.1.0

- [UPDATE] Microsoft Edge に対応する
  - @yuitowest

## 1.0.0

- [CHANGE] PeerConnection まで含めた処理を SDK で実行するように変更する
  - @yuitowest
- [CHANGE] multistream をパラメーターに追加する
  - @yuitowest
- [CHANGE] videoSnapshot をパラメーターに追加する
  - @yuitowest
- [CHANGE] videoBitRate をパラメーターに追加する
  - @yuitowest
- [CHANGE] audioCodecType をパラメーターに追加する
  - @yuitowest
- [CHANGE] codecType を videoCodecType に変更する
  - @yuitowest

## 0.5.0

- [UPDATE] シグナリングメッセージのキー名を変更する
  - @yuitowest
- [CHANGE] codecType のチェックをしないようにする
  - @yuitowest

## 0.4.2

- [UPDATE] ドキュメントを修正する
  - @yuitowest

## 0.4.1

- [UPDATE] ドキュメントを修正する
  - @yuitowest

## 0.4.0

- [UPDATE] codecType が選択できるように修正する
  - @yuitowest
- [UPDATE] パッケージの更新
  - @yuitowest
- [UPDATE] ビルドの仕組みを変更する
  - @yuitowest

## 0.3.2

- [UPDATE] パッケージの更新
  - @yuitowest

## 0.3.1

- [UPDATE] signaling 時に WS が切断した場合、ステータスコードが 440x だったら Promise.reject するように変更する
  - @yuitowest

## 0.3.0

- [ADD] disconnect を追加する
  - @yuitowest

## 0.2.0

- [CHANGE] constructor の引数に URL 文字列を受け取る用に修正する
  - @yuitowest
- [CHANGE] package name を sora.js から sora-js-sdk に変更する
  - @yuitowest
- [CHANGE] Promise 化する
  - @yuitowest
- [FIX] PeerConnection Object が GC の対象にならないように修正する
  - @yuitowest

## 0.1.0

**公開**
