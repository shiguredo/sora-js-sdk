var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var config = {
  "iceServers": [{"urls": "stun:stun.l.google.com:19302"}]
};
var pc = new RTCPeerConnection(config);

$("#start").on("click", function () {
  var sora = new Sora({"host": "127.0.0.1", "port": 5000, "path": "signaling"});
  var connection = sora.connection(onSuccess, onError);
  function onSuccess() {
    connection.connect(
      {"role": "downstream", "channelId": $("#channel").val(), "accessToken": $("#token").val()},
      function(message) {
        pc.setRemoteDescription(new RTCSessionDescription(message), function() {
          pc.createAnswer(function(answer) {
            pc.setLocalDescription(answer, function() {
              pc.onicecandidate = function(event) {
                if (event.candidate === null) {
                  connection.answer(pc.localDescription.sdp);
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
      }, onError
    );
  }

  function onError(error) {
    console.warn(error);
  }
});
