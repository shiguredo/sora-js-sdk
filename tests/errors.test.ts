// errors.ts の Disconnect 系 3 クラスは constructor 内で this.name をクラス名に
// 設定する。このテストはその設定が将来削除されないことを担保する回帰テスト。
// name が抜けると Error のデフォルト name ("Error") にフォールバックして
// スタックトレースや instanceof 系の判別が壊れる。
// message の値は src/base.ts の DisconnectWaitTimeoutError / DisconnectInternalError /
// DisconnectDataChannelError 利用箇所で SoraCloseEvent.reason に詰める文字列の元となるため、
// 文字列リテラルとして変化させない (利用者観測値の不変)。
// instanceof は派生クラスと Error の両方を確認し、Object.setPrototypeOf を使わずに
// ネイティブ class 継承だけで派生クラスと基底クラス双方の instanceof が成立し続けることを副次的に担保する。

import {
  DisconnectWaitTimeoutError,
  DisconnectInternalError,
  DisconnectDataChannelError,
} from "../src/errors";

// name / message / instanceof を 3 クラス分テストする。
// new <Class>() スタイルは既存 tests/utils.test.ts の new ConnectError(...) テスト命名に揃えている。

test("new DisconnectWaitTimeoutError() は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectWaitTimeoutError();
  expect(e.name).toBe("DisconnectWaitTimeoutError");
  expect(e.message).toBe("DISCONNECT-WAIT-TIMEOUT-ERROR");
  expect(e instanceof DisconnectWaitTimeoutError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

test("new DisconnectInternalError() は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectInternalError();
  expect(e.name).toBe("DisconnectInternalError");
  expect(e.message).toBe("DISCONNECT-INTERNAL-ERROR");
  expect(e instanceof DisconnectInternalError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

test("new DisconnectDataChannelError() は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectDataChannelError();
  expect(e.name).toBe("DisconnectDataChannelError");
  expect(e.message).toBe("DISCONNECT-DATA-CHANNEL-ERROR");
  expect(e instanceof DisconnectDataChannelError).toBe(true);
  expect(e instanceof Error).toBe(true);
});
