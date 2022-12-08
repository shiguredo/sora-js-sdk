import { RTCEncodedAudioFrame } from "./types";

import {
  LYRA_VERSION,
  LyraEncoder,
  LyraDecoder,
  LyraModule,
  LyraEncoderOptions,
  LyraDecoderOptions,
} from "@shiguredo/lyra-wasm";

let LYRA_CONFIG: LyraConfig | undefined;
let LYRA_MODULE: LyraModule | undefined;

export interface LyraConfig {
  wasmPath: string;
  modelPath: string;
}

export function initLyra(config: LyraConfig): void {
  LYRA_CONFIG = config;
  LYRA_MODULE = undefined;
}

export function isLyraInitialized(): boolean {
  return LYRA_CONFIG !== undefined;
}

export async function createLyraEncoder(options: LyraEncoderOptions = {}): Promise<LyraEncoder> {
  return (await loadLyraModule()).createEncoder(options);
}

export async function createLyraDecoder(options: LyraDecoderOptions = {}): Promise<LyraDecoder> {
  return (await loadLyraModule()).createDecoder(options);
}

async function loadLyraModule(): Promise<LyraModule> {
  if (LYRA_CONFIG === undefined) {
    throw new Error("Lyra has not been initialized. Please call `Sora.initLyra()` beforehand.");
  }

  if (LYRA_MODULE === undefined) {
    LYRA_MODULE = await LyraModule.load(LYRA_CONFIG.wasmPath, LYRA_CONFIG.modelPath);
  }

  return LYRA_MODULE;
}

export function transformPcmToLyra(
  encoder: LyraEncoder,
  encodedFrame: RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController
): void {
  const view = new DataView(encodedFrame.data);
  const rawData = new Int16Array(encodedFrame.data.byteLength / 2);
  for (let i = 0; i < encodedFrame.data.byteLength; i += 2) {
    rawData[i / 2] = view.getInt16(i, false);
  }
  const encoded = encoder.encode(rawData);
  if (encoded === undefined) {
    // DTX
    return;
  }
  encodedFrame.data = encoded.buffer;
  controller.enqueue(encodedFrame);
}

export function transformLyraToPcm(
  decoder: LyraDecoder,
  encodedFrame: RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController
): void {
  if (encodedFrame.data.byteLength === 0) {
    // FIXME(sile): sora-cpp-sdk の実装だと DTX の場合にペイロードサイズが 0 のパケットが飛んでくる可能性がある
    //              一応保険としてこのチェックを入れているけれど、もし不要だと分かったら削除してしまう
    return;
  }

  const decoded = decoder.decode(new Uint8Array(encodedFrame.data));
  const buffer = new ArrayBuffer(decoded.length * 2);
  const view = new DataView(buffer);
  for (const [i, v] of decoded.entries()) {
    view.setInt16(i * 2, v, false);
  }
  encodedFrame.data = buffer;
  controller.enqueue(encodedFrame);
}

export class LyraParams {
  readonly version: string;
  readonly bitrate: 3200 | 6000 | 9200;
  readonly enableDtx: boolean;

  constructor(version: string, bitrate: number, enableDtx: boolean) {
    if (version !== LYRA_VERSION) {
      throw new Error(`UnsupportedLlyra version: ${version} (supported version is ${LYRA_VERSION})`);
    }
    if (bitrate !== 3200 && bitrate !== 6000 && bitrate !== 9200) {
      throw new Error(`Unsupported Lyra bitrate: ${bitrate} (must be one of 3200, 6000, or 9200)`);
    }

    this.version = version;
    this.bitrate = bitrate;
    this.enableDtx = enableDtx;
  }

  static parseMediaDescription(media: string): LyraParams {
    const version = /a=fmtp:109.*[ ;]version=([0-9.]+)([;]|$)/.exec(media);
    if (!version) {
      throw new Error(`Lyra parameter 'version' is not found in media description: ${media}`);
    }

    const bitrate = /a=fmtp:109.*[ ;]bitrate=([0-9]+)([;]|$)/.exec(media);
    if (!bitrate) {
      throw new Error(`Lyra parameter 'bitrate' is not found in media description: ${media}`);
    }

    const usedtx = /a=fmtp:109.*[ ;]usedtx=([01])([;]|$)/.exec(media);
    if (!usedtx) {
      throw new Error(`Lyra parameter 'usedtx' is not found in media description: ${media}`);
    }

    return new LyraParams(version[1], Number(bitrate[1]), usedtx[1] == "1");
  }

  toFmtpString(): string {
    return `a=fmtp:109 version=${this.version};bitrate=${this.bitrate};usedtx=${this.enableDtx ? 1 : 0}`;
  }
}
