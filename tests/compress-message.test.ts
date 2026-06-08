// jsdom 環境では Blob.stream および CompressionStream が未定義のため、
// compressMessage は必ず例外を throw する。
// abend() で try/catch なしに await compressMessage() を呼ぶと
// 後続のクリーンアップ（disconnect callback 等）に到達しないバグの
// 前提条件を確認するテスト。
// 実際の abend() 側の修正 (try/catch 追加) はコードレビューで担保する。

import { compressMessage } from "../src/utils";

test("compressMessage は CompressionStream 非対応環境でエラーになる", async () => {
  const binaryMessage = new TextEncoder().encode(JSON.stringify({ type: "disconnect" }));
  // jsdom 環境では Blob.stream / CompressionStream が未定義で throw する
  await expect(compressMessage(binaryMessage)).rejects.toThrow();
});
