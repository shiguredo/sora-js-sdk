import { RTCEncodedAudioFrame } from "./types";

import {
  LYRA_VERSION,
  LyraEncoder,
  LyraDecoder,
  LyraModule,
  LyraEncoderOptions,
  LyraDecoderOptions,
} from "@shiguredo/lyra-wasm";

/**
 * Lyra を使用するために必要な設定を保持するためのグローバル変数
 *
 * undefined の場合には Lyra が無効になっていると判断され、
 * その状態で Lyra で音声をエンコード・デコード使用とすると実行時エラーとなる
 */
let LYRA_CONFIG: LyraConfig | undefined;

/**
 * Lyra のエンコード・デコードに必要な WebAssembly インスタンスを保持するためのグローバル変数
 */
let LYRA_MODULE: LyraModule | undefined;

/**
 * Lyra の設定情報
 */
export interface LyraConfig {
  /**
   * Lyra の WebAssembly ビルドファイルが配置されているディレクトリのパス（URL）
   */
  wasmPath: string;

  /**
   * Lyra のモデルファイルが配置されているディレクトリのパス（URL）
   */
  modelPath: string;
}

/**
 * Lyra の初期化を行うメソッド
 *
 * 詳細は sora.ts の initLyra() メソッドのドキュメントを参照
 */
export function initLyra(config: LyraConfig): boolean {
  if (!("createEncodedStreams" in RTCRtpSender.prototype)) {
    console.warn("This browser doesn't support WebRTC Encoded Transform feature that Lyra requires.");
    return false;
  }

  if (typeof SharedArrayBuffer === "undefined") {
    console.warn("Lyra requires cross-origin isolation to use SharedArrayBuffer.");
    return false;
  }

  LYRA_CONFIG = config;
  LYRA_MODULE = undefined;

  return true;
}

/***
 * Lyra が初期化済みかどうか
 *
 * @returns Lyra が初期化済みかどうか
 */
export function isLyraInitialized(): boolean {
  return LYRA_CONFIG !== undefined;
}

/**
 * Lyra のエンコーダを生成して返す
 *
 * @param options エンコーダに指定するオプション
 * @returns Lyra エンコーダのプロミス
 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
 */
export async function createLyraEncoder(options: LyraEncoderOptions = {}): Promise<LyraEncoder> {
  return (await loadLyraModule()).createEncoder(options);
}

/**
 * Lyra のデコーダを生成して返す
 *
 * @param options デコーダに指定するオプション
 * @returns Lyra デコーダのプロミス
 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
 */
export async function createLyraDecoder(options: LyraDecoderOptions = {}): Promise<LyraDecoder> {
  return (await loadLyraModule()).createDecoder(options);
}

/**
 * Lyra 用の WebAssembly インスタンスをロードする
 *
 * 既にロード済みの場合には、そのインスタンスを返す
 *
 * @returns LyraModule インスタンスのプロミス
 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
 */
async function loadLyraModule(): Promise<LyraModule> {
  if (LYRA_CONFIG === undefined) {
    throw new Error("Lyra has not been initialized. Please call `Sora.initLyra()` beforehand.");
  }

  if (LYRA_MODULE === undefined) {
    LYRA_MODULE = await LyraModule.load(LYRA_CONFIG.wasmPath, LYRA_CONFIG.modelPath);
  }

  return LYRA_MODULE;
}

/**
 * PCM（L16）の音声データを Lyra でエンコードする
 *
 * @param encoder Lyra エンコーダ
 * @param encodedFrame PCM 音声データ
 * @param controller 音声データの出力キュー
 */
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
    // DTX が有効、かつ、 encodedFrame が無音（ないしノイズのみを含んでいる）場合にはここに来る
    return;
  }
  encodedFrame.data = encoded.buffer;
  controller.enqueue(encodedFrame);
}

/**
 * Lyra でエンコードされた音声データをデコードして PCM（L16）に変換する
 *
 * @param decoder Lyra デコーダ
 * @param encodedFrame Lyra でエンコードされた音声データ
 * @param controller 音声データの出力キュー
 */
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

/**
 * SDP に記載される Lyra のエンコードパラメータ
 */
export class LyraParams {
  /**
   * Lyra のエンコードフォーマットのバージョン
   */
  readonly version: string;

  /**
   * エンコードビットレート
   */
  readonly bitrate: 3200 | 6000 | 9200;

  /**
   * DTX を有効にするかどうか
   */
  readonly enableDtx: boolean;

  private constructor(version: string, bitrate: number, enableDtx: boolean) {
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

  /**
   * SDP の media description 部分をパースして Lyra のエンコードパラメータを取得する
   *
   * @param media SDP の media description 部分
   * @returns パース結果
   * @throws SDP の内容が期待通りではなくパースに失敗した場合
   */
  static parseMediaDescription(media: string): LyraParams {
    const version = /^a=fmtp:109.*[ ;]version=([0-9.]+)([;]|$)/m.exec(media);
    if (!version) {
      throw new Error(`Lyra parameter 'version' is not found in media description: ${media}`);
    }

    const bitrate = /^a=fmtp:109.*[ ;]bitrate=([0-9]+)([;]|$)/m.exec(media);
    if (!bitrate) {
      throw new Error(`Lyra parameter 'bitrate' is not found in media description: ${media}`);
    }

    const usedtx = /^a=fmtp:109.*[ ;]usedtx=([01])([;]|$)/m.exec(media);
    if (!usedtx) {
      throw new Error(`Lyra parameter 'usedtx' is not found in media description: ${media}`);
    }

    return new LyraParams(version[1], Number(bitrate[1]), usedtx[1] == "1");
  }

  /**
   * このエンコードパラメータに対応する SDP の fmtp 行を生成する
   *
   * @returns SDP の fmtp 行
   */
  toFmtpString(): string {
    return `a=fmtp:109 version=${this.version};bitrate=${this.bitrate};usedtx=${this.enableDtx ? 1 : 0}`;
  }
}

/**
 * 接続単位の Lyra 関連の状態を保持するためのクラス
 */
export class LyraState {
  private encoderOptions: LyraEncoderOptions = {};
  private midToLyraParams: Map<string, LyraParams> = new Map();

  /**
   * offer SDP を受け取り Lyra 対応のために必要な置換や情報の収集を行う
   *
   * @param sdp offer SDP
   * @returns 処理後の SDP
   */
  processOfferSdp(sdp: string): string {
    if (!sdp.includes("109 lyra/")) {
      // 対象外なので処理する必要はない
      return sdp;
    }

    const oldMidToLyraParams = this.midToLyraParams;
    this.midToLyraParams = new Map();

    const splited = sdp.split(/^m=/m);
    let replacedSdp = splited[0];
    for (let media of splited.slice(1)) {
      const midResult = /a=mid:(.*)/.exec(media);
      if (midResult === null) {
        continue;
      }
      const mid = midResult[1];

      if (media.startsWith("audio") && media.includes("109 lyra/")) {
        let params = oldMidToLyraParams.get(mid);
        if (params === undefined) {
          params = LyraParams.parseMediaDescription(media);
        }
        if (media.includes("a=recvonly")) {
          this.encoderOptions.bitrate = params.bitrate;
          this.encoderOptions.enableDtx = params.enableDtx;
        }
        this.midToLyraParams.set(mid, params);

        // SDP を置換する:
        // - libwebrtc は lyra を認識しないので L16 に置き換える
        // - ただし SDP に L16 しか含まれていないと音声なし扱いになってしまうので、それを防ぐために 110 で opus を追加する
        media = media
          .replace(/SAVPF([0-9 ]*) 109/, "SAVPF$1 109 110")
          .replace(/109 lyra[/]16000[/]1/, "110 opus/48000/2")
          .replace(/a=fmtp:109 .*/, "a=rtpmap:109 L16/16000\r\na=ptime:20");
      }
      replacedSdp += "m=" + media;
    }
    return replacedSdp;
  }

  /**
   * setLocalDescription() に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
   *
   * @param answer SDP
   * @returns 処理後の SDP
   */
  processAnswerSdpForLocal(sdp: string): string {
    if (!sdp.includes("a=rtpmap:110 ")) {
      // Lyra は使われていないので書き換えは不要
      return sdp;
    }

    const splited = sdp.split(/^m=/m);
    let replacedSdp = splited[0];
    for (let media of splited.slice(1)) {
      if (media.startsWith("audio") && media.includes("a=rtpmap:110 ")) {
        // opus(110) ではなく L16(109) を使うように SDP を書き換える
        //
        // なお libwebrtc 的にはこの置換を行わなくても内部的には L16 が採用されるが、
        // SDP と実際の動作を一致させるためにここで SDP を置換しておく
        media = media
          .replace(/SAVPF([0-9 ]*) 110/, "SAVPF$1 109")
          .replace(/a=rtpmap:110 opus[/]48000[/]2/, "a=rtpmap:109 L16/16000")
          .replace(/a=fmtp:110 .*/, "a=ptime:20");
      }
      replacedSdp += "m=" + media;
    }
    return replacedSdp;
  }

  /**
   * Sora に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
   *
   * @param answer SDP
   * @returns 処理後の SDP
   */
  processAnswerSdpForSora(sdp: string): string {
    if (!sdp.includes("a=rtpmap:109 L16/16000")) {
      // Lyra は使われていないので書き換えは不要
      return sdp;
    }

    const splited = sdp.split(/^m=/m);
    let replacedSdp = splited[0];
    for (let media of splited.splice(1)) {
      const midResult = /a=mid:(.*)/.exec(media);
      if (midResult === null) {
        continue;
      }

      const mid = midResult[1];
      if (mid && media.startsWith("audio") && media.includes("a=rtpmap:109 L16/16000")) {
        // Sora 用に L16 を Lyra に置換する
        const params = this.midToLyraParams.get(mid);
        if (params === undefined) {
          throw new Error(`Unknown audio mid ${mid}`);
        }
        media = media
          .replace(/a=rtpmap:109 L16[/]16000/, "a=rtpmap:109 lyra/16000/1")
          .replace(/a=ptime:20/, params.toFmtpString());
      }
      replacedSdp += "m=" + media;
    }

    return replacedSdp;
  }

  /**
   * Lyra のエンコーダを生成する
   *
   * @returns 生成されたエンコーダ
   */
  async createEncoder(): Promise<LyraEncoder> {
    return await createLyraEncoder(this.encoderOptions);
  }

  /**
   * Lyra のデコーダを生成する
   *
   * @returns 生成されたデコーダ
   */
  async createDecoder(): Promise<LyraDecoder> {
    return await createLyraDecoder({});
  }
}
