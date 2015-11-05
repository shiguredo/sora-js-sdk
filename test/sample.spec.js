var assert = require("power-assert");
var Sora = require("../sora");

describe("Sora", function() {
  it("Success create connection", function(done) {
    var sora = new Sora({"host": "127.0.0.1", "port": 5000, "path": "signaling"});
    sora.connection(
      function() {
        done();
      },
      function(e) {
        assert(false, 'Connect fail.');
      }
    );
  });
  it("Fail create connection", function(done) {
    var sora = new Sora({"host": "aaa", "port": 5000, "path": "signaling"});
    sora.connection(
      function() {
        assert(false, 'Connect success.');
      },
      function(e) {
        done();
      }
    );
  });
});

describe("SoraConnection", function() {
  it("Success `Upstream Signaling`", function(done) {
    var sora = new Sora({"host": "127.0.0.1", "port": 5000, "path": "signaling"});
    var soraConnection = sora.connection(
      function() {
        soraConnection.connect({"role": "upstream", "channelId": "sora"});
        soraConnection.offer(function(message) {
          done();
        });
      },
      function(e) {
        assert(false);
        done();
      }
    );
  });
});
