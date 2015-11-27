var assert = require("power-assert");
var Sora = require("../dist/sora.js");

describe("Sora", function() {
  it("Success create connection", function(done) {
    var sora = new Sora("ws://127.0.0.1:5000/signaling");
    sora.connection(
      function() {
        done();
      },
      function(_e) {
        assert(false, "Connect fail.");
      },
      function(_e) {
        assert(false, "Connect fail.");
      }
    );
  });
  it("Fail create connection", function(done) {
    var sora = new Sora("ws://127.0.0.1:5000/bad");
    sora.connection(
      function() {
        assert(false, "Connect success.");
      },
      function(_e) {
        done();
      }
      function(_e) {
        done();
      }
    );
  });
});

describe("SoraConnection", function() {
  it("Success upstream signaling", function(done) {
    var sora = new Sora("ws://127.0.0.1:5000/signaling");
    var soraConnection = sora.connection(
      function() {
        soraConnection.connect(
          {"role": "upstream", "channelId": "sora"},
          function() { done(); }
        );
      },
      function(_e) {
        assert(false);
        done();
      },
      function(_e) {
        assert(false);
        done();
      }
    );
  });
});
