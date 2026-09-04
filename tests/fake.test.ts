import {
  getStereoAudioMode,
  getStereoAudioModeGains,
  STEREO_AUDIO_MODE_DURATION_SECONDS,
} from "../e2e-tests/src/fake";

test("ステレオ音声パターンを 5 秒ごとに切り替える", () => {
  assert.equal(STEREO_AUDIO_MODE_DURATION_SECONDS, 5);
  assert.deepEqual(
    [
      getStereoAudioMode(0),
      getStereoAudioMode(4.999),
      getStereoAudioMode(5),
      getStereoAudioMode(9.999),
      getStereoAudioMode(10),
      getStereoAudioMode(14.999),
      getStereoAudioMode(15),
    ],
    ["both", "both", "left", "left", "right", "right", "both"],
  );
});

test("ステレオ音声パターンの各状態で左右の音量を切り替える", () => {
  assert.deepEqual(getStereoAudioModeGains("both", 0.1), { left: 0.1, right: 0.1 });
  assert.deepEqual(getStereoAudioModeGains("left", 0.1), { left: 0.1, right: 0 });
  assert.deepEqual(getStereoAudioModeGains("right", 0.1), { left: 0, right: 0.1 });
});

test("ステレオ音声パターンは負数と有限でない時間を拒否する", () => {
  assert.throws(() => getStereoAudioMode(-0.001), RangeError);
  assert.throws(() => getStereoAudioMode(Number.NaN), RangeError);
  assert.throws(() => getStereoAudioMode(Number.POSITIVE_INFINITY), RangeError);
});
