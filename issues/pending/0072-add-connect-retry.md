# `type: connect` に `retry` を追加して接続試行回数を Sora のログに残す

- Priority: Low
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/add-connect-retry
- Polished: {YYYY-MM-DD}

## 目的

Sora JavaScript SDK が `type: connect` を送信する際に、その接続が何回目の試行 (retry) であるかを示す `retry` を付与し、Sora サーバー側のログに接続試行回数を残せるようにする。

現状はサーバー側のログに「アプリケーションが同じ接続を何度も張り直した」ことを示す情報が無く、接続失敗やネットワーク断に伴う再試行がどの程度発生しているかをログから追えない。クライアント側の試行回数を `type: connect` に含めることで、Sora のログだけで再試行の発生状況を把握できるようにする。

## 現状

### Sora のシグナリング仕様に `retry` が無い

Sora の公式ドキュメント「シグナリングの型定義」の `SignalingConnectMessage` に `retry` フィールドは定義されていない (Sora 2026.1.2 時点)。サーバー側が `retry` を受け取ってログに記録する仕様が存在しないため、SDK だけが `retry` を送っても目的を達成できない。

### SDK 側に retry / 再接続の仕組みが無い

- `src/types.ts` の `SignalingConnectMessage` にも `ConnectionOptions` にも retry 相当のフィールドは無い
- `src/utils.ts` の `createSignalingMessage` は `type: "connect"` メッセージを組み立てるが `retry` を設定しない
- SDK に自動再接続 (retry) の仕組みが無い。`src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` の `connect()` がそれぞれ `src/base.ts` の `signaling()` を呼び、`connect()` を呼ぶたびに新しい接続を 1 回張るだけである
- `src/base.ts` に接続試行回数を数えるフィールドは存在しない
- `CHANGES.md` と git 履歴にも retry 実装は無い

## 設計方針 (案)

実装する場合は次の 2 点を決める必要がある。

### 1. Sora サーバー側の仕様拡張

`SignalingConnectMessage` に `retry?: number` (Sora の型では `non_neg_integer()`) を追加し、Sora が受け取った値をログに記録する。SDK 単独では完結しない。

### 2. SDK 側の試行回数の決定

- **案 A: 利用者が指定する**: `ConnectionOptions` に `retry?: number` を追加し、`createSignalingMessage` で `message.retry` に積む。SDK は再接続を行わず、利用者 (アプリケーション) が `connect()` を呼び直すたびに値を渡す。仕様追加が小さく済む
- **案 B: SDK が数える**: SDK が接続試行回数を内部で数え、`connect()` のたびにインクリメントして送る。ただし現状 SDK は自動再接続しないため、「何をもって同じ接続の retry とみなすか」(インスタンス単位か、シグナリング URL 単位か、リダイレクトをまたぐか) の定義が必要になる

`retry` の型は Sora の `non_neg_integer()` に合わせ、負数・小数・`NaN` / `Infinity` を送らない検証を `createSignalingMessage` に入れる。

## 完了条件

- Sora の `SignalingConnectMessage` に `retry` が定義され、Sora がログに記録する仕様が決まっていること
- 上記仕様に基づき、SDK の `SignalingConnectMessage` / `ConnectionOptions` / `createSignalingMessage` に `retry` 対応が入っていること
- `retry` を指定しない場合は従来どおり `type: connect` に `retry` が含まれないこと
- `createSignalingMessage` の単体テストで `retry` の送信・非送信・不正値の扱いを確認すること
- `CHANGES.md` の `## develop` に `[ADD]` を追記すること

## pending にした理由

以下が確定するまで実装に着手しないため、`issues/pending/` に配置している。

- **Sora サーバー側の仕様が未定義**: Sora の `SignalingConnectMessage` に `retry` が存在しない (Sora 2026.1.2 時点)。SDK が `retry` を送っても Sora がログに記録しなければ issue の目的 (サーバーログへの試行回数記録) を満たせない
- **SDK 側の設計判断が必要**: SDK には自動再接続が無く、retry 回数を「利用者が指定する値 (案 A)」とするか「SDK が数える値 (案 B)」とするかで API が変わる。前者は仕様追加が小さいが、後者は再接続の単位 (インスタンス / シグナリング URL / リダイレクト) の定義が必要になる
- **元 issue が Sora 側の対応待ちの状態で残っている**: 2021 年に起票され、2023-10 に sora-js-sdk リポジトリから現在の管理先へ transfer されて以降、仕様が固まっていない

着手判断のトリガー:

- Sora のシグナリング仕様に `retry` (または同等の接続試行回数フィールド) が定義された
- SDK で retry 回数をどう扱うか (案 A / 案 B) の方針が決まった
