function stopVideoMediaDevice(mediastream: MediaStream): void {
  mediastream.getVideoTracks().forEach((track) => {
    track.enabled = false;
    // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
    setTimeout(() => {
      track.stop();
      mediastream.removeTrack(track);
    }, 100);
  });
}

async function startVideoMediaDevice(
  mediastream: MediaStream,
  peerConnection: RTCPeerConnection,
  videoConstraints?: boolean | MediaTrackConstraints
): Promise<void> {
  if (0 < mediastream.getVideoTracks().length) {
    throw new Error("Unable to start video media device. Mediastream already has a video track");
  }
  const mediaStreamConstraints = {
    video: videoConstraints !== undefined ? videoConstraints : true,
  };
  const newMediastream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
  const newVideoTrack = newMediastream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find((s) => {
    if (!s.track) {
      return false;
    }
    return s.track.kind === newVideoTrack.kind;
  });
  if (!sender) {
    throw new Error("Could not find video sender");
  }
  await sender.replaceTrack(newVideoTrack);
  mediastream.addTrack(newVideoTrack);
}

function stopAudioMediaDevice(mediastream: MediaStream): void {
  mediastream.getAudioTracks().forEach((track) => {
    track.enabled = false;
    // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
    setTimeout(() => {
      track.stop();
      mediastream.removeTrack(track);
    }, 100);
  });
}

async function startAudioMediaDevice(
  mediastream: MediaStream,
  peerConnection: RTCPeerConnection,
  audioConstraints?: boolean | MediaTrackConstraints
): Promise<void> {
  if (0 < mediastream.getAudioTracks().length) {
    throw new Error("Unable to start audio media device. Mediastream already has a audio track");
  }
  const mediaStreamConstraints = {
    audio: audioConstraints !== undefined ? audioConstraints : true,
  };
  const newMediastream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
  const newAudioTrack = newMediastream.getAudioTracks()[0];
  const sender = peerConnection.getSenders().find((s) => {
    if (!s.track) {
      return false;
    }
    return s.track.kind === newAudioTrack.kind;
  });
  if (!sender) {
    throw new Error("Could not find audio sender");
  }
  await sender.replaceTrack(newAudioTrack);
  mediastream.addTrack(newAudioTrack);
}

export { stopVideoMediaDevice, startVideoMediaDevice, stopAudioMediaDevice, startAudioMediaDevice };
