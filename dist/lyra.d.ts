import { RTCEncodedAudioFrame } from "./types";
import { LyraEncoder, LyraDecoder, LyraEncoderOptions, LyraDecoderOptions } from "@shiguredo/lyra-wasm";
export interface LyraConfig {
    wasmPath: string;
    modelPath: string;
}
export declare function initLyra(config: LyraConfig): void;
export declare function isLyraInitialized(): boolean;
export declare function createLyraEncoder(options?: LyraEncoderOptions): Promise<LyraEncoder>;
export declare function createLyraDecoder(options?: LyraDecoderOptions): Promise<LyraDecoder>;
export declare function transformPcmToLyra(encoder: LyraEncoder, encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController): void;
export declare function transformLyraToPcm(decoder: LyraDecoder, encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController): void;
export declare class LyraParams {
    readonly version: string;
    readonly bitrate: 3200 | 6000 | 9200;
    readonly enableDtx: boolean;
    constructor(version: string, bitrate: number, enableDtx: boolean);
    static parseMediaDescription(media: string): LyraParams;
    toFmtpString(): string;
}
