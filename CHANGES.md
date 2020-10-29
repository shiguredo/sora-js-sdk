# 変更履歴

- UPDATE
    - 下位互換がある変更
- ADD
    - 下位互換がある追加
- CHANGE
    - 下位互換のない変更
- FIX
    - バグ修正

## develop

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

