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

## 1.9.0
- [ADD] Chrome M68 以降のバージョンの動作変更
    - RTCPeerConnection の config に sdpSemantics: 'unified-plan' を追加
    - signaling message に plan_b: true オプションを渡さないように修正
- [CHANGE] snapshot 関連を削除
- [FIX] ontrack で stream が取得できなかった場合のエラーを修正する

## 1.8.2
- [CHANGE] vad を spotlight に変更する

## 1.8.1
- [FIX] addTransceiver を使うのは safari の場合だけにする
- [FIX] pc が null の場合は reject するように修正する

## 1.8.0
- [ADD] auth metadata を参照できるように修正する
- [UPDATE] signaling connect 時のパラメータに vad を追加する

## 1.7.7
- [UPDATE] example を修正する
- [FIX] disconnect 時に Safari では PeerConnection Closing Error が出る問題を修正する
- [FIX] subscriber multistream 時に Chrome では remoteClientIds が更新されていなかった問題を修正する
- [FIX] disconnect 時に remote 接続の clientId リストを初期化するように修正する
- [FIX] disconnect 時に peerConnection の oniceconnectionstatechange を初期化するように修正する

## 1.7.6
- [FIX] multistream subscriber 利用時に ontrack が video でしか発火しなかったのを修正する
- [FIX] multistream subscriber 利用時に onremovestream を ontrack の動作に合わせる

## 1.7.5
- [CHANGE] offer 作成用の peerConnection を close するように修正する

## 1.7.4
- [UPDATE] signaling connect 時のパラメータに UserAgent を追加する
- [CHANGE] publisher, subscriber の引数の options に渡したオブジェクトの value 値が null の場合は処理しないように修正する

## 1.7.3
- [UPDATE] Firefox で icecandidate に時間がかかる問題を修正する

## 1.7.2
- [UPDATE] 最新の Edge に対応する
- [FIX] signaling offer 時の message に config が含まれていない場合の処理を追加する

## 1.7.1
- [UPDATE] signaling connect 時のパラメータに sdp を追加する

## 1.7.0
- [ADD] event type に log を追加する
- [FIX] disconnect を同時に複数回呼ぶとエラーになる問題を修正する

## 1.6.1
- [ADD] RTCPeerConnection の引数に MediaConstraints を渡せるようにする

## 1.6.0
- [ADD] Publisher と Subscriber の options に AudioBitRate を追加する

## 1.5.0
- [CHANGE] Signaling 時の WebSocket onerror では reject しないようにする
- [UPDATE] パッケージの更新

## 1.4.1
- [FIX] Signaling message の metadata が旧仕様(access_token)のままだったので修正する

## 1.4.0
- [ADD] Signaling notify 用の callback を追加できるように変更する

## 1.3.0
- [UPDATE] Safari に対応する

## 1.2.0
- [ADD] Subscriber の multistream に対応する
- [CHANGE] iceServers が指定されていない場合に 'stun:stun.l.google.com:19302' を使用していたのをやめる

## 1.1.0

- [UPDATE] Microsoft Edge に対応する

## 1.0.0

- [CHANGE] PeerConnection まで含めた処理を SDK で実行するように変更する
- [CHANGE] multistream をパラメーターに追加する
- [CHANGE] videoSnapshot をパラメーターに追加する
- [CHANGE] videoBitRate をパラメーターに追加する
- [CHANGE] audioCodecType をパラメーターに追加する
- [CHANGE] codecType を videoCodecType に変更する

## 0.5.0

- [CHANGE] codecType のチェックをしないようにする
- [UPDATE] シグナリングメッセージのキー名を変更する

## 0.4.2

- [UPDATE] ドキュメントを修正する

## 0.4.1

- [UPDATE] ドキュメントを修正する

## 0.4.0

- [UPDATE] codecType が選択できるように修正する
- [UPDATE] パッケージの更新
- [UPDATE] ビルドの仕組みを変更する

## 0.3.2

- [UPDATE] パッケージの更新

## 0.3.1

- [UPDATE] signaling 時に WS が切断した場合、ステータスコードが 440x だったら Promise.reject するように変更する

## 0.3.0

- [ADD] disconnect を追加する

## 0.2.0

- [CHANGE] constructor の引数に URL 文字列を受け取る用に修正する
- [CHANGE] package name を sora.js から sora-js-sdk に変更する
- [CHANGE] Promise 化する
- [FIX] PeerConnection Object が GC の対象にならないように修正する

## 0.1.0

**0.1.0 リリース**

