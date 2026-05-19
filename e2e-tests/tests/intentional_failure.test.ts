import { expect, test } from "@playwright/test";

// analyze_and_notify_failure ジョブの動作確認用に意図的に失敗させるテスト
// 確認が終わったら revert する
test("intentional failure for analyzer", () => {
  expect(true).toBe(false);
});
