# `removeAudioTrack` / `removeVideoTrack` の 100 ms レース中に `disconnect()` が走ると stream が壊れる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-remove-track-race-with-disconnect

## 目的

`removeAudioTrack` / `removeVideoTrack` は 100 ms の setTimeout 中に `track.stop()` / `stream.removeTrack()` を実行し、その後 `this.pc !== null` のときだけ `sender.replaceTrack(null)` を呼ぶ。100 ms の間に `disconnect()` が走ると `this.pc = null` になり、track は stop 済みなのに sender クリーンアップが行われず、ユーザーの MediaStream から audio / video が永久に消える。`resolve()` は呼ばれるためユーザーは成功と認識する。

## 優先度根拠

High。UI でカメラ ON/OFF を操作するアプリで、操作中にネットワーク断が起きると「カメラが映らなくなった」「マイクが消えた」状態に陥り、`getUserMedia` をやり直さないと復旧できない。

## 現状

`src/base.ts:414-438`（audio）と `:490-515`（video）

```ts
return new Promise((resolve, reject) => {
  setTimeout(() => {
    const promises = stream.getVideoTracks().map(async (track) => {
      track.stop();
      stream.removeTrack(track);
      if (this.pc !== null) {
        const sender = this.pc.getSenders().find(...);
        if (sender) return sender.replaceTrack(null);
      }
    });
    Promise.all(promises).then(resolve).catch(reject);
  }, 100);
});
```

`resolve()` は無条件に呼ばれるが、disconnect 中の経路では sender クリーンアップが抜ける。

## 設計方針

setTimeout コールバック内で `this.pc === null` を検知したら明示的に reject する。あるいは setTimeout 自体を廃止し、より決定的な順序（track の `ended` イベント待ち）に組み替える。100 ms ハードコード自体が premature optimization に近い。

## 完了条件

- 切断中の `removeXxxTrack` 呼び出しが明確なエラーを返す
- 切断中の race で MediaStream が中途半端な状態にならない
- 単体 / E2E で「removeXxxTrack 実行中に disconnect」のシナリオを検証

## 解決方法

```ts
setTimeout(() => {
  if (this.pc === null) {
    reject(new Error("disconnected during removeXxxTrack"));
    return;
  }
  const promises = stream.getXxxTracks().map(async (track) => {
    track.stop();
    stream.removeTrack(track);
    const sender = this.pc.getSenders().find(...);
    if (sender) return sender.replaceTrack(null);
  });
  Promise.all(promises).then(resolve).catch(reject);
}, 100);
```

または setTimeout を廃止して track の `ended` event ベースに切り替える設計を検討。
