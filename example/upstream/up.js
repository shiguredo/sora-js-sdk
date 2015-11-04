var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia ||
                         navigator.webkitGetUserMedia ||
                         navigator.mozGetUserMedia ||
                         navigator.msGetUserMedia;
var config = {
  "iceServers": [{"urls": "stun:stun.l.google.com:19302"}]
};
var pc = new RTCPeerConnection(config);
var localStream;

var sora = new Sora({"host": "127.0.0.1", "port": 5000, "path": "signaling"});
var connection = null;

navigator.getUserMedia({video: true, audio: true}, function(stream) {
  localStream = stream;
  var localVideo = document.getElementById("local-video");
  localVideo.src = window.URL.createObjectURL(stream);
  localVideo.play();
  connection = sora.connection(onSuccess, onError);
}, onError);

function onSuccess() {
  connection.signaling({"role": "upstream", "channelId": "sora"});
  connection.offer(function(message) {
    pc.addStream(localStream);
    pc.setRemoteDescription(new RTCSessionDescription(message), function() {
      pc.createAnswer(function(answer) {
        pc.setLocalDescription(answer, function() {
          pc.onicecandidate = function(event) {
            if (event.candidate === null) {
              connection.candidate(pc.localDescription.sdp);
            }
          }
        }, onError);
      }, onError);
    }, onError);
  });
}

function onError(error) {
  console.warn(error);
}
