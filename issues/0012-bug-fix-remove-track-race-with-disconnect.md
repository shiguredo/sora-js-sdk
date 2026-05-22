# `removeAudioTrack` / `removeVideoTrack` が disconnect レース時に無言で resolve する

- Priority: Low
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-remove-track-race-with-disconnect

## 目的

`removeAudioTrack` (`src/base.ts:414-438`) と `removeVideoTrack` (`src/base.ts:490-515`) は 100ms の `setTimeout` 内で `track.stop()` と `stream.removeTrack(track)` を実行した後、`this.pc !== null` のときだけ `sender.replaceTrack(null)` で sender クリーンアップを行う。`setTimeout` の 100ms 間にユーザーが `disconnect()` を呼ぶか、ネットワーク断起因の `abend` 等で `this.pc` が `null` に初期化されると、track の停止と stream からの削除は走るが sender クリーンアップだけがスキップされる。それでも `Promise` は `resolve()` で完了するため、呼び出し側は「正常終了」と認識する。本 issue では disconnect レース時に明示的に `reject` する API 契約に変更する。

なお `track.stop()` と `stream.removeTrack(track)` は `removeXxxTrack` の本来の仕様 (track を完全に取り除く) で、ユーザー側で「カメラを一時 ON/OFF 切り替え」したい場合は `replaceAudioTrack` (`src/base.ts:538-546`) / `replaceVideoTrack` (`src/base.ts:569-577`) を使うべき。`removeXxxTrack` を呼んだ後は `getUserMedia` をやり直す必要があるのは設計上の正しい挙動。

## 優先度根拠

Low。`pc` が close 済みなら sender も無効化されており、`sender.replaceTrack(null)` のスキップは GC 待ちで実害は出ない。本 issue の実質的な論点は「切断中の `removeXxxTrack` が無言で resolve するのは API 契約として誤解を招く」点のみ。アプリ側が `removeXxxTrack` の resolve を「sender クリーンアップ完了」と読み替える運用がないなら、修正されなくても致命的なバグにはならない。発生条件 (100ms ウィンドウ内の `disconnect` 呼び出しまたは `abend` 発火) も限定的。

## 現状

`src/base.ts:414-438`

```ts
async removeAudioTrack(stream: MediaStream): Promise<void> {
  for (const track of stream.getAudioTracks()) {
    track.enabled = false;
  }
  return new Promise((resolve, reject) => {
    // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
    setTimeout(() => {
      const promises = stream.getAudioTracks().map(async (track) => {
        track.stop();
        stream.removeTrack(track);
        if (this.pc !== null) {
          const sender = this.pc.getSenders().find((s) => s.track && s.track.id === track.id);
          if (sender) {
            return sender.replaceTrack(null);
          }
        }
      });
      Promise.all(promises)
        .then(() => {
          resolve();
        })
        .catch(reject);
    }, 100);
  });
}
```

`removeVideoTrack` (`src/base.ts:490-515`) も同型のコードで `getVideoTracks()` を使う以外は一致。

100ms の setTimeout は「視聴側に静止画像が残ってしまうのを防ぐ」目的で導入されており (`src/base.ts:419, 495` の既存コメント)、最適化目的のディレイではなく仕様上の意図がある。このディレイ自体を廃止する設計変更 (例: `track` の `ended` イベントベースに切り替える) は本 issue のスコープ外。

100ms の間に `this.pc = null` になる経路:

- ユーザーが直接 `disconnect()` を呼ぶ
- `abend()` (`src/base.ts:716-815`) が走る (ws.onclose / ws.onerror / DC.onerror 起因)
- `abendPeerConnectionState()` (`src/base.ts:605-659`) が走る (ICE state 起因)
- `shutdown()` (`src/base.ts:668-708`) が走る (type: close 受信、ws.onclose code 1000)

これらの経路で `initializeConnection()` (`src/base.ts:820-848`) が呼ばれて `this.pc = null` (`src/base.ts:832`) になる。`pc.close()` も合わせて呼ばれているため (`src/base.ts:653` 等)、sender は既に無効化されている。

`replaceAudioTrack` (`src/base.ts:538-546`) と `replaceVideoTrack` (`src/base.ts:569-577`) は内部で `removeAudioTrack` / `removeVideoTrack` を `await` しているため、本 issue の修正で `reject` に変えると `replaceXxxTrack` も切断中は reject するようになる。`stopVideoTrack` (`src/base.ts:461-469`) は deprecated だが内部で `removeVideoTrack` を呼んでいるため同じ影響を受ける。

## 完了条件

- `setTimeout` コールバック内で `this.pc === null` を検知したら `reject(new ConnectError("Disconnected during removeAudioTrack"))` (audio) / `reject(new ConnectError("Disconnected during removeVideoTrack"))` (video) を呼び、`track.stop()` / `stream.removeTrack(track)` も実行しない (= 切断中なので stream の状態変更も避ける)
- `ConnectError` の `reason` フィールドに `"REMOVE_TRACK_DURING_DISCONNECT"` 相当を設定する
- `removeAudioTrack` (`src/base.ts:414-438`)、`removeVideoTrack` (`src/base.ts:490-515`) の両方に同じパターンを入れる
- `replaceAudioTrack` (`src/base.ts:538-546`)、`replaceVideoTrack` (`src/base.ts:569-577`)、`stopVideoTrack` (`src/base.ts:461-469`) はそれぞれ内部で `removeXxxTrack` を await しているため、切断中は自動的に reject が伝播する。本 issue では `replaceXxxTrack` / `stopVideoTrack` のロジック自体は変更しない
- 後方互換性: 従来「無言 resolve」だったケースが reject に変わる挙動変更のため、CHANGES.md には `[CHANGE]` で追記する
- 検証は実機ベースで、`e2e-tests/sendrecv/main.ts` に新規ボタン (例: `#remove-and-disconnect`) を追加し、`removeAudioTrack()` を呼んだ直後 (Promise を await する前) に `disconnect()` を呼ぶ。新規テスト `e2e-tests/tests/remove_track_race.test.ts` で `removeAudioTrack` の Promise が `reject` することを assert する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [CHANGE] removeAudioTrack / removeVideoTrack が切断中に呼ばれた場合に reject するように変更する
    - @voluntas
  ```
- 100ms setTimeout を廃止して `track` の `ended` イベントベースに切り替える設計変更は本 issue では行わない。別 issue として扱う場合は `issues/SEQUENCE` から採番して新規 issue を作成する

## 解決方法

`src/base.ts:414-438` の `removeAudioTrack` を次の通り変更する。

```ts
async removeAudioTrack(stream: MediaStream): Promise<void> {
  for (const track of stream.getAudioTracks()) {
    track.enabled = false;
  }
  return new Promise((resolve, reject) => {
    // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
    setTimeout(() => {
      if (this.pc === null) {
        const error = new ConnectError("Disconnected during removeAudioTrack");
        error.reason = "REMOVE_TRACK_DURING_DISCONNECT";
        reject(error);
        return;
      }
      const promises = stream.getAudioTracks().map(async (track) => {
        track.stop();
        stream.removeTrack(track);
        if (this.pc !== null) {
          const sender = this.pc.getSenders().find((s) => s.track && s.track.id === track.id);
          if (sender) {
            return sender.replaceTrack(null);
          }
        }
      });
      Promise.all(promises)
        .then(() => {
          resolve();
        })
        .catch(reject);
    }, 100);
  });
}
```

`src/base.ts:490-515` の `removeVideoTrack` も同じパターンで書き換える (差分は `getAudioTracks()` → `getVideoTracks()` とエラーメッセージのみ)。

`ConnectError` は `src/utils.ts:414-417` 定義。`code?: number` / `reason?: string` を持つ。
