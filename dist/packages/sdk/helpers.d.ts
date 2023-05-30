/**
 *  MediaStream の constraints を動的に変更するメソッド.
 *
 * @param mediastream - メディアストリーム
 *
 * @param constraints - メディアストリーム制約
 *
 * @public
 */
declare function applyMediaStreamConstraints(mediastream: MediaStream, constraints: MediaStreamConstraints): Promise<void>;
export { applyMediaStreamConstraints };
