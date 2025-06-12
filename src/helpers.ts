/**
 *  MediaStream の constraints を動的に変更するメソッド.
 *
 * @param mediaStream - メディアストリーム
 *
 * @param constraints - メディアストリーム制約
 *
 * @public
 */
async function applyMediaStreamConstraints(
  mediaStream: MediaStream,
  constraints: MediaStreamConstraints,
): Promise<void> {
  if (constraints.audio && typeof constraints.audio !== 'boolean') {
    for (const track of mediaStream.getAudioTracks()) {
      await track.applyConstraints(constraints.audio)
    }
  }
  if (constraints.video && typeof constraints.video !== 'boolean') {
    for (const track of mediaStream.getVideoTracks()) {
      await track.applyConstraints(constraints.video)
    }
  }
}

export { applyMediaStreamConstraints }
