# 変更履歴

- UPDATE
    - 下位互換がある変更
- ADD
    - 下位互換がある追加
- CHANGE
    - 下位互換のない変更
- FIX
    - バグ修正

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

