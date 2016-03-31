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

$("#start").on("click", function () {
  var sora = new Sora("ws://127.0.0.1:5000/signaling");
  var connection = sora.connection();

  navigator.getUserMedia({video: true, audio: true}, function(stream) {
    var localVideo = document.getElementById("local-video");
    localVideo.src = window.URL.createObjectURL(stream);
    localVideo.play();
    var params = {
      role: "upstream",
      channelId: $("#channel").val(),
      accessToken: $("#token").val(),
      codecType: $("select[name=codec-type]").val()
    };
    connection
      .connect(params)
      .then(function(offer) {
        pc.addStream(stream);
        pc.setRemoteDescription(new RTCSessionDescription(offer), function() {
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
  }, onError);

  function onError(error) {
    console.warn(error);
  }
});
