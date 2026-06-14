// vitest のグローバル API をインポートすることで、テストファイルでグローバルな API を利用できるようにする
import "vite-plus/test/globals";

// vite.config.ts の define でビルド時に注入されるグローバル定数
declare const __SORA_JS_SDK_VERSION__: string;
