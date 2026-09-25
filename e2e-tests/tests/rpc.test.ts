import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  checkSoraVersion,
  unsupportedVersionSkipReason,
  getRpcError,
  getRpcLogContent,
  getRpcMethods,
  getRpcResult,
  getVideoResolution,
} from "./helper";

/**
 * RPC 機能の E2E テスト
 *
 * Simulcast sendonly/recvonly を接続し、2025.2.0/RequestSimulcastRid で
 * RID を切り替える経路と、サーバーが JSON-RPC エラーを返す経路を検証する
 */

// RPC ページを開き、sendonly / recvonly を接続して RPC を実行できる状態まで待機する
// Sora が RPC に対応していない場合はテストをスキップする
async function connectRpcPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:9000/rpc/");

  // バージョンチェック
  const versionCheck = await checkSoraVersion(page, {
    featureName: "RPC",
    majorVersion: 2025,
    minorVersion: 2,
  });

  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));

  // チャンネル名を設定
  await page.fill("#channel-name", randomUUID());

  // 接続 (sendonly と recvonly 両方)
  await page.click("#connect");

  // sendonly の connection-id が表示されるまで待機
  await page.waitForSelector("#sendonly-connection-id:not(:empty)", {
    timeout: 30_000,
  });

  // recvonly の connection-id が表示されるまで待機
  await page.waitForSelector("#recvonly-connection-id:not(:empty)", {
    timeout: 30_000,
  });

  // rpcMethods が表示されるまで待機
  await page.waitForSelector("#rpc-methods:not(:empty)", { timeout: 15_000 });

  // リモートビデオが表示されるまで待機 (RPC DataChannel が open になるまで待つ)
  await page.waitForSelector("#remote-videos video", { timeout: 15_000 });

  // type: switched メッセージを受け取るまで待機
  await page.waitForSelector('#switched[data-switched="true"]', {
    timeout: 15_000,
  });

  return { context, page };
}

test.describe("RPC test", () => {
  test("RPC で simulcast rid を切り替えられる", async ({ browser }) => {
    const { context, page } = await connectRpcPage(browser);

    // rpcMethods に 2025.2.0/RequestSimulcastRid が含まれていることを確認
    const rpcMethods = await getRpcMethods(page);
    expect(rpcMethods).toContain("2025.2.0/RequestSimulcastRid");

    // 安定するまで待機
    await page.waitForTimeout(3000);

    // 初期解像度を取得 (Sora のデフォルト rid である r0 で開始する)
    const initialResolution = await getVideoResolution(page);
    console.log(`Initial resolution (r0): ${initialResolution.width}x${initialResolution.height}`);

    // 解像度が測定できていることを確認する
    // (未測定の場合は 0 が返り、大小比較だけでは 0 でも成立してしまう)
    expect(initialResolution.width).toBeGreaterThan(0);
    expect(initialResolution.height).toBeGreaterThan(0);

    // r1 に切り替え (RPC 実行)
    await page.click('input[name="rid"][value="r1"]');

    // RPC ログにリクエストが記録されるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>("#rpc-log");
        return element?.textContent?.includes("Request: rid=r1");
      },
      { timeout: 15_000 },
    );

    // simulcast.switched で current_rid が r1 に変わるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>("#current-rid");
        return element?.dataset.currentRid === "r1";
      },
      { timeout: 15_000 },
    );

    // rpc() が解決した result を厳密に検証する
    // (2025.2.0/RequestSimulcastRid の応答は切り替え先の rid と接続情報)
    expect(await getRpcResult(page)).toStrictEqual({
      channel_id: expect.any(String),
      receiver_connection_id: expect.any(String),
      rid: "r1",
    });

    // 解像度が変わるまで待機
    await page.waitForTimeout(3000);

    // r1 の解像度を取得
    const r1Resolution = await getVideoResolution(page);
    console.log(`r1 resolution: ${r1Resolution.width}x${r1Resolution.height}`);

    // r1 は r0 より高い解像度なので、初期解像度より大きいはず
    expect(r1Resolution.width).toBeGreaterThan(initialResolution.width);
    expect(r1Resolution.height).toBeGreaterThan(initialResolution.height);

    // r0 に戻す
    await page.click('input[name="rid"][value="r0"]');

    // simulcast.switched で current_rid が r0 に変わるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>("#current-rid");
        return element?.dataset.currentRid === "r0";
      },
      { timeout: 15_000 },
    );

    // rpc() が解決した result を厳密に検証する
    // (2025.2.0/RequestSimulcastRid の応答は切り替え先の rid と接続情報)
    expect(await getRpcResult(page)).toStrictEqual({
      channel_id: expect.any(String),
      receiver_connection_id: expect.any(String),
      rid: "r0",
    });

    // 解像度が戻るまで待機
    await page.waitForTimeout(3000);

    // r0 の解像度を取得
    const r0Resolution = await getVideoResolution(page);
    console.log(`r0 resolution: ${r0Resolution.width}x${r0Resolution.height}`);

    // 解像度が測定できていることを確認する
    // (未測定の 0 は r1 より小さいので、大小比較だけでは成立してしまう)
    expect(r0Resolution.width).toBeGreaterThan(0);
    expect(r0Resolution.height).toBeGreaterThan(0);

    // r0 は最も低い解像度なので、r1 より小さいはず
    expect(r0Resolution.width).toBeLessThan(r1Resolution.width);
    expect(r0Resolution.height).toBeLessThan(r1Resolution.height);

    // RPC ログに Request が記録されていることを確認
    const rpcLogContent = await getRpcLogContent(page);
    expect(rpcLogContent).toContain("Request: rid=r1");
    expect(rpcLogContent).toContain("Request: rid=r0");

    // 切断
    await page.click("#disconnect");

    // クリーンアップ
    await page.close();
    await context.close();
  });

  test("サーバーが返した RPC エラーの message と cause を取得できる", async ({ browser }) => {
    // NPM パッケージの E2E テストで検証する公開済みバージョンには、サーバーが返した
    // JSON-RPC エラーを cause に保持する修正が含まれていないためスキップする
    if (process.env.NPM_PKG_E2E_TEST === "true") {
      test.skip();
    }

    const { context, page } = await connectRpcPage(browser);

    // 不要な項目を含めた params で RPC を実行し、サーバーが JSON-RPC エラーを返すまで待機
    await page.click("#invalid-rpc");
    await page.waitForSelector("#rpc-error[data-rpc-error]", { timeout: 15_000 });

    const rpcError = await getRpcError(page);

    // サーバーが返した message がそのまま Error の message になること
    // ("[object Object]" に潰れていたら失敗する)
    expect(rpcError.message).toBe("JSON-RPC-INVALID-PARAMS");

    // reject される値は plain な Error インスタンスのままであること
    // (DataChannel 経由の reject は単体テストで再現できないため、ここで契約を検証する)
    expect(rpcError.isError).toBe(true);
    expect(rpcError.isPlainError).toBe(true);
    expect(rpcError.name).toBe("Error");

    // cause から JSON-RPC エラーオブジェクトの code / message / data を取得できること
    // 期待値は Sora が実際に返す値に合わせる (Sora とのインターフェース確認のため、
    // 現在のレスポンスを正として扱う)
    expect(rpcError.hasCause).toBe(true);
    expect(rpcError.cause).toStrictEqual({
      code: -32_602,
      data: { "UNKNOWN-KEYS": ["invalid_param"] },
      message: "JSON-RPC-INVALID-PARAMS",
    });

    // RPC ログに cause の内容 (code / data) が出力されていること
    const rpcLogContent = await getRpcLogContent(page);
    expect(rpcLogContent).toContain('"code":-32602');
    expect(rpcLogContent).toContain('"UNKNOWN-KEYS":["invalid_param"]');

    // 切断
    await page.click("#disconnect");

    // クリーンアップ
    await page.close();
    await context.close();
  });

  test("切断後の rpc() はクライアント側のエラーになり cause が設定されない", async ({
    browser,
  }) => {
    const { context, page } = await connectRpcPage(browser);

    // 切断して RPC DataChannel を閉じる
    // #rpc-methods がクリアされると切断処理が完了したことが分かる
    await page.click("#disconnect");
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>("#rpc-methods")?.dataset.rpcMethods === undefined,
      { timeout: 15_000 },
    );

    // 切断後に RPC を実行するとクライアント側のエラーになる
    await page.click("#invalid-rpc");
    await page.waitForSelector("#rpc-error[data-rpc-error]", { timeout: 15_000 });

    const rpcError = await getRpcError(page);

    // クライアント側のエラーでは cause が設定されない
    // (cause の有無でサーバーが返したエラーかどうかを判別する契約)
    expect(rpcError.hasCause).toBe(false);
    expect(rpcError.cause).toBeUndefined();
    expect(rpcError.message).toBe("RPC DataChannel is not available or not open");

    // reject される値は plain な Error インスタンスのままであること
    expect(rpcError.isError).toBe(true);
    expect(rpcError.isPlainError).toBe(true);
    expect(rpcError.name).toBe("Error");

    // RPC ログには cause が無いことが出力される
    const rpcLogContent = await getRpcLogContent(page);
    expect(rpcLogContent).toContain("cause=none");

    // クリーンアップ
    await page.close();
    await context.close();
  });
});
