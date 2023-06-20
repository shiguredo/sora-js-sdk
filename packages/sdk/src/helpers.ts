/**
 *  MediaStream の constraints を動的に変更するメソッド.
 *
 * @param mediastream - メディアストリーム
 *
 * @param constraints - メディアストリーム制約
 *
 * @public
 */
async function applyMediaStreamConstraints(
  mediastream: MediaStream,
  constraints: MediaStreamConstraints,
): Promise<void> {
  if (constraints.audio && typeof constraints.audio !== 'boolean') {
    for (const track of mediastream.getAudioTracks()) {
      await track.applyConstraints(constraints.audio)
    }
  }
  if (constraints.video && typeof constraints.video !== 'boolean') {
    for (const track of mediastream.getVideoTracks()) {
      await track.applyConstraints(constraints.video)
    }
  }
}

export { applyMediaStreamConstraints }
