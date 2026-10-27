#!/bin/sh
# Playwright の Firefox で H264 を送受信するための OpenH264 (GMP) プラグインを取得する。
# 取得先とハッシュは Playwright の Firefox に同梱される openh264.json に合わせている。
# Playwright の Firefox が更新され、同梱の openh264.json のバージョンが変わった場合は
# VERSION / FILE_NAME / FILE_HASH を手動で更新する。
set -eu

# テストは macOS でのみ実行するため、macOS 以外では処理しない
if [ "$(uname -s)" != "Darwin" ]; then
  echo "this script supports macOS only" >&2
  exit 1
fi

VERSION="2.6.0"
BASE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
DEST_DIR="$BASE_DIR/.gmp/gmp-gmpopenh264/$VERSION"

case "$(uname -m)" in
  arm64)
    FILE_NAME="openh264-macosx64-aarch64-652bdb7719f30b52b08e506645a7322ff1b2cc6f.zip"
    FILE_HASH="d69514fa5a04483674b9d5a9c2ab0c1736db6363f1afc83bad4e54f0c155949e34cdf9746e07f9d855b3fcad16da8b9e8d79b2707fa1ae1e9aaeaaab620d1026"
    ;;
  x86_64)
    FILE_NAME="openh264-macosx64-652bdb7719f30b52b08e506645a7322ff1b2cc6f.zip"
    FILE_HASH="a7ede806e842b153bc78d73834fb73bece4db09421850e4fddcbde420b9885012819534cee4a0f3d3e9633d0bc1e066f6d8362030f04b96fd661aa6283dae32d"
    ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ダウンロードと検証が成功するまで DEST_DIR を作らない。
# 失敗した場合に空のバージョンディレクトリが残らないようにするため
curl --retry 3 --retry-delay 2 -fsSL "https://ciscobinary.openh264.org/$FILE_NAME" \
  -o "$TMP_DIR/plugin.zip"
printf '%s  %s\n' "$FILE_HASH" "$TMP_DIR/plugin.zip" | shasum -a 512 -c -
unzip -q -o "$TMP_DIR/plugin.zip" -d "$TMP_DIR/extracted"

# 展開結果に必要なファイルが揃っていることを確認してから配置する
for file in gmpopenh264.info libgmpopenh264.dylib; do
  if [ ! -f "$TMP_DIR/extracted/$file" ]; then
    echo "missing $file in the OpenH264 package" >&2
    exit 1
  fi
done

mkdir -p "$DEST_DIR"
cp -f "$TMP_DIR/extracted/gmpopenh264.info" "$TMP_DIR/extracted/libgmpopenh264.dylib" "$DEST_DIR/"

echo "installed OpenH264 $VERSION to $DEST_DIR"
