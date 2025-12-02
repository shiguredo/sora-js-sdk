# Sora JavaScript SDK E2E テスト

## 使い方

```bash
git clone git@github.com:shiguredo/sora-js-sdk.git
cd sora-js-sdk
# .env.local を作成して適切な値を設定してください
cp .env.template .env.local
pnpm install
pnpm build
pnpm e2e-test
```

## 特定のテストを並列かつ複数回数実行するテスト

```bash
pnpm e2e-test e2e-tests/tests/sendonly_audio.test.ts --repeat-each 10 --workers 10
```
