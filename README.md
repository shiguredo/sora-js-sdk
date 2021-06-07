# Sora JavaScript SDK

[![GitHub tag](https://img.shields.io/github/tag/shiguredo/sora-js-sdk.svg)](https://github.com/shiguredo/sora-js-sdk)
[![npm version](https://badge.fury.io/js/sora-js-sdk.svg)](https://badge.fury.io/js/sora-js-sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Sora JavaScript SDK は[株式会社時雨堂](https://shiguredo.jp/)が開発、販売している [WebRTC SFU Sora](https://sora.shiguredo.jp) をブラウザから扱うための SDK です。

## About Shiguredo's open source software

We will not respond to PRs or issues that have not been discussed on Discord. Also, Discord is only available in Japanese.

Please read https://github.com/shiguredo/oss before use.

## 時雨堂のオープンソースソフトウェアについて

利用前に https://github.com/shiguredo/oss をお読みください。

## 使い方

使い方は [Sora JavaScript SDK ドキュメント](https://sora-js-sdk.shiguredo.jp/) を参照してください。

- sora.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.js
- sora.min.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.min.js

## システム条件

- WebRTC SFU Sora 2021.1 以降
- TypeScript 3.8 以降

## サンプル

- Sendonly/Recvonly
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/sendonly_recvonly.html
- Multistream Sendrecv
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/multistream_sendrecv.html
- Multistream Sendonly
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/multistream_sendonly.html
- Multistream Recvonly
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/multistream_recvonly.html
- Spotlight Sendrecv
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/spotlight_sendrecv.html
- Spotlight Recvonly
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/spotlight_recvonly.html
- Simulcast
    - https://github.com/shiguredo/sora-js-sdk/blob/develop/example/simulcast.html

## E2EE について

詳細については以下をご確認ください。

[WebRTC SFU Sora 向け E2EE ライブラリ](https://github.com/shiguredo/sora-e2ee)

## マルチトラックについて

[WebRTC SFU Sora](https://sora.shiguredo.jp) は 1 メディアストリームにつき 1 音声トラック、1 映像トラックまでしか対応していないため, Sora JavaScript SDK はマルチトラックに対応していません。

マルチトラックへの対応は今のところ未定です。

## API 一覧

[Sora JavaScript SDK ドキュメント API リファレンス](https://sora-js-sdk.shiguredo.jp/api.html)

## ライセンス

Apache License 2.0

```
Copyright 2017-2021, Yuki Ito (Original Author)
Copyright 2017-2021, Shiguredo Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
