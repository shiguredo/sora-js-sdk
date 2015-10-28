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
var connection;
var localStream;

function getUserMedia(channelId) {
  navigator.getUserMedia({video: true, audio: true}, function(stream) {
    localStream = stream;
    var localVideo = document.getElementById("local-video");
    localVideo.src = window.URL.createObjectURL(stream);
    localVideo.play();

    var sora = new Sora();
    connection = sora.connect({
      "host": "127.0.0.1",
      "port": 5000,
      "path": "signaling",
      "role": "upstream",
      "channelId": "sora"
    }, onSuccess, channelId);
  }, onError);
}

function onSuccess(message) {
  pc.addStream(localStream);
  pc.setRemoteDescription(new RTCSessionDescription(message), function() {
    pc.createAnswer(function(answer) {
      pc.setLocalDescription(answer, function() {
        pc.onicecandidate = function(event) {
          if (event.candidate === null) {
            connection.send(JSON.stringify({type: "answer", sdp: pc.localDescription.sdp}));
          }
        }
      }, onError);
    }, onError);
  }, onError);
}

function onError(error) {
  console.warn(error);
}

var startButton = document.getElementById("start");
startButton.addEventListener("click", function() {
  var channelId = document.getElementById("channel").value;
  getUserMedia(channelId);
});
