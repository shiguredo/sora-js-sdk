var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var config = {
  "iceServers": [{"urls": "stun:stun.l.google.com:19302"}]
};
var pc = new RTCPeerConnection(config);

$("#start").on("click", function () {
  var sora = new Sora("ws://127.0.0.1:5000/signaling");
  var connection = sora.connection(onSuccess, onError, onClose);
  function onSuccess() {
    connection.connect(
      {"role": "downstream", "channelId": $("#channel").val(), "accessToken": $("#token").val()},
      function(message) {
        console.log("--- offer sdp ---");
        console.log(message.sdp);
        pc.setRemoteDescription(new RTCSessionDescription(message), function() {
          pc.createAnswer(function(answer) {
            pc.setLocalDescription(answer, function() {
              console.log("--- answer sdp ---");
              console.log(answer.sdp);
              connection.answer(answer.sdp);
              pc.onicecandidate = function(event) {
                if (event.candidate !== null) {
                  console.log("--- candidate ---");
                  console.log(event.candidate);
                  connection.candidate(event.candidate);
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

  function onClose(error) {
    console.warn(error);
  }
});
