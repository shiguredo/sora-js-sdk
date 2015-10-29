var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var config = {
  "iceServers": [{"urls": "stun:stun.l.google.com:19302"}]
};
var pc = new RTCPeerConnection(config);
var ws;

function soraConnect(channelId) {
  var sora = new Sora();
  ws = sora.connect({
    "host": "127.0.0.1",
    "port": 5000,
    "path": "signaling",
    "role": "downstream",
    "channelId": channelId
  }, onSuccess, onError);
}

function onSuccess(message) {
  pc.setRemoteDescription(new RTCSessionDescription(message), function() {
    pc.createAnswer(function(answer) {
      pc.setLocalDescription(answer, function() {
        pc.onicecandidate = function(event) {
          if (event.candidate === null) {
            ws.send(JSON.stringify({type: "answer", sdp: pc.localDescription.sdp}));
          }
        };
      }, onError);
    }, onError);
  }, onError);

  pc.onaddstream = function(event) {
    var remoteVideo = document.getElementById("remote-video");
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteVideo.play();
  };
}

function onError(error) {
  console.warn(error);
}

var startButton = document.getElementById("start");
startButton.addEventListener("click", function() {
  var channelId = document.getElementById("channel").value;
  soraConnect(channelId);
});
