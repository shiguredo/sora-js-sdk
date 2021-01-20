declare function stopVideoMediaDevice(mediastream: MediaStream): void;
declare function startVideoMediaDevice(mediastream: MediaStream, peerConnection: RTCPeerConnection, videoConstraints?: boolean | MediaTrackConstraints): Promise<void>;
declare function stopAudioMediaDevice(mediastream: MediaStream): void;
declare function startAudioMediaDevice(mediastream: MediaStream, peerConnection: RTCPeerConnection, audioConstraints?: boolean | MediaTrackConstraints): Promise<void>;
declare function applyMediaStreamConstraints(mediastream: MediaStream, constraints: MediaStreamConstraints): Promise<void>;
export { applyMediaStreamConstraints, stopVideoMediaDevice, startVideoMediaDevice, stopAudioMediaDevice, startAudioMediaDevice, };
