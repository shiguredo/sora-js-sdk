import { transformPcmToLyra, transformLyraToPcm } from "./lyra";
import { RTCEncodedAudioFrame } from "./types";

import { LyraEncoder, LyraEncoderState, LyraDecoder, LyraDecoderState } from "@shiguredo/lyra-wasm";

function createSenderTransform(encoderState: LyraEncoderState) {
  const encoder = LyraEncoder.fromState(encoderState);
  return new TransformStream({
    async transform(encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController) {
      await transformPcmToLyra(encoder, encodedFrame, controller);
    },
    flush() {
      encoder.destroy();
    },
  });
}

function createReceiverTransform(decoderState: LyraDecoderState) {
  const decoder = LyraDecoder.fromState(decoderState);
  return new TransformStream({
    async transform(encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController) {
      await transformLyraToPcm(decoder, encodedFrame, controller);
    },
    flush() {
      decoder.destroy();
    },
  });
}

// @ts-ignore
onrtctransform = (msg) => {
  if (msg.transformer.options.name == "senderTransform") {
    const transform = createSenderTransform(msg.transformer.options.lyraEncoder);
    msg.transformer.readable.pipeThrough(transform).pipeTo(msg.transformer.writable);
  } else if (msg.transformer.options.name == "receiverTransform") {
    const transform = createReceiverTransform(msg.transformer.options.lyraDecoder);
    msg.transformer.readable.pipeThrough(transform).pipeTo(msg.transformer.writable);
  } else {
    console.warn("unknown message");
    console.warn(msg);
  }
};
