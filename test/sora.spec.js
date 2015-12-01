import assert from "power-assert";
import Sora from "../sora";

let channelId = "7N3fsMHob"
let accessToken = "PG9A6RXgYqiqWKOVO"
let signalingUrl = "ws://127.0.0.1:5000/signaling"

describe("Sora", () => {
  it("Success create connection", (done) => {
    let sora = new Sora(signalingUrl);
    sora.connection(
      () => {
        done();
      },
      (_e) => {
        assert(false, "Failed connection.");
      },
      (_e) => {
        assert(false, "Failed connection.");
      }
    );
  });
  it("Fail create connection", (done) => {
    let sora = new Sora("ws://127.0.0.1:5000/bad");
    sora.connection(
      () => {
        assert(false, "Success connection.");
      },
      (_e) => {
        done();
      },
      (_e) => {
        done();
      }
    );
  });
});

describe("SoraConnection", () => {
  it("Success signaling", (done) => {
    let sora = new Sora(signalingUrl);
    let soraConnection = sora.connection(
      () => {
        soraConnection.connect(
          {role: "upstream", channelId: channelId, accessToken: accessToken},
          () => { done(); },
          () => { assert(false, "Faild signaling."); }
        );
      },
      (e) => {
        assert(false, e);
        done();
      },
      (e) => {
        assert(false, e);
        done();
      }
    );
  });
  it("Failed signaling", (done) => {
    let sora = new Sora(signalingUrl);
    let soraConnection = sora.connection(
      () => {
        soraConnection.connect(
          {role: "upstream", channelId: channelId, accessToken: "test"},
          () => { assert(false, "Success signaling."); done(); },
          (e) => { done(); }
        );
      },
      (e) => {
        assert(false, e);
        done();
      },
      (e) => {
        assert(false, e);
        done();
      }
    );
  });
});
