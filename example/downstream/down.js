var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var config = {
  "iceServers": [{"urls": "stun:stun.l.google.com:19302"}]
};
var pc = new RTCPeerConnection(config);

$("#start").on("click", function () {
  var sora = new Sora("ws://127.0.0.1:5000/signaling");
  var connection = sora.connection();
  var params = {
    role: "downstream",
    channelId: $("#channel").val(),
    accessToken: $("#token").val(),
    codecType: $("select[name=codec-type]").val()
  }
  connection
    .connect(params)
    .then(function(offer) {
      pc.setRemoteDescription(new RTCSessionDescription(offer), function() {
        pc.onaddstream = function(event) {
          var remoteVideo = document.getElementById("remote-video");
          remoteVideo.src = window.URL.createObjectURL(event.stream);
          remoteVideo.play();
        };
        pc.createAnswer(function(answer) {
          pc.setLocalDescription(answer, function() {
            connection.answer(answer.sdp);
            pc.onicecandidate = function(event) {
              if (event.candidate !== null) {
                connection.candidate(event.candidate);
              }
            };
          }, onError);
        }, onError);
      }, onError);
    });

  function onError(error) {
    console.warn(error);
  }
});
