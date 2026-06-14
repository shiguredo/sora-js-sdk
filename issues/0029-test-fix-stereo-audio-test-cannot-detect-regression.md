# stereo audio E2E が WebAudio analyser だけで判定し SDK の `stereo=1` ネゴ回帰を検知できない

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-15
- Model: Opus 4.7
- Branch: feature/fix-stereo-audio-test-regression

## 必要性

**必要。** `e2e-tests/tests/stereo_audio.test.ts` / `stereo_audio_sendrecv.test.ts` の現行 assert は `analysisData.*.isStereo` (WebAudio analyser の左右周波数差) と RTP `bytesSent` / `bytesReceived` のみで、SDP / codec channels を一切見ていない。送信側 fake は左右別波形を生成するため、SDK の stereo ネゴ (`audioOpusParamsStereo` / `addStereoToFmtp`) が壊れても analyser は依然 stereo と判定し、E2E は通る。`src/utils.ts:656` の `addStereoToFmtp` および `src/base.ts:1595` の `forceStereoOutput` 経路の SDP 書き換えは ad-hoc な hack であり、Sora 側 SDP 変更や SDK リファクタで容易に壊れる。

### テスト側の問題

- `e2e-tests/tests/stereo_audio.test.ts:89-107` / `:162-180` / `stereo_audio_sendrecv.test.ts:96-130` は `analysisData.*.isStereo` と RTP bytes のみ assert する。`stereo_audio.test.ts` には RTP bytes assert があるが、`stereo_audio_sendrecv.test.ts` の mono / mixed テストには RTP bytes assert すら無い
- `RealtimeAudioAnalyzer.channelCount` は `MediaStreamAudioSourceNode.channelCount` の値を保持するが、`AudioNode.channelCount` の W3C 仕様上の default は 2。実装によっては stream の実 channel 数で初期化される (Chromium のバージョン依存) が、信頼性が低いため `channelCount >= 2` ガードは事実上「左右周波数が 50Hz 以上離れているか」のみで stereo 判定している。fake が左右別波形を出す限り、SDK の stereo ネゴが壊れても true になり得る
- fixture 側 (`fake_stereo_audio/main.ts:307-311` / `fake_stereo_audio_sendrecv/main.ts:400-408`) は `console.log("Answer SDP (stereo check):", sdp?.includes("stereo=1"))` でデバッグ出力するのみ。`sdp.includes("stereo=1")` は `sprop-stereo=1` に false-positive で部分一致する欠陥もあり、テスト側から参照できない

## 設計方針

### 検知層の役割分担

- **決定的層 (SDK 単体 ユニットテスト)**: `addStereoToFmtp` の固定 SDP テストでブラウザ / Sora 非依存に回帰を確実に拾う。`src/utils.ts:656-739` のロジック回帰はここで完全にカバーする
- **結合層 (E2E SDP assert)**: SDK + ブラウザ + Sora の組み合わせで SDP の opus fmtp に `stereo=1` トークンが含まれることを assert する。ブラウザの `createAnswer` の挙動と Sora の SDP 生成に依存するため best-effort。Chrome は offer SDP の opus fmtp `stereo=1` を answer 側に echo する実装挙動を持つが、これは仕様レベルでは保証されない。本 issue では Chromium project に固定する
- **補助層 (WebAudio analyser)**: 既存 `analysisData.*.isStereo` assert と RTP bytes assert は緩めずそのまま残す
- **assert 対象外 (codec stats `channels`)**: W3C webrtc-stats 仕様の `RTCCodecStats.channels` は optional member で、ブラウザ実装によって mono ネゴでも `2` を返すケースがある (Chrome 観測経験)。信頼できないため assert には使わず、参考情報として `console.log` に残すのみ

### 検証対象 2 経路の SDK 挙動

publisher / subscriber いずれの PC でも `remoteDescription` は Sora からの offer、`localDescription` は SDK が `createAnswer` で生成した answer になる。

1. **送信経路 (sendonly / sendrecv)**: `audioOpusParamsStereo` (`src/types.ts:385`) が signaling message `audio.opus_params.stereo` に渡る (`src/utils.ts:291-293`)。Sora が offer SDP に stereo 関連パラメータを載せると、ブラウザの `createAnswer` がそれを反映した answer (`localDescription`) を生成する。SDK 自身は送信側 answer を書き換えない
2. **受信経路 (recvonly + `forceStereoOutput`)**: `src/base.ts:1595-1597` で SDK 生成 answer (`localDescription`) の opus fmtp に `addStereoToFmtp` (`src/utils.ts:656-739`) で `stereo=1` を直接追加する hack。`isAudio` → `isSetupActive` → `isRecvOnly` → `isOpus` → `isFmtp` の 5 ゲートを通過した media description だけが対象。`forceStereoOutput` は SDK 内で `src/base.ts:1595` の `addStereoToFmtp` 呼び出し 1 箇所のみで消費され (`grep -rn "forceStereoOutput" src/` で確認可能)、`createSignalingMessage` (`src/utils.ts:210-261`) の delete ループで signaling message からは除外される

### §0. SDK 単体 ユニットテスト (`tests/utils.test.ts`)

`addStereoToFmtp` は `src/utils.ts:656` で export 済み。`tests/utils.test.ts` から直接 import し、固定 SDP 文字列で以下を検証する。

- テスト名は既存ファイル (`tests/utils.test.ts`) の規則 (`test("createSignalingMessage ..."`) に揃え、`test("addStereoToFmtp <観点>", ...)` の英語プレフィックス + 短い日本語サマリ。既存ファイルは `describe` を一切使わない構造のため、本 issue も `describe` ブロックでグルーピングせずトップレベル `test()` で並べる。追加場所は既存テストの末尾 (`tests/utils.test.ts:1040` の直後)
- 既存 import 文 (`tests/utils.test.ts:4` `import { ConnectError, createSignalingMessage, redact } from "../src/utils";`) を `import { addStereoToFmtp, ConnectError, createSignalingMessage, redact } from "../src/utils";` に変更する (alphabetical で `addStereoToFmtp` を先頭に追加)
- コメントは日本語 (`CLAUDE.md` 規約)。`console.log` 等のテストログは日本語

#### fixture SDP の基本形

```
v=0\r\n
o=- 0 0 IN IP4 0.0.0.0\r\n
s=-\r\n
t=0 0\r\n
m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n
c=IN IP4 0.0.0.0\r\n
a=setup:active\r\n
a=recvonly\r\n
a=rtpmap:111 opus/48000/2\r\n
a=fmtp:111 minptime=10;useinbandfec=1\r\n
```

ブラウザ生成 SDP は CRLF が一般的。`addStereoToFmtp` の処理ロジックは改行コードに依存しない (`split(/\n/u)` での分割と `m=` プレフィックス判定のみで、末尾の `\r` は各行に残ったまま join で再構成される)。fixture は LF / CRLF どちらでも仕様として同じ挙動になることを 1 ケースで明示する。

#### テストケース

1. **正常系**: 基本形 (recvonly + setup:active + opus + minptime=10) を入力すると、出力の opus 行 fmtp が `minptime=10;stereo=1;useinbandfec=1` に書き換わり、session description (`v=` から `m=audio` の手前まで) は変化しない
2. **冪等**: 入力 fmtp が既に `minptime=10;stereo=1;useinbandfec=1` のとき、出力でも `stereo=1` が 1 つだけのままで二重付与しない
3. **`minptime` 欠落**: 基本形から fmtp 行の `minptime=10;` を取り除いた SDP では `stereo=1` が付与されない (現状実装の挙動を仕様として固定。将来「`minptime` 不要で `stereo=1` を付ける」改修を行うときはこのテストの期待値を更新する)
4. **`isRecvOnly` ゲート (sendrecv)**: 基本形の `a=recvonly` を `a=sendrecv` に置換した SDP では `stereo=1` が付与されない
5. **`isRecvOnly` ゲート (sendonly)**: `a=recvonly` を `a=sendonly` に置換した SDP では `stereo=1` が付与されない
6. **`isSetupActive` ゲート (actpass)**: 基本形の `a=setup:active` を `a=setup:actpass` に置換した SDP では `stereo=1` が付与されない
7. **`isSetupActive` ゲート (passive)**: `a=setup:active` を `a=setup:passive` に置換した SDP では `stereo=1` が付与されない
8. **`isAudio` ゲート (video セクション混在)**: `m=audio` セクションの直前に `m=video 9 UDP/TLS/RTP/SAVPF 96\r\n a=setup:active\r\n a=recvonly\r\n a=fmtp:96 minptime=10\r\n` を挟んだ SDP では、audio セクションのみに `stereo=1` が付与され、video 側の `a=fmtp:96 minptime=10` 行は無変更で出力に残る
9. **`splitSdp === null` (`m=audio` 不在)**: 以下の video のみ SDP では入力 SDP がそのまま返る:

   ```
   v=0\r\n
   o=- 0 0 IN IP4 0.0.0.0\r\n
   s=-\r\n
   t=0 0\r\n
   m=video 9 UDP/TLS/RTP/SAVPF 96\r\n
   c=IN IP4 0.0.0.0\r\n
   a=setup:active\r\n
   a=recvonly\r\n
   a=rtpmap:96 VP8/90000\r\n
   ```

入出力 SDP は逐語比較で assert する。`includes("stereo=1")` のような部分一致 assert は使わない。

送信側の signaling マッピング (`audioOpusParamsStereo` → `audio.opus_params.stereo`) は既存テスト `createSignalingMessage audioOpusParamsStereo` (`tests/utils.test.ts:245-260`) でカバー済みのため追加不要。

### §1. fixture 変更 (`e2e-tests/fake_stereo_audio/main.ts`)

#### 前提依存

**0028 (`getFakeMedia` の `{ stream, cleanup }` 化) のマージは必須前提**。0028 未マージ時は本 issue に着手しない。PR description に `Depends on #<0028 PR number>` を明記し、0028 PR がマージされた直後に rebase してから push する。

`fake_stereo_audio/index.html` / `fake_stereo_audio_sendrecv/index.html` は本 issue では一切変更しない。`#stereo-negotiation` は §1 / §6 のコードで動的生成する。

#### options の型とクラス構造

現行 fixture は `private readonly options: object = { connectionTimeout: 15_000 };` で `object` 型のため、`ConnectionOptions` キーの typo を compile 時に検知できない。本 issue では `sora-js-sdk` から `ConnectionOptions` を `import type` で追加し、3 クラス (`SoraSendClient` / `SoraRecvClient` / `SoraSendRecvClient`) すべてで `private readonly options: ConnectionOptions;` (= 宣言時初期化なし) + constructor 内の単一代入に揃える。既存の `= { connectionTimeout: 15_000 }` クラスフィールド初期化は削除する。

#### connect options と接続順序

`#use-stereo` / `#force-stereo-output` のチェック状態を 3 クラスの options に動的に反映する。fixture 内ローカルクラスのため公開 API ではないが、constructor 引数の順序の意図を明確にするため、4 番目以降は **`fixtureOptions: { ... }` の options object** で受ける。

以下は constructor 引数化部分の抜粋。**既存の処理順序 (`recvClient` を先に new + `setOnStreamCallback` + `await recvClient.connect()` → `getFakeMedia` → `sendClient` を new + `await sendClient.connect(stream)`) は維持する**。これは sendonly + recvonly 構成で受信側が SFU に先に attach されている必要があるため。

```ts
const useStereo = document.querySelector<HTMLInputElement>("#use-stereo")!.checked;
const forceStereoOutput = document.querySelector<HTMLInputElement>("#force-stereo-output")!.checked;

// 受信側を先に new + connect する (現行コード:142-162 の構造を維持)
recvClient = new SoraRecvClient(signalingUrl, channelId, secretKey, { forceStereoOutput });
recvClient.setOnStreamCallback((stream: MediaStream) => {
  /* 既存どおり */
});
await recvClient.connect();

// 送信側 fake stream を作って sendClient を new + connect する
if (fakeCleanup) {
  fakeCleanup();
  fakeCleanup = null;
}
const { stream, cleanup } = getFakeMedia({
  audio: { frequency: 440, stereo: useStereo, volume: 0.1 },
});
fakeCleanup = cleanup;

sendClient = new SoraSendClient(signalingUrl, channelId, secretKey, { useStereo });
await sendClient.connect(stream);
```

```ts
class SoraSendClient {
  private readonly options: ConnectionOptions;
  // ...
  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    fixtureOptions: { useStereo: boolean },
  ) {
    const baseOptions: ConnectionOptions = { connectionTimeout: 15_000 };
    if (fixtureOptions.useStereo) {
      // false 明示と key 省略で Sora signaling の挙動が変わるため、false 時は key 自体を省略する
      // (src/utils.ts:291 の `"audioOpusParamsStereo" in copyOptions` 判定が key の有無で分岐する)
      baseOptions.audioOpusParamsStereo = true;
    }
    this.options = baseOptions;
    // ...
  }
}

class SoraRecvClient {
  private readonly options: ConnectionOptions;
  // ...
  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    fixtureOptions: { forceStereoOutput: boolean },
  ) {
    const baseOptions: ConnectionOptions = { connectionTimeout: 15_000 };
    if (fixtureOptions.forceStereoOutput) {
      baseOptions.forceStereoOutput = true;
      // forceStereoOutput が立つときだけ Sora の offer に minptime を要求する。
      // §3 の minptime 依存を参照
      baseOptions.audioOpusParamsMinptime = 10;
    }
    this.options = baseOptions;
    // ...
  }
}
```

`audioOpusParamsMinptime: 10` は `forceStereoOutput` が立つときだけ設定する。mono テスト経路 (`forceStereoOutput` 未設定) では signaling message に opus minptime を載せず、`addStereoToFmtp` が呼ばれない経路への副作用を最小化する。値 `10` は既存テスト `tests/utils.test.ts:279-294` の `audioOpusParamsMinptime` テストと同じ。

`setForceStereoOutput()` メソッドと既存 `console.log("Answer SDP (stereo check):", ...)` (`fake_stereo_audio/main.ts:307-311`、`fake_stereo_audio_sendrecv/main.ts:400-408`) は両 fixture から削除する (理由はそれぞれ「現状」の課題で既述)。

#### `#disconnect` での cleanup

`#disconnect` ハンドラ末尾 (analyzer.stop / client.disconnect の後) で `fakeCleanup()` を呼ぶ。0028 の cleanup は idempotent なため重複実行は安全。`sendClient` / `recvClient` 変数の null 化は本 issue では行わない (= `#disconnect` 直後に `#get-stats` をクリックしても `getLocalSdp()` が `null` を返して空文字フォールバック → §4 の `expect(...).toMatch(/^v=0/u)` で明示 fail する)。

#### `#get-stats` での SDP 公開

`#get-stats` ハンドラは現状 `if (!sendClient)` のみで早期 return しているが、`recvClient.getLocalSdp()` も必要なため両 client の存在を確認する。

```ts
document.querySelector("#get-stats")?.addEventListener("click", async () => {
  if (!sendClient || !recvClient) {
    return;
  }

  // 既存の stats 処理 (audio analysis dataset への書き込み等) はそのまま維持する
  // ...

  const sendStatsReport = await sendClient.getStats();
  // RTCStatsReport.values() は RTCStats を yield する。mimeType を持つのは
  // RTCCodecStats (type === "codec" 派生型) なので明示的に narrow する
  const sendOpusCodec =
    (Array.from(sendStatsReport.values()).find(
      (report) => report.type === "codec" && (report as RTCCodecStats).mimeType === "audio/opus",
    ) as RTCCodecStats | undefined) ?? null;

  // 現行ハンドラは statsDiv (#stats-report) を innerHTML で全消し再構築するため、
  // #stereo-negotiation の append は innerHTML 上書きより後に行う。複数回 click 対策の
  // 防御的 remove も残す
  document.querySelector("#stereo-negotiation")?.remove();

  const negotiationDiv = document.createElement("div");
  negotiationDiv.id = "stereo-negotiation";
  negotiationDiv.dataset.negotiation = JSON.stringify({
    sendLocalSdp: sendClient.getLocalSdp() ?? "",
    recvLocalSdp: recvClient.getLocalSdp() ?? "",
    sendOpusCodec,
  });
  statsDiv.append(negotiationDiv);
});
```

dataset を 1 回の `JSON.stringify(...)` 書き込みで完成させるのは、`waitForStereoNegotiationData` (§2) で `dataset.negotiation` の出現を待ってから読み取るため、部分書き込み済みの中間状態を観測させないため。

`#stereo-negotiation` は動的生成して `statsDiv` (= `#stats-report`) 配下に append する。fake_stereo_audio 側の `index.html` には `#stats-report` のみが静的存在で、現行 main.ts も `#audio-analysis` を動的生成して `statsDiv` 配下に append している (`fake_stereo_audio/main.ts:266-282`)。本 issue でも同方針を踏襲する。

#### `getLocalSdp()` メソッド

3 クラスとも `connection: ConnectionPublisher | ConnectionSubscriber` フィールドが `private readonly` で fixture 外から `client.connection.pc.localDescription` のように内部 PC を直接たどれないため、既存 `getStats()` と同じカプセル化方針で getter を追加する。

```ts
class SoraSendClient {
  // ...
  getLocalSdp(): string | null {
    return this.connection.pc?.localDescription?.sdp ?? null;
  }
}
```

`pc` 自体は SDK 内で public 宣言かつ `null` 許容 (`src/base.ts:159`)。`getStats()` は `pc === null` で例外を投げるが `getLocalSdp()` は `null` を返す (`pc` または `localDescription` が null のとき)。fixture の `#get-stats` ハンドラで `?? ""` 空文字フォールバックさせ、テスト側 (§4) で `not.toBe("")` と `toMatch(/^v=0/u)` の 2 段階 assert で「null 由来の空文字フォールバック」と「文字列だが SDP として不正」を分けて明示 fail させる。

### §2. SDP 判定 helper (`e2e-tests/tests/helper.ts`)

既存 `helper.ts` の構造に合わせ、型は `StereoAudioSendRecvAnalysisData` 直後、Pure 関数 (`getOpusPayloadType` / `hasOpusStereo` / `hasOpusMinptime` / `countOpusStereo`) は `unsupportedVersionSkipReason` の直後、`waitForStereoNegotiationData` は `getAnalysisData` の直後に追加する。`StereoNegotiationData.sendOpusCodec` の型は `StatsReport[number] | null` (既存 `StatsReport` 要素型) を使い、helper 内型の一貫性を保つ。`Page` 型は `helper.ts:1` の既存 `import type { Page } from "@playwright/test";` を流用する (追加 import 不要)。

```ts
export interface StereoNegotiationData {
  sendLocalSdp: string;
  recvLocalSdp: string;
  sendOpusCodec: StatsReport[number] | null;
}

export interface StereoSendRecvNegotiationData {
  conn1LocalSdp: string;
  conn2LocalSdp: string;
}

// dataset 出現を待ってから JSON を取り出す。`#get-stats` クリック直後は dataset が未書き込みの
// 可能性があるため、必ずこの helper 経由でアクセスする。
// timeout は短め (10 秒) にして失敗時に原因切り分けを早める。Playwright デフォルトの 30 秒は
// 「dataset 書き込み失敗」の原因を 30 秒待たないと見えないため不適切。
// ジェネリクスデフォルトは設けず、呼び出し側で <StereoNegotiationData> か
// <StereoSendRecvNegotiationData> を明示することで形状ミスを compile 時に検知する。
export async function waitForStereoNegotiationData<T>(
  page: Page,
  options: { selector?: string; timeout?: number } = {},
): Promise<T> {
  const { selector = "#stereo-negotiation", timeout = 10_000 } = options;
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el !== null && (el as HTMLElement).dataset.negotiation !== undefined;
    },
    selector,
    { timeout },
  );
  return page.$eval(selector, (el) => {
    const element = el as HTMLElement;
    const json = element.dataset.negotiation;
    // fixture 側は必ず JSON.stringify(...) で非空文字を書き込むが、防御として空文字時は
    // 明示的に throw して原因を即座に特定できるようにする
    if (json === undefined || json === "") {
      throw new Error("#stereo-negotiation dataset.negotiation is empty");
    }
    return JSON.parse(json) as T;
  });
}

// opus payload type を SDP から抽出する。WebRTC では opus channel 数は rtpmap で常に 2 と
// して宣言されるが、保険として末尾の channel 数は緩く受ける。CRLF SDP の `\r` を許容する
// ため末尾に `\r?` を入れる
export function getOpusPayloadType(sdp: string): number | null {
  const match = /^a=rtpmap:(\d+) opus\/48000\/\d+\r?$/mu.exec(sdp);
  return match === null ? null : Number.parseInt(match[1], 10);
}

// opus payload type に対応する fmtp 行のパラメータ列を抽出する内部 helper。
// CRLF / LF どちらの SDP でも末尾の \r を group 1 に含めないため `([^\r\n]+)` で行末文字を除外
function extractFmtpParams(sdp: string, payloadType: number): string[] | null {
  const fmtpRegex = new RegExp(`^a=fmtp:${payloadType} ([^\\r\\n]+)$`, "mu");
  const match = fmtpRegex.exec(sdp);
  if (match === null) {
    return null;
  }
  return match[1].split(";").map((param) => param.trim());
}

export function hasOpusStereo(sdp: string, payloadType: number): boolean {
  const params = extractFmtpParams(sdp, payloadType);
  return params !== null && params.includes("stereo=1");
}

// `appendStereo` の冪等ガードが壊れて二重付与された場合を検知するため、
// `stereo=1` の出現回数を返す
export function countOpusStereo(sdp: string, payloadType: number): number {
  const params = extractFmtpParams(sdp, payloadType);
  if (params === null) {
    return 0;
  }
  return params.filter((param) => param === "stereo=1").length;
}

export function hasOpusMinptime(sdp: string, payloadType: number): boolean {
  const params = extractFmtpParams(sdp, payloadType);
  return params !== null && params.some((param) => /^minptime=\d+$/u.test(param));
}
```

### §3. SDP assert の方針

| ロール                                      | 検証する SDP                          | 期待                                             |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| sendonly (publisher)                        | PC の `localDescription` (SDK answer) | opus fmtp に `stereo=1` (送信ネゴ)               |
| recvonly + `forceStereoOutput` (subscriber) | PC の `localDescription` (SDK answer) | opus fmtp に `stereo=1` (`addStereoToFmtp` 経由) |
| sendrecv (publisher)                        | PC の `localDescription` (SDK answer) | opus fmtp に `stereo=1`                          |

`stereo=1` の出現回数を `countOpusStereo` で 1 回ぴったりに assert することで、`appendStereo` の冪等ガードが壊れて二重付与される回帰も E2E で検知する。

sendrecv の `conn1LocalSdp` の `stereo=1` 必須 assert は **Sora の offer 反映 + Chrome の `createAnswer` echo の両方に依存** する best-effort assert で、ブラウザを Chromium project に固定することで安定性を担保する。他ブラウザでは挙動が変わる可能性があるため本 issue の対象外。

#### `recvLocalSdp` の `minptime` 依存 (stereo テスト時のみ適用)

`SoraRecvClient` の options に `audioOpusParamsMinptime: 10` を `forceStereoOutput` 立ち時のみ設定する目的は、Sora の offer に `minptime` を促し、ブラウザの `createAnswer` が answer 側にも `minptime` を保持して `addStereoToFmtp` の起動条件を成立させるため。Sora が `audio.opus_params.minptime` を受けて offer SDP に必ず反映する仕様は SDK 単独では保証できないため、stereo テスト経路で分岐する:

- `recvLocalSdp` に opus minptime あり → `countOpusStereo(recvLocalSdp, recvPt) === 1` を assert
- `recvLocalSdp` に opus minptime なし → fail させず、annotation と `console.log` の **両方** で記録:
  - `test.info().annotations.push({ type: "recv-minptime-absent", description: "recv minptime が answer SDP に無いため stereo=1 assert を緩めた" })` (annotation。Playwright の `test.skip` ステータスと誤読されないよう type は `"recv-minptime-absent"`)
  - `console.log("[recv-minptime-absent] recv minptime が answer SDP に無いため stereo=1 assert を緩めた")` (list reporter でも目視可能にする。Playwright の `list` reporter は annotation を標準では表示しないため併用する)
  - SDP 全文と `sendOpusCodec` も追加で `console.log` し CI 失敗時の調査材料とする

### §4. テスト変更 (`e2e-tests/tests/stereo_audio.test.ts`)

- stereo テスト: `#use-stereo` を check、`#force-stereo-output` を **明示的に** check (HTML 初期値 checked への暗黙依存を解消) した上で:
  - `waitForStereoNegotiationData<StereoNegotiationData>(page)` で dataset を取得
  - `expect(sendLocalSdp).not.toBe("")` と `expect(sendLocalSdp).toMatch(/^v=0/u)` で SDP 取得自体の成立を先に確認
  - 同様に `expect(recvLocalSdp).not.toBe("")` と `expect(recvLocalSdp).toMatch(/^v=0/u)`
  - `getOpusPayloadType(sendLocalSdp)` で payload type を得て `expect(countOpusStereo(sendLocalSdp, pt)).toBe(1)` を assert (送信ネゴが 1 回だけ付与されること)
  - recvLocalSdp については §3 の minptime 依存分岐で minptime あり時のみ `expect(countOpusStereo(recvLocalSdp, recvPt)).toBe(1)` を assert。なし時は annotation + `console.log` で記録
- mono テスト: `#use-stereo` と `#force-stereo-output` をいずれも明示的に uncheck した上で:
  - `expect(sendLocalSdp).toMatch(/^v=0/u)` 等の事前 assert を経由してから
  - `expect(hasOpusStereo(sendLocalSdp, pt)).toBe(false)` と `expect(hasOpusStereo(recvLocalSdp, recvPt)).toBe(false)` を assert
- 既存の `analysisData.*.isStereo` assert と RTP bytes assert は緩めずそのまま維持する
- codec stats の `channels` は assert しない (参考ログのみ)
- 各テスト末尾の `await page.close()` を `try { ... } finally { await page.close(); }` で囲み、テスト失敗時にも page が確実に閉じるようにする (Playwright `retries: 3` 下での page leak 対策)

### §5. regression 確認 (必須)

検知が機能することを以下の 3 経路すべてで個別に確認し、各経路の改変を必ず revert する。すべての改変は **作業ツリーのみで実施し、コミットや push はしない** (`shiguredo-git` 規約の「全テストが通らない限りコミットしない」と整合する一時改変フェーズ)。

実行コマンドは pnpm スクリプトをリポジトリ root で実行する。本 issue の作業期間中は `pnpm run e2e-test` (= 全 E2E テスト実行) は使わず、stereo_audio 系のみ対象指定で実行する (`package.json` の `e2e-test` は project 名が小文字 `chromium` で playwright.config.ts の `Chromium` と不整合な点も別 issue 化対象だが本 issue では触れない)。経路 3 / 4 / mixed 事前確認 / Sora 仕様事前確認のすべてで、`dist/sora.js` を確実に最新化するため:

- 経路 3 / 4 の直前で `pnpm run build` を必ず実行する
- もし dev サーバ (`pnpm run e2e-dev`) を起動済みの場合は kill してから playwright test を実行する。`playwright.config.ts:98` の `webServer.reuseExistingServer: !process.env.CI` は dev サーバが kill 済みなら新規起動して最新 `dist/sora.js` をロードし、起動中なら既存サーバを再利用する。後者は vite の module ロードで main.ts は反映されるが SDK 改変の反映は保証されないため、SDK 側を改変する経路では起動中サーバを kill する

| 経路                                        | 改変対象                                                                                                                             | ビルド要否                                                                                                         | 実行コマンド                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1 ユニット                                  | `src/utils.ts` の `appendStereo` を `return mediaDescription;` の no-op 化                                                           | 不要 (vitest が src を直接読む)                                                                                    | `pnpm test`                                                                                             |
| 2 E2E 送信 (sendonly + recvonly)            | `fake_stereo_audio/main.ts` の `SoraSendClient` constructor で `baseOptions.audioOpusParamsStereo = true;` の代入を削除              | 不要 (vite が main.ts を再ロードして反映)                                                                          | `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts`                   |
| 3 E2E 受信 (recvonly + `forceStereoOutput`) | `src/utils.ts` の `appendStereo` を `return mediaDescription;` の no-op 化                                                           | **必要** (e2e-tests/vite.config.ts の alias `sora-js-sdk` が `../dist/sora.js` を指すため SDK 改変は rebuild 必須) | `pnpm run build && pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts` |
| 4 E2E 送信 (sendrecv)                       | `fake_stereo_audio_sendrecv/main.ts` の `SoraSendRecvClient` constructor で `baseOptions.audioOpusParamsStereo = true;` の代入を削除 | 不要 (vite が main.ts を再ロードして反映)                                                                          | `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio_sendrecv.test.ts`          |

#### 期待

- 経路 1: `tests/utils.test.ts` の §0 ケース 1 (正常系) と §0 ケース 8 (`isAudio` ゲート) が fail することを確認。`appendStereo` の no-op 化では §0 ケース 2 (冪等)・ケース 3 (`minptime` 欠落)・ケース 4-7 (各種ゲート)・ケース 9 (`splitSdp === null`) は元々付与されない / replace されない経路のため pass のままで、§5 経路 1 だけで全 §0 ケースの回帰検知能力を確認できるわけではない。テスト本体の仕様固定は §0 のテスト名・固定 SDP 逐語比較が担う
- 経路 2: stereo テストの `sendLocalSdp` の `countOpusStereo` assert が空文字フォールバックではなく `stereo=1` 不在で fail することを確認
- 経路 4: sendrecv の stereo / mixed テストの `countOpusStereo(conn1LocalSdp, pt)` assert が空文字フォールバックではなく `stereo=1` 不在で fail することを確認
- 経路 3 の事前確認: 経路 3 の改変前に `pnpm run build && pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts` を 1 回走らせ、stereo テストが pass し annotation `recv-minptime-absent` が記録されていないこと (= recv 側 minptime が answer に出ている状態) を確認する。annotation の確認は HTML reporter (`--reporter=html`) で test 詳細の "Annotations" を見る、または stdout の `console.log("[recv-minptime-absent] ...")` の有無で判定する。確認した Chromium のフルバージョンを PR description に記載する
- 経路 3 の検証: 経路 3 改変後に同コマンドで stereo テストの `recvLocalSdp` の `countOpusStereo` assert が fail することを確認。事前確認で annotation が記録されていた環境では経路 3 は silent pass する可能性があり、その場合は経路 3 の検証を skip した旨を PR description に残す

#### mixed テスト変更による analyser assert 退行の事前確認

§6 で mixed テストの `#force-stereo-output-1` / `#force-stereo-output-2` を check から uncheck に変更する。これは SDP 上は no-op (sendrecv の `isRecvOnly` ゲートで弾かれる) だが、ブラウザの opus decoder が受信 stream を mono に縮退する可能性 (`stereo=1` 明示なしで decode が落ちる可能性) が完全には排除できない。`pnpm run build && pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio_sendrecv.test.ts` を 1 回走らせ、`analysisData.connection2.remote.isStereo === true` の assert が引き続き pass することを確認する。pass しない場合は `#force-stereo-output-*` を mixed テストでは現状の check 状態に戻し、SDP assert 方針を §6 で再検討する。

#### mixed テストの conn2 SDP assert に関する Sora 仕様事前確認

§6 mixed テストで「conn2 の `localDescription` opus fmtp に `stereo=1` トークンが **含まれない**」を assert する前提として、Sora が「同一チャネルで `audioOpusParamsStereo: true` を送る他クライアントが居る」状況で、`audioOpusParamsStereo` を送らない conn2 の offer SDP に `stereo` パラメータを **載せない**ことを 1 度だけ手動確認する。確認手順は「mixed テスト変更後に conn2 の `recvLocalSdp` を `console.log` で出力 → fmtp 行を目視」または「assert を一時的に追加して CI を 1 回通す」のいずれか。Sora が conn2 にも `stereo=1` を載せる仕様だった場合、本 issue では conn2 nothing-assert を諦め annotation 記録に変更し、別 issue で「Sora の `audioOpusParamsStereo` のチャネル単位反映仕様確認」を起票する。

### §6. sendrecv fixture (`fake_stereo_audio_sendrecv` / `stereo_audio_sendrecv.test.ts`)

#### 方向差と `forceStereoOutput` の扱い

sendrecv 接続の audio m セクションは `sendrecv` 方向で `a=recvonly` ではないため、`addStereoToFmtp` は `isRecvOnly` ゲートで弾かれ no-op になる。よって `forceStereoOutput` を check / uncheck どちらでも SDP 上の差は生まれない。本 issue では現状テスト (`stereo_audio_sendrecv.test.ts:47-48, 151-152, 241-244`) で `#force-stereo-output-1` / `#force-stereo-output-2` を check / uncheck している状態を全テストで明示的に uncheck に統一する。`forceStereoOutput` 経路の決定的検証は §0 ユニットテストに完全委譲する。

`SoraSendRecvClient` には `audioOpusParamsMinptime` を設定しない (sendrecv では `addStereoToFmtp` が呼ばれないため minptime 依存ロジックが発動せず、minptime を Sora に要求する必要が無い)。

#### dataset の atomic 書き込み

`#stereo-negotiation` に `{ conn1LocalSdp, conn2LocalSdp }` を 1 回の `JSON.stringify(...)` 書き込みで保存する。append 先は `#stats-report-1` の **子として** 動的 append する。fake_stereo_audio_sendrecv の現行 `#get-stats` ハンドラは `statsDiv1.innerHTML = statsHtml;` で `#stats-report-1` の中身を上書きするため、`#stereo-negotiation` の append は既存 `innerHTML` 上書きの **後**に行う (順序: `statsDiv1.innerHTML 上書き → #stereo-negotiation の remove (空振り) → append`)。

```ts
document.querySelector("#get-stats")?.addEventListener("click", async () => {
  if (!soraClient1 || !soraClient2) {
    return;
  }
  // 既存の stats / analysis 処理 (statsDiv1.innerHTML 上書きを含む) はそのまま維持する
  // ...

  document.querySelector("#stereo-negotiation")?.remove();

  const negotiationDiv = document.createElement("div");
  negotiationDiv.id = "stereo-negotiation";
  negotiationDiv.dataset.negotiation = JSON.stringify({
    conn1LocalSdp: soraClient1.getLocalSdp() ?? "",
    conn2LocalSdp: soraClient2.getLocalSdp() ?? "",
  });
  document.querySelector("#stats-report-1")?.append(negotiationDiv);
});
```

#### テスト方針 (stereo / mono / mixed)

| テスト | `#use-stereo-1` | `#use-stereo-2` | `#force-stereo-output-1` | `#force-stereo-output-2` | SDP assert (conn1)                           | SDP assert (conn2)                               |
| ------ | --------------- | --------------- | ------------------------ | ------------------------ | -------------------------------------------- | ------------------------------------------------ |
| stereo | check           | check           | uncheck                  | uncheck                  | `countOpusStereo(conn1LocalSdp, pt) === 1`   | `countOpusStereo(conn2LocalSdp, pt) === 1`       |
| mono   | uncheck         | uncheck         | uncheck                  | uncheck                  | `hasOpusStereo(conn1LocalSdp, pt) === false` | `hasOpusStereo(conn2LocalSdp, pt) === false`     |
| mixed  | check           | uncheck         | uncheck                  | uncheck                  | `countOpusStereo(conn1LocalSdp, pt) === 1`   | §5 の Sora 仕様事前確認結果に従う (含まない想定) |

すべてのテストで HTML 初期値 (`fake_stereo_audio_sendrecv/index.html` の `#use-stereo-*` / `#force-stereo-output-*` の初期 checked) への暗黙依存を解消するため、4 つの checkbox を表のとおり明示的に check / uncheck する。

mixed テストの conn2 SDP assert は §5「mixed テストの conn2 SDP assert に関する Sora 仕様事前確認」結果に従う。事前確認で「Sora は conn2 の offer に stereo を載せない」が確認できれば `hasOpusStereo(conn2LocalSdp, pt) === false` を必須 assert にする。Sora が conn2 にも stereo を載せる仕様だった場合は annotation `conn2-stereo-included-by-sora` で記録し、別 issue で扱う。

#### sendrecv 側の constructor / メソッド

`SoraSendRecvClient` も `fixtureOptions: { useStereo: boolean }` を constructor 引数で受け取る形に揃える。`getLocalSdp()` メソッドを追加する点は §1 と同じ。

```ts
class SoraSendRecvClient {
  private readonly options: ConnectionOptions;
  // ...
  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    connectionNumber: string,
    fixtureOptions: { useStereo: boolean },
  ) {
    const baseOptions: ConnectionOptions = { connectionTimeout: 15_000 };
    if (fixtureOptions.useStereo) {
      baseOptions.audioOpusParamsStereo = true;
    }
    this.options = baseOptions;
    // ...
  }

  getLocalSdp(): string | null {
    return this.connection.pc?.localDescription?.sdp ?? null;
  }
}
```

`#disconnect` ハンドラでは 2 接続分の cleanup を個別に呼ぶ:

```ts
if (fakeCleanup1) {
  fakeCleanup1();
  fakeCleanup1 = null;
}
if (fakeCleanup2) {
  fakeCleanup2();
  fakeCleanup2 = null;
}
```

## 完了条件

### コード変更

- [ ] `tests/utils.test.ts` に §0 の 9 テストケースを既存テストの末尾に追加する
- [ ] `e2e-tests/tests/helper.ts` に §2 の型と関数を追加する
- [ ] `e2e-tests/fake_stereo_audio/main.ts` を §1 のとおり書き換える
- [ ] `e2e-tests/fake_stereo_audio_sendrecv/main.ts` を §6 のとおり書き換える
- [ ] `e2e-tests/tests/stereo_audio.test.ts` の stereo / mono テストに §4 の SDP assert を追加する
- [ ] `e2e-tests/tests/stereo_audio_sendrecv.test.ts` の stereo / mono / mixed テストに §6 の SDP assert を追加する

### 検証

すべて pnpm スクリプトをリポジトリ root で実行する。

- [ ] `pnpm test` が通る (`tests/utils.test.ts` の新規 9 テストを含む)
- [ ] `pnpm run lint` および `pnpm run typecheck` が通る (これらは `src/` / `tests/` のみが対象。`vite.config.ts:869` で `e2e-tests/**` は lint 除外、ルート `tsconfig.json` の `include` も `src/**/*.ts` のみで e2e-tests は対象外)
- [ ] `pnpm run build` で `dist/sora.js` / `dist/sora.d.ts` を生成してから e2e-tests の型確認に進む (`e2e-tests/tsconfig.json` の `paths.sora-js-sdk` は `../dist/sora.d.ts` を指すため、build 前は `Cannot find module 'sora-js-sdk'` で必ず fail する)
- [ ] e2e-tests の型確認: `pnpm exec tsc --noEmit -p e2e-tests/tsconfig.json` で型エラーが無いことを確認する。本 tsconfig は `include` 指定が無く e2e-tests 配下全 `.ts` を巻き込むため、新規追加した fixture main.ts / helper.ts 以外で型エラーが検出された場合は、本 issue の作業ブランチで新規発生したものだけを修正対象とし、既存ブランチ (develop) でも再現するものは別 issue 化する
- [ ] ローカル: `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts e2e-tests/tests/stereo_audio_sendrecv.test.ts` が通る (dev サーバを事前起動済みの場合は kill してから実行する)
- [ ] mixed テストの事前確認 (§5「mixed テスト変更による analyser assert 退行の事前確認」) を実施する
- [ ] mixed テストの Sora 仕様事前確認 (§5「mixed テストの conn2 SDP assert に関する Sora 仕様事前確認」) を実施し、conn2 nothing-assert を必須にするか annotation 化するか決定する
- [ ] regression 確認 (必須): §5 表の経路 1 / 経路 2 / 経路 3 / 経路 4 すべてでテストが fail することを確認し改変を revert する。経路 3 では事前確認で `minptime` が answer に出ていた Chromium のフルバージョンを PR description に記載する
- [ ] CI: e2e-test workflow が green であること

### 変更履歴

- [ ] `CHANGES.md` `## develop` `### misc` の既存 `[FIX]` 群の末尾 (現状の `e2e 系 workflow 5 本に permissions ...` の直下) に追記する (e2e-tests / tests 内部限定の変更で SDK 利用者への影響はないため `[FIX]`。0028 (`[FIX] e2e-tests の fake media 生成で ...`) と種別を揃える)

  ```
  - [FIX] e2e-tests と tests で SDK の stereo ネゴ (addStereoToFmtp / audio.opus_params.stereo) の回帰を検知できるようにする
    - @voluntas
  ```

## スコープ外

- SDK 本体 (`src/base.ts`、`src/utils.ts`) の stereo ロジック変更
- `addStereoToFmtp` の `isFmtp` ゲートが opus payload type を特定しない設計上の弱点 (非 opus 行への誤付与の理論的可能性) は別 issue で扱う。本 issue は `addStereoToFmtp` の現状挙動をテストで仕様として固定するに留める
- `audioOpusParamsSpropStereo` / SDP `sprop-stereo=1` の個別 assert (Sora answer 依存が強く、本 issue では `stereo=1` を必須とする)
- `RealtimeAudioAnalyzer.channelCount` の取得方法の変更 (analyser は補助に降格するため現状維持)
- `waitForTimeout` 置換 (issue 0032)
- npm pkg e2e (`npm-pkg-e2e-test.yml`) — 公開済み SDK version 固定のため対象外
- `package.json` の `e2e-test` script の project 名 typo (`chromium` vs `Chromium`) の修正
