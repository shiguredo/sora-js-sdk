
import { checkVersionSupport } from "../e2e-tests/tests/helper";

test("checkVersionSupport: バージョンがnullの場合はサポートされていないと判定する", () => {
  const result = checkVersionSupport(null, {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeFalsy();
  expect(result.skipReason).toBe("Sora JS SDK version not found");
});

test("checkVersionSupport: バージョンがパースできない場合はサポートされていないと判定する", () => {
  const result = checkVersionSupport("invalid-version", {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeFalsy();
  expect(result.skipReason).toBe("Cannot parse Sora JS SDK version: invalid-version");
});

test("checkVersionSupport: メジャーバージョンが古い場合はサポートされていないと判定する", () => {
  const result = checkVersionSupport("2024.3.0", {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeFalsy();
  expect(result.skipReason).toBe(
    "Sora JS SDK version 2024.3.0 is older than 2025.2 (Test Feature support required)",
  );
  expect(result.version).toBe("2024.3.0");
});

test("checkVersionSupport: メジャーバージョンが同じでマイナーバージョンが古い場合はサポートされていないと判定する", () => {
  const result = checkVersionSupport("2025.1.0", {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeFalsy();
  expect(result.skipReason).toBe(
    "Sora JS SDK version 2025.1.0 is older than 2025.2 (Test Feature support required)",
  );
});

test("checkVersionSupport: 要求バージョン以上の場合はサポートされていると判定する", () => {
  const result = checkVersionSupport("2025.2.0", {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeTruthy();
  expect(result.version).toBe("2025.2.0");
  expect(result.skipReason).toBeUndefined();
});

test("checkVersionSupport: 要求バージョンより新しい場合はサポートされていると判定する", () => {
  const result = checkVersionSupport("2025.3.0", {
    featureName: "Test Feature",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeTruthy();
  expect(result.version).toBe("2025.3.0");
});

test("checkVersionSupport: プレリリースバージョンを正しく処理する", () => {
  const result = checkVersionSupport("2025.2.0-canary.0", {
    featureName: "RPC",
    majorVersion: 2025,
    minorVersion: 2,
  });
  expect(result.isSupported).toBeTruthy();
  expect(result.version).toBe("2025.2.0-canary.0");
});
