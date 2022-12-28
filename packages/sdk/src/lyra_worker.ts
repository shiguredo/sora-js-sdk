import { transformPcmToLyra } from "./lyra_transform";
import { RTCEncodedAudioFrame } from "./types";

import { LyraEncoder, LyraEncoderState } from "@shiguredo/lyra-wasm";

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

// @ts-ignore
onrtctransform = (msg) => {
  if (msg.transformer.options.name == "senderTransform") {
    const transform = createSenderTransform(msg.transformer.options.lyraEncoder);
    msg.transformer.readable.pipeThrough(transform).pipeTo(msg.transformer.writable);
  }
  // else if (event.transformer.options.name == "receiverTransform")
  //   transform = createReceiverTransform(event.transformer.options.lyraDecoder);
  else {
    console.warn("unknown message");
    console.warn(msg);
  }
};
