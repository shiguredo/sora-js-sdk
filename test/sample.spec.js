var assert = require("power-assert");
var Sora = require("../sora");

describe("サンプルテスト", function() {
  it("失敗する", function() {
    assert(1 + 1 === 3);
  });
  it("成功する", function() {
    assert(1 + 1 === 2);
  });
});
