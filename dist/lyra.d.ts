import { RTCEncodedAudioFrame } from "./types";
import { LyraEncoder, LyraDecoder, LyraEncoderOptions, LyraDecoderOptions } from "@shiguredo/lyra-wasm";
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
export declare function initLyra(config: LyraConfig): boolean;
/***
 * Lyra が初期化済みかどうか
 *
 * @returns Lyra が初期化済みかどうか
 */
export declare function isLyraInitialized(): boolean;
/**
 * Lyra のエンコーダを生成して返す
 *
 * @param options エンコーダに指定するオプション
 * @returns Lyra エンコーダのプロミス
 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
 */
export declare function createLyraEncoder(options?: LyraEncoderOptions): Promise<LyraEncoder>;
/**
 * Lyra のデコーダを生成して返す
 *
 * @param options デコーダに指定するオプション
 * @returns Lyra デコーダのプロミス
 * @throws Lyra が未初期化の場合 or LyraConfig で指定したファイルの取得に失敗した場合
 */
export declare function createLyraDecoder(options?: LyraDecoderOptions): Promise<LyraDecoder>;
/**
 * PCM（L16）の音声データを Lyra でエンコードする
 *
 * @param encoder Lyra エンコーダ
 * @param encodedFrame PCM 音声データ
 * @param controller 音声データの出力キュー
 */
export declare function transformPcmToLyra(encoder: LyraEncoder, encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController): void;
/**
 * Lyra でエンコードされた音声データをデコードして PCM（L16）に変換する
 *
 * @param decoder Lyra デコーダ
 * @param encodedFrame Lyra でエンコードされた音声データ
 * @param controller 音声データの出力キュー
 */
export declare function transformLyraToPcm(decoder: LyraDecoder, encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController): void;
/**
 * SDP に記載される Lyra のエンコードパラメータ
 */
export declare class LyraParams {
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
    private constructor();
    /**
     * SDP の media description 部分をパースして Lyra のエンコードパラメータを取得する
     *
     * @param media SDP の media description 部分
     * @returns パース結果
     * @throws SDP の内容が期待通りではなくパースに失敗した場合
     */
    static parseMediaDescription(media: string): LyraParams;
    /**
     * このエンコードパラメータに対応する SDP の fmtp 行を生成する
     *
     * @returns SDP の fmtp 行
     */
    toFmtpString(): string;
}
/**
 * 接続単位の Lyra 関連の状態を保持するためのクラス
 */
export declare class LyraState {
    private encoderOptions;
    private midToLyraParams;
    /**
     * offer SDP を受け取り Lyra 対応のために必要な置換や情報の収集を行う
     *
     * @param sdp offer SDP
     * @returns 処理後の SDP
     */
    processOfferSdp(sdp: string): string;
    /**
     * setLocalDescription() に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
     *
     * @param answer SDP
     * @returns 処理後の SDP
     */
    processAnswerSdpForLocal(sdp: string): string;
    /**
     * Sora に渡される answer SDP を受け取り、Lyra 対応のために必要な処理を行う
     *
     * @param answer SDP
     * @returns 処理後の SDP
     */
    processAnswerSdpForSora(sdp: string): string;
    /**
     * Lyra のエンコーダを生成する
     *
     * @returns 生成されたエンコーダ
     */
    createEncoder(): Promise<LyraEncoder>;
    /**
     * Lyra のデコーダを生成する
     *
     * @returns 生成されたデコーダ
     */
    createDecoder(): Promise<LyraDecoder>;
}
