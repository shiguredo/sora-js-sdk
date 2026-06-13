import type {
  Browser,
  ConnectionOptions,
  DataChannelConfiguration,
  DataChannelEvent,
  DataChannelMessageEvent,
  JSONType,
  SignalingConnectDataChannel,
  SignalingConnectMessage,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyMetadata,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
} from "./types";

function browser(): Browser {
  const ua = window.navigator.userAgent.toLocaleLowerCase();
  if (ua.includes("edge")) {
    return "edge";
  }
  if (ua.includes("chrome") && !ua.includes("edge")) {
    return "chrome";
  }
  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "safari";
  }
  if (ua.includes("opera")) {
    return "opera";
  }
  if (ua.includes("firefox")) {
    return "firefox";
  }
  return null;
}

function enabledSimulcast(): boolean {
  const REQUIRED_HEADER_EXTENSIONS = [
    "urn:ietf:params:rtp-hdrext:sdes:mid",
    "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
    "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
  ];

  if (!window.RTCRtpSender) {
    return false;
  }
  if (!RTCRtpSender.getCapabilities) {
    return false;
  }
  const capabilities = RTCRtpSender.getCapabilities("video");
  if (!capabilities) {
    return false;
  }
  const headerExtensions = new Set(capabilities.headerExtensions.map((h) => h.uri));
  const hasAllRequiredHeaderExtensions = REQUIRED_HEADER_EXTENSIONS.every((h) =>
    headerExtensions.has(h),
  );
  return hasAllRequiredHeaderExtensions;
}

function parseDataChannelConfiguration(
  dataChannelConfiguration: unknown,
): SignalingConnectDataChannel {
  if (typeof dataChannelConfiguration !== "object" || dataChannelConfiguration === null) {
    throw new Error(
      "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
    );
  }
  const configuration = dataChannelConfiguration as DataChannelConfiguration;
  const result: SignalingConnectDataChannel = {};
  if (typeof configuration.label === "string") {
    result.label = configuration.label;
  }
  if (typeof configuration.direction === "string") {
    result.direction = configuration.direction;
  }
  if (typeof configuration.ordered === "boolean") {
    result.ordered = configuration.ordered;
  }
  if (typeof configuration.compress === "boolean") {
    result.compress = configuration.compress;
  }
  if (typeof configuration.maxPacketLifeTime === "number") {
    result.max_packet_life_time = configuration.maxPacketLifeTime;
  }
  if (typeof configuration.maxRetransmits === "number") {
    result.max_retransmits = configuration.maxRetransmits;
  }
  if (typeof configuration.protocol === "string") {
    result.protocol = configuration.protocol;
  }
  // array の中身はチェックしていない
  if (Array.isArray(configuration.header)) {
    result.header = configuration.header;
  }
  return result;
}

function parseDataChannelConfigurations(
  dataChannelConfigurations: unknown[],
): SignalingConnectDataChannel[] {
  const result: SignalingConnectDataChannel[] = [];
  for (const dataChannelConfiguration of dataChannelConfigurations) {
    result.push(parseDataChannelConfiguration(dataChannelConfiguration));
  }
  return result;
}

export function isSafari(): boolean {
  return browser() === "safari";
}

export function isChrome(): boolean {
  return browser() === "chrome";
}

export function isFirefox(): boolean {
  return browser() === "firefox";
}

export function createSignalingMessage(
  offerSDP: string,
  role: string,
  channelId: string | null | undefined,
  metadata: JSONType | undefined,
  options: ConnectionOptions,
  redirect: boolean,
): SignalingConnectMessage {
  if (role !== "sendrecv" && role !== "sendonly" && role !== "recvonly") {
    throw new Error("Unknown role type");
  }
  if (channelId === null || channelId === undefined) {
    throw new Error("channelId can not be null or undefined");
  }
  const message: SignalingConnectMessage = {
    audio: true,
    channel_id: channelId,
    environment: window.navigator.userAgent,
    role,
    sdp: offerSDP,
    sora_client: `Sora JavaScript SDK ${__SORA_JS_SDK_VERSION__}`,
    type: "connect",
    video: true,
  };
  if (redirect) {
    message.redirect = true;
  }
  if (typeof options.simulcast === "boolean") {
    message.simulcast = options.simulcast;
  }
  const simulcastRids = ["r0", "r1", "r2"];
  if (options.simulcastRid !== undefined && simulcastRids.includes(options.simulcastRid)) {
    message.simulcast_rid = options.simulcastRid;
  }
  const simulcastRequestRids = ["none", "r0", "r1", "r2"];
  if (
    options.simulcastRequestRid !== undefined &&
    simulcastRequestRids.includes(options.simulcastRequestRid)
  ) {
    message.simulcast_request_rid = options.simulcastRequestRid;
  }

  if (typeof options.spotlight === "boolean") {
    message.spotlight = options.spotlight;
  }
  if (typeof options.spotlightNumber === "number") {
    message.spotlight_number = options.spotlightNumber;
  }
  const spotlightFocusRids = ["none", "r0", "r1", "r2"];
  if (
    options.spotlightFocusRid !== undefined &&
    spotlightFocusRids.includes(options.spotlightFocusRid)
  ) {
    message.spotlight_focus_rid = options.spotlightFocusRid;
  }
  if (
    options.spotlightUnfocusRid !== undefined &&
    spotlightFocusRids.includes(options.spotlightUnfocusRid)
  ) {
    message.spotlight_unfocus_rid = options.spotlightUnfocusRid;
  }
  if (metadata !== undefined) {
    message.metadata = metadata;
  }
  if (options.signalingNotifyMetadata !== undefined) {
    message.signaling_notify_metadata = options.signalingNotifyMetadata;
  }
  if (options.forwardingFilters !== undefined) {
    message.forwarding_filters = options.forwardingFilters;
  }
  if (options.forwardingFilter !== undefined) {
    message.forwarding_filter = options.forwardingFilter;
  }
  if (options.clientId !== undefined) {
    message.client_id = options.clientId;
  }
  if (options.bundleId !== undefined) {
    message.bundle_id = options.bundleId;
  }
  if (typeof options.dataChannelSignaling === "boolean") {
    message.data_channel_signaling = options.dataChannelSignaling;
  }

  if (typeof options.ignoreDisconnectWebSocket === "boolean") {
    message.ignore_disconnect_websocket = options.ignoreDisconnectWebSocket;
  }

  // parse options
  const audioPropertyKeys = ["audioCodecType", "audioBitRate"];
  const audioOpusParamsPropertyKeys = [
    "audioOpusParamsChannels",
    "audioOpusParamsMaxplaybackrate",
    "audioOpusParamsStereo",
    "audioOpusParamsSpropStereo",
    "audioOpusParamsMinptime",
    "audioOpusParamsPtime",
    "audioOpusParamsUseinbandfec",
    "audioOpusParamsUsedtx",
  ];
  const videoPropertyKeys = [
    "videoCodecType",
    "videoBitRate",
    "videoVP9Params",
    "videoH264Params",
    "videoH265Params",
    "videoAV1Params",
  ];
  const copyOptions = { ...options };
  for (const key of Object.keys(copyOptions) as Array<keyof ConnectionOptions>) {
    if (key === "audio" && typeof copyOptions[key] === "boolean") {
      continue;
    }
    if (key === "video" && typeof copyOptions[key] === "boolean") {
      continue;
    }
    // null だけでなく undefined も delete 側に流すために両方を明示的に弾く
    // (`!== null` 単独だと `undefined !== null` が真になり `undefined` キーが残ってしまうため)
    if (
      audioPropertyKeys.includes(key) &&
      copyOptions[key] !== null &&
      copyOptions[key] !== undefined
    ) {
      continue;
    }
    if (
      audioOpusParamsPropertyKeys.includes(key) &&
      copyOptions[key] !== null &&
      copyOptions[key] !== undefined
    ) {
      continue;
    }
    if (
      videoPropertyKeys.includes(key) &&
      copyOptions[key] !== null &&
      copyOptions[key] !== undefined
    ) {
      continue;
    }
    delete copyOptions[key];
  }

  if (copyOptions.audio !== undefined) {
    message.audio = copyOptions.audio;
  }
  const hasAudioProperty = Object.keys(copyOptions).some((key) => audioPropertyKeys.includes(key));
  if (message.audio && hasAudioProperty) {
    message.audio = {};
    if ("audioCodecType" in copyOptions) {
      message.audio.codec_type = copyOptions.audioCodecType;
    }
    if ("audioBitRate" in copyOptions) {
      message.audio.bit_rate = copyOptions.audioBitRate;
    }
  }
  const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) =>
    audioOpusParamsPropertyKeys.includes(key),
  );
  if (message.audio && hasAudioOpusParamsProperty) {
    if (typeof message.audio !== "object") {
      message.audio = {};
    }
    message.audio.opus_params = {};
    if ("audioOpusParamsChannels" in copyOptions) {
      message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
    }
    if ("audioOpusParamsMaxplaybackrate" in copyOptions) {
      message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
    }
    if ("audioOpusParamsStereo" in copyOptions) {
      message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
    }
    if ("audioOpusParamsSpropStereo" in copyOptions) {
      message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo;
    }
    if ("audioOpusParamsMinptime" in copyOptions) {
      message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime;
    }
    if ("audioOpusParamsPtime" in copyOptions) {
      message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime;
    }
    if ("audioOpusParamsUseinbandfec" in copyOptions) {
      message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec;
    }
    if ("audioOpusParamsUsedtx" in copyOptions) {
      message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx;
    }
  }

  if (copyOptions.video !== undefined) {
    message.video = copyOptions.video;
  }
  const hasVideoProperty = Object.keys(copyOptions).some((key) => videoPropertyKeys.includes(key));
  if (message.video && hasVideoProperty) {
    message.video = {};
    if ("videoCodecType" in copyOptions) {
      message.video.codec_type = copyOptions.videoCodecType;
    }
    if ("videoBitRate" in copyOptions) {
      message.video.bit_rate = copyOptions.videoBitRate;
    }
    if ("videoVP9Params" in copyOptions) {
      message.video.vp9_params = copyOptions.videoVP9Params;
    }
    if ("videoH264Params" in copyOptions) {
      message.video.h264_params = copyOptions.videoH264Params;
    }
    if ("videoH265Params" in copyOptions) {
      message.video.h265_params = copyOptions.videoH265Params;
    }
    if ("videoAV1Params" in copyOptions) {
      message.video.av1_params = copyOptions.videoAV1Params;
    }
  }

  if (message.simulcast && !enabledSimulcast() && role !== "recvonly") {
    throw new Error("Simulcast can not be used with this browser");
  }

  if (Array.isArray(options.dataChannels) && options.dataChannels.length > 0) {
    message.data_channels = parseDataChannelConfigurations(options.dataChannels);
  }

  if (options.audioStreamingLanguageCode !== undefined) {
    message.audio_streaming_language_code = options.audioStreamingLanguageCode;
  }

  return message;
}

export function getSignalingNotifyAuthnMetadata(
  message:
    | SignalingNotifyConnectionCreated
    | SignalingNotifyConnectionDestroyed
    | SignalingNotifyMetadata,
): JSONType {
  if (message.authn_metadata !== undefined) {
    return message.authn_metadata;
  }
  if (message.metadata !== undefined) {
    return message.metadata;
  }
  return null;
}

export function getSignalingNotifyData(
  message: SignalingNotifyConnectionCreated,
): SignalingNotifyMetadata[] {
  if (message.data && Array.isArray(message.data)) {
    return message.data;
  }
  if (message.metadata_list && Array.isArray(message.metadata_list)) {
    return message.metadata_list;
  }
  return [];
}

// trace ログ出力時に値を [REDACTED] に置換するキー名の集合
//
// metadata / signaling_notify_metadata / authn_metadata / authz_metadata は
// Sora シグナリングメッセージ・notify メッセージで JWT 等の機密情報を運ぶ
// 実フィールドのため、必ず redact する
//
// access_token / secret は Sora のシグナリングメッセージのトップレベルには
// 通常現れないが、利用者が指定する metadata の内部 (例: { metadata: { access_token } })
// や非 metadata キー配下に機密が現れた場合に再帰で捕捉するための defensive な
// キーとして含める
//
// 注意: REDACT_KEYS は types.ts の型定義と自動連動しない。機密キーが types.ts に
// 追加された場合は手動でここに追加すること
const REDACT_KEYS = new Set([
  "metadata",
  "signaling_notify_metadata",
  "authn_metadata",
  "authz_metadata",
  "access_token",
  "secret",
]);

/**
 * trace ログ出力時に機密キーの値を `[REDACTED]` に置換する
 *
 * @remarks
 * 入力は JSON サブセット (JSONType) を想定する。trace 経路に渡る値は signaling
 * メッセージ等の plain object / 配列 / プリミティブが大半。
 *
 * 挙動:
 *
 * - キー名の完全一致のみで判定する。値の中身を走査して JWT 文字列を検出する処理はしない
 * - 入力オブジェクトを mutation せず、plain object / 配列の場合は新しい値を返す
 *   (非破壊)。プリミティブ・クラスインスタンスは同じ参照/値を返す
 * - ネストしたオブジェクト・配列も再帰的に処理する
 * - プリミティブ値・null・undefined はそのまま返す
 * - 文字列 (例: `OFFER SDP` で渡される SDP 文字列) は早期 return 経路を通過するため
 *   redact 対象外 (issue 0020 設計方針より SDP は redact しない)
 * - `bigint` / `symbol` / `function` は JSONType の範囲外だが、早期 return 経路で
 *   そのまま素通りする。trace の呼び出し元はこれらを渡さない前提
 * - `Date` / `RegExp` / `RTCCertificate` / `RTCIceCandidate` 等の plain object
 *   ではないクラスインスタンスはそのまま返す。これらは `Object.entries` で
 *   getter ベースのプロパティが拾えず空オブジェクトに潰れてしまうため、
 *   `Object.getPrototypeOf` で plain object 判定して bypass する。前提として
 *   現状の trace 呼び出しサイトではクラスインスタンスの中に機密キーは含まれない
 *   (`RTCCertificate` / `RTCIceCandidate` 等のブラウザネイティブオブジェクトは
 *   metadata 等の機密フィールドを持たない)
 * - `Object.create(null)` 由来の prototype が `null` のオブジェクトは plain object
 *   と同等に redact 対象として扱う
 * - 循環参照を持つオブジェクトは `WeakSet` で検出し、再訪時は `"[Circular]"`
 *   文字列に置換することでスタックオーバーフローを防ぐ。`WeakSet` は再帰ツリー
 *   全体で共有されるため、DAG 構造 (同一オブジェクトを複数箇所から参照) でも
 *   後から訪れた参照は `"[Circular]"` に置換される。trace 経路に渡る値は signaling
 *   メッセージ等の tree 構造のみで、DAG は通常発生しない
 *
 * 利用範囲: trace 経路 (`utils.trace` / `ConnectionBase.trace`) 専用の内部ヘルパ。
 * SDK 利用者向けの公開 API ではない。
 *
 * @internal
 * @param value - redact 対象の値
 * @returns 機密キーの値が `[REDACTED]` に置換された値
 */
export function redact(value: unknown): unknown {
  return redactInner(value, new WeakSet());
}

/**
 * `redact` の再帰実装本体。訪問済みオブジェクト集合 `seen` を伝播させて
 * 循環参照を検出する
 */
function redactInner(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  // 循環参照を検出したら `[Circular]` 文字列に置換してスタックオーバーフローを防ぐ
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (Array.isArray(value)) {
    seen.add(value);
    // map に redactInner を直接渡すと余分な引数 (index / 配列) が seen 引数として
    // 渡ってしまうため、第一引数のみを受ける arrow 関数でラップする
    return value.map((v) => redactInner(v, seen));
  }
  // plain object 以外 (Date / RTCCertificate / RTCIceCandidate 等のクラスインスタンス)
  // は Object.entries で enumerable own data properties しか拾えず、getter ベースの
  // プロパティが失われて空オブジェクトに潰れてしまう。trace 経路で機密情報を含まない
  // ことが明らかなため、そのまま値を返す
  // (Object.getPrototypeOf の戻り値型は lib.es5 で any のため、明示的に object | null
  //  に絞る)
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACT_KEYS.has(key) ? "[REDACTED]" : redactInner(v, seen);
  }
  return result;
}

export function trace(clientId: string | null, title: string, value: unknown): void {
  const redactedValue = redact(value);
  const dump = (record: unknown): void => {
    if (record && typeof record === "object") {
      let keys = null;
      try {
        keys = Object.keys(structuredClone(record) as Record<string, unknown>);
      } catch {
        // 何もしない
      }
      if (keys && Array.isArray(keys)) {
        for (const key of keys) {
          // SDK のトレースログ出力のため console を使用する
          // eslint-disable-next-line no-console
          console.group(key);
          dump((record as Record<string, unknown>)[key]);
          // eslint-disable-next-line no-console
          console.groupEnd();
        }
      } else {
        // eslint-disable-next-line no-console
        console.info(record);
      }
    } else {
      // eslint-disable-next-line no-console
      console.info(record);
    }
  };
  let prefix = "";
  if (window.performance) {
    prefix = `[${(window.performance.now() / 1000).toFixed(3)}]`;
  }
  if (clientId) {
    prefix = `${prefix}[${clientId}]`;
  }

  // SDK のトレースログ出力のため console を使用する
  // eslint-disable-next-line no-console
  if (console.info !== undefined && console.group !== undefined) {
    // eslint-disable-next-line no-console
    console.group(`${prefix} ${title}`);
    dump(redactedValue);
    // eslint-disable-next-line no-console
    console.groupEnd();
  } else {
    // eslint-disable-next-line no-console
    console.log("%s %s\n", prefix, title, redactedValue);
  }
}

/**
 * Sora SDK の接続/切断系の失敗を表すエラー
 *
 * - code: WebSocket CloseEvent の code (IANA WebSocket Close Code) のみ格納する。
 *   それ以外の用途では使用しない。
 * - reason: WebSocket CloseEvent の reason 文字列、または SDK 内部のエラー分類コード
 *   (大文字スネークケース、例: WS_SEND_FAILED) のいずれかが入る。
 */
export class ConnectError extends Error {
  code?: number;
  reason?: string;

  constructor(message: string, code?: number, reason?: string) {
    super(message);
    this.name = "ConnectError";
    // exactOptionalPropertyTypes 対応のため、optional プロパティは undefined ではなく
    // プロパティ自体を含めないよう条件で代入する
    if (code !== undefined) {
      this.code = code;
    }
    if (reason !== undefined) {
      this.reason = reason;
    }
  }
}

export function createSignalingEvent(
  eventType: string,
  data: unknown,
  transportType: TransportType,
): SignalingEvent {
  const event = new Event(eventType) as SignalingEvent;
  // data をコピーする
  try {
    event.data = structuredClone(data);
  } catch {
    event.data = data;
  }
  event.transportType = transportType;
  return event;
}

export function createDataChannelData(channel: RTCDataChannel): Record<string, unknown> {
  return {
    binaryType: channel.binaryType,
    bufferedAmount: channel.bufferedAmount,
    bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
    id: channel.id,
    label: channel.label,
    maxPacketLifeTime: channel.maxPacketLifeTime,
    maxRetransmits: channel.maxRetransmits,
    negotiated: channel.negotiated,
    ordered: channel.ordered,
    protocol: channel.protocol,
    readyState: channel.readyState,
    // @ts-expect-error w3c 仕様には存在しない property
    reliable: channel.reliable,
  };
}

export function createTimelineEvent(
  eventType: string,
  data: unknown,
  logType: TimelineEventLogType,
  dataChannelId?: number | null,
  dataChannelLabel?: string,
): TimelineEvent {
  const event = new Event(eventType) as TimelineEvent;
  // data をコピーする
  try {
    event.data = structuredClone(data);
  } catch {
    event.data = data;
  }
  event.logType = logType;
  // exactOptionalPropertyTypes 対応のため、optional プロパティは undefined ではなく
  // プロパティ自体を含めないよう条件で代入する
  if (dataChannelId !== undefined) {
    event.dataChannelId = dataChannelId;
  }
  if (dataChannelLabel !== undefined) {
    event.dataChannelLabel = dataChannelLabel;
  }
  return event;
}

export function createDataChannelMessageEvent(
  label: string,
  data: ArrayBuffer,
): DataChannelMessageEvent {
  const event = new Event("message") as DataChannelMessageEvent;
  event.label = label;
  event.data = data;
  return event;
}

export function createDataChannelEvent(channel: DataChannelConfiguration): DataChannelEvent {
  const event = new Event("datachannel") as DataChannelEvent;
  event.datachannel = channel;
  return event;
}

export async function parseDataChannelEventData(
  eventData: unknown,
  compress: boolean,
): Promise<string> {
  if (compress) {
    const unzlibMessage = await decompressMessage(new Uint8Array(eventData as Uint8Array));
    return new TextDecoder().decode(unzlibMessage);
  }
  return eventData as string;
}

export const compressMessage = async (binaryMessage: Uint8Array): Promise<ArrayBuffer> => {
  const readableStream = new Blob([new Uint8Array(binaryMessage)]).stream();
  const compressedStream = readableStream.pipeThrough(new CompressionStream("deflate"));
  return new Response(compressedStream).arrayBuffer();
};

export const decompressMessage = async (binaryMessage: Uint8Array): Promise<ArrayBuffer> => {
  const readableStream = new Blob([new Uint8Array(binaryMessage)]).stream();
  const decompressedStream = readableStream.pipeThrough(new DecompressionStream("deflate"));
  return new Response(decompressedStream).arrayBuffer();
};

export function addStereoToFmtp(sdp: string): string {
  const splitSdp = /^(v=.+?)(m=audio.+)/msu.exec(sdp);
  if (splitSdp === null) {
    return sdp;
  }

  const sessionDescription = splitSdp[1];
  const mediaSection = splitSdp[2];
  // noUncheckedIndexedAccess により splitSdp[1] / splitSdp[2] は string | undefined になる
  // 正規表現が両方のキャプチャグループにマッチしているのでランタイムでは undefined にならないが、
  // 型を絞り込むため明示的にチェックする
  if (sessionDescription === undefined || mediaSection === undefined) {
    return sdp;
  }

  const mediaDescriptionsList: string[][] = [];
  let mediaDescriptionList: string[] = [];
  for (const line of mediaSection.split(/\n/u)) {
    const typ = line[0];
    if (typ === "m") {
      mediaDescriptionList = [line];
      mediaDescriptionsList.push(mediaDescriptionList);
    } else {
      mediaDescriptionList.push(line);
    }
  }

  const mediaDescriptions = mediaDescriptionsList.map((mediaDescription) =>
    mediaDescription.join("\n"),
  );

  const newMediaDescriptions = mediaDescriptions.map((mediaDescription) => {
    if (!isAudio(mediaDescription)) {
      return mediaDescription;
    }

    if (!isSetupActive(mediaDescription)) {
      return mediaDescription;
    }

    if (!isRecvOnly(mediaDescription)) {
      return mediaDescription;
    }

    if (!isOpus(mediaDescription)) {
      return mediaDescription;
    }

    if (!isFmtp(mediaDescription)) {
      return mediaDescription;
    }

    return appendStereo(mediaDescription);
  });

  return `${sessionDescription}${newMediaDescriptions.join("\n")}`;
}

function isAudio(mediaDescription: string): boolean {
  return mediaDescription.startsWith("m=audio");
}

function isSetupActive(mediaDescription: string): boolean {
  return mediaDescription.includes("a=setup:active");
}

function isRecvOnly(mediaDescription: string): boolean {
  return mediaDescription.includes("a=recvonly");
}

function isOpus(mediaDescription: string): boolean {
  return /a=rtpmap:\d+\sopus/u.test(mediaDescription);
}

function isFmtp(mediaDescription: string): boolean {
  return /a=fmtp:\d+/u.test(mediaDescription);
}

function appendStereo(mediaDescription: string): string {
  return mediaDescription.replace(
    /(?<!stereo=1;.*)minptime=\d+(?!.*stereo=1)/u,
    (match) => `${match};stereo=1`,
  );
}
