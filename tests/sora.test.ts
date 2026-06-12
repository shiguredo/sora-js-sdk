import Sora from "../src/sora";
import type { ConnectionOptions } from "../src/types";

test("messaging() が呼び出し側の options を破壊しない", () => {
  // 設計方針 (1) の修正のみで pass する弁別テスト。messaging() 単独呼び出しは sendrecv の経路を
  // 経由しないため、(2) の有無に関わらず (1) の修正だけが結果を左右する。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.messaging("ch", null, opts);
  expect(opts.audio).toBe(true);
  expect(opts.video).toBe(true);
  expect(opts.dataChannelSignaling).toBeUndefined();
});

test("messaging() の上書きが他の Connection の options に伝播しない", () => {
  // タイトル後半「他 Connection の this.options まで壊す」の症状を、現実の利用形態
  // (同一 opts を sendrecv() と messaging() に渡す) で再現する regression テスト。
  // (1)(2) のいずれが単独修正されても pass するため、(1)(2) の弁別はテスト 1 / 3 が担う。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  const sendrecv = connection.sendrecv("ch1", null, opts);
  connection.messaging("ch2", null, opts);
  expect(sendrecv.options.audio).toBe(true);
  expect(sendrecv.options.video).toBe(true);
  expect(sendrecv.options.dataChannelSignaling).toBeUndefined();
});

test("sendrecv() で skipIceCandidateEvent のデフォルト値設定が呼び出し側 options に漏れない", () => {
  // 設計方針 (2) の修正のみで pass する弁別テスト。sendrecv() 自体は options を mutate しないため、
  // (1) の有無に関わらず (2) の shallow copy 修正だけが結果を左右する。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.sendrecv("ch", null, opts);
  expect(opts.skipIceCandidateEvent).toBeUndefined();
});
