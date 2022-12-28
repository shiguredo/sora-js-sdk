// TODO: import from lyra-wasm
class LyraEncoder {
        port;
        sampleRate;
        numberOfChannels;
        bitrate;
        enableDtx;
        frameSize;
        constructor(port, frameSize, options) {
            this.port = port;
            this.frameSize = frameSize;
            this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
            this.numberOfChannels = options.numberOfChannels || DEFAULT_CHANNELS;
            this.bitrate = options.bitrate || DEFAULT_BITRATE;
            this.enableDtx = options.enableDtx || DEFAULT_ENABLE_DTX;
        }
        // TODO: audioData が transfer されることを書く
        encode(audioData) {
            const promise = new Promise((resolve, reject) => {
              this.port.addEventListener("message", (res) => {
                console.log("#recv");
                    const result = res.data.result;
                    if ("error" in result) {
                        reject(result.error);
                    }
                    else {
                        resolve(result.encodedAudioData);
                    }
              }, { once: true });
              this.port.start();
            });
            this.port.postMessage({ type: "LyraEncoder.encode", audioData, bitrate: this.bitrate }, [audioData.buffer]);
            return promise;
        }
        destroy() {
            this.port.postMessage({ type: "LyraEncoder.destroy" });
            this.port.close();
        }
}


// Sender transform
function createSenderTransform(encoderState) {
  console.log("-------------------------------------");
  // console.log(encoderState);
  const encoder = new LyraEncoder(encoderState.port,
                                  encoderState.frameSize,
                                  encoderState);
  let count = 0;
  return new TransformStream({
    start() {
      // Called on startup.
      console.log("start sender transform");
      console.log(encoder);
    },

    async transform(encodedFrame, controller) {
      console.log("here: " + count++);
      const view = new DataView(encodedFrame.data);
      const rawData = new Int16Array(encodedFrame.data.byteLength / 2);
      for (let i = 0; i < encodedFrame.data.byteLength; i += 2) {
        rawData[i / 2] = view.getInt16(i, false);
      }
      console.log("before: encode");
      const encoded = await encoder.encode(rawData);
      console.log("after: encode");
      if (encoded === undefined) {
        // DTX が有効、かつ、 encodedFrame が無音（ないしノイズのみを含んでいる）場合にはここに来る
        console.log("dtx");
        return;
      }
      encodedFrame.data = encoded.buffer;
      console.log(encodedFrame.data.byteLength);
      controller.enqueue(encodedFrame);
    },

    flush() {
      // Called when the stream is about to be closed.
      console.log("flush sender transform");
    }
  });
}

// Receiver transform
function createReceiverTransform(lyraDecoer) {
  return new TransformStream({
    start() {
      console.log("start receiver transform");
    },
    flush() {
      console.log("flush receiver transform");
    },
    async transform(encodedFrame, controller) {
      // Reconstruct the original frame.
      const view = new DataView(encodedFrame.data);

      // Ignore the last 4 bytes
      const newData = new ArrayBuffer(encodedFrame.data.byteLength - 4);
      const newView = new DataView(newData);

      // Negate all bits in the incoming frame, ignoring the
      // last 4 bytes
      for (let i = 0; i < encodedFrame.data.byteLength - 4; ++i)
        newView.setInt8(i, ~view.getInt8(i));

      encodedFrame.data = newData;
      controller.enqueue(encodedFrame);
    }
  });
}

// Code to instantiate transform and attach them to sender/receiver pipelines.
onrtctransform = (event) => {
  let transform;
  if (event.transformer.options.name == "senderTransform")
    transform = createSenderTransform(event.transformer.options.lyraEncoder);
  else if (event.transformer.options.name == "receiverTransform")
    transform = createReceiverTransform(event.transformer.options.lyraDecoder);
    else
      return;
  event.transformer.readable
    .pipeThrough(transform)
    .pipeTo(event.transformer.writable);
};
