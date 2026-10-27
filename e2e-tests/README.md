# Sora JavaScript SDK E2E テスト

## 使い方

```bash
git clone git@github.com:shiguredo/sora-js-sdk.git
cd sora-js-sdk
# .env.local を作成して適切な値を設定してください
cp .env.template .env.local
vp install
vp run build
vp run e2e-test
```

## 特定のテストを並列かつ複数回数実行するテスト

```bash
vp run e2e-test e2e-tests/tests/sendonly_audio.test.ts --repeat-each 10 --workers 10
```

## Firefox の H264 (OpenH264)

Firefox の H264 の送受信には OpenH264 (GMP) のプラグインが必要です。次のコマンドで `.gmp/` に配置します。

```bash
sh e2e-tests/scripts/install-openh264.sh
```

`playwright.config.ts` が `.gmp/gmp-gmpopenh264/<version>` を検出すると、Firefox の起動時に `MOZ_GMP_PATH` を設定します。
