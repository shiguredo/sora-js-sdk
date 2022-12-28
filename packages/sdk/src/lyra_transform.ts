import { RTCEncodedAudioFrame } from "./types";

import { LyraEncoder, LyraDecoder } from "@shiguredo/lyra-wasm";

/**
 * PCM（L16）の音声データを Lyra でエンコードする
 *
 * @param encoder Lyra エンコーダ
 * @param encodedFrame PCM 音声データ
 * @param controller 音声データの出力キュー
 */
export async function transformPcmToLyra(
  encoder: LyraEncoder,
  encodedFrame: RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController
): Promise<void> {
  const view = new DataView(encodedFrame.data);
  const rawData = new Int16Array(encodedFrame.data.byteLength / 2);
  for (let i = 0; i < encodedFrame.data.byteLength; i += 2) {
    rawData[i / 2] = view.getInt16(i, false);
  }
  const encoded = await encoder.encode(rawData);
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
export async function transformLyraToPcm(
  decoder: LyraDecoder,
  encodedFrame: RTCEncodedAudioFrame,
  controller: TransformStreamDefaultController
): Promise<void> {
  if (encodedFrame.data.byteLength === 3) {
    // e2ee を有効にした場合には、e2ee モジュールが不明なパケットを受信した場合に
    // opus の無音パケットを生成するのでそれを無視する。
    // なお、sendrecv or sendonly で接続直後に生成されたパケットを受信すると常にここにくる模様。
    //
    // Lyra では圧縮後の音声データサイズが固定調で、3 バイトとなることはないので、
    // この条件で正常な Lyra パケットが捨てられることはない。
    //
    // FIXME(size): e2ee 側から opus を仮定した無音生成コードがなくなったらこのワークアラウンドも除去する
    return;
  }

  const decoded = await decoder.decode(new Uint8Array(encodedFrame.data));
  const buffer = new ArrayBuffer(decoded.length * 2);
  const view = new DataView(buffer);
  for (const [i, v] of decoded.entries()) {
    view.setInt16(i * 2, v, false);
  }
  encodedFrame.data = buffer;
  controller.enqueue(encodedFrame);
}
