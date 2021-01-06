declare function stopVideoMediaDevice(mediastream: MediaStream): void;
declare function startVideoMediaDevice(mediastream: MediaStream, peerConnection: RTCPeerConnection): Promise<void>;
declare function stopAudioMediaDevice(mediastream: MediaStream): void;
declare function startAudioMediaDevice(mediastream: MediaStream, peerConnection: RTCPeerConnection): Promise<void>;
export { stopVideoMediaDevice, startVideoMediaDevice, stopAudioMediaDevice, startAudioMediaDevice };
