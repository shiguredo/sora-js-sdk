import assert from "power-assert";
import Sora from "../sora";

describe("Sora", () => {
  it("Success create connection", (done) => {
    let sora = new Sora("ws://127.0.0.1:5000/signaling");
    sora.connection(
      () => {
        done();
      },
      (_e) => {
        assert(false, "Connect fail.");
      },
      (_e) => {
        assert(false, "Connect fail.");
      }
    );
  });
  it("Fail create connection", (done) => {
    let sora = new Sora("ws://127.0.0.1:5000/bad");
    sora.connection(
      () => {
        assert(false, "Connect success.");
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
  it("Success upstream signaling", (done) => {
    let sora = new Sora("ws://127.0.0.1:5000/signaling");
    let soraConnection = sora.connection(
      () => {
        soraConnection.connect(
          {role: "upstream", channelId: "sora"},
          () => { done(); },
          () => { assert(false, "Connect success."); }
        );
      },
      (_e) => {
        assert(false);
        done();
      },
      (_e) => {
        assert(false);
        done();
      }
    );
  });
});
