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

- WebRTC SFU Sora 2020.3 以降
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

## Issues について

質問やバグ報告の場合は、次の開発環境のバージョンを **「メジャーバージョン、マイナーバージョン、メンテナンスバージョン」** まで含めて書いてください。

- Sora JavaScript SDK のバージョン
- 利用ブラウザのバージョン

## E2EE について

詳細については以下をご確認ください。

[WebRTC SFU Sora 向け E2EE ライブラリ](https://github.com/shiguredo/sora-e2ee)

## マルチトラックについて

[WebRTC SFU Sora](https://sora.shiguredo.jp) は 1 メディアストリームにつき 1 音声トラック、1 映像トラックまでしか対応していないため, Sora JavaScript SDK はマルチトラックに対応していません。

マルチトラックへの対応は今のところ未定です。

## API 一覧

### Sora Connection

- connection(signalingUrl, debug=false)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |signalingUrl  |string   |   |シグナリング先 URL   |
  |debug  |boolean   | false  |デバッグフラグ   |

example
```javascript
var sora = Sora.connection('ws://127.0.0.1/signaling');
```

### Sendrecv (Publisher)

受信もする配信者として接続する

- sora.sendrecv(channelId, metadata, options={});

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  | channelId                  | string  |      | チャネルID                            |
  | metadata                   | json    |      | メタデータ                            |
  | options                    | object  |      | シグナリングパラメーター              |
  | * audio                    | boolean | true | オーディオ有効／無効                  |
  | * audioCodecType           | string  |      | オーディオコーデックタイプ(OPUS)      |
  | * audioBitRate             | integer |      | オーディオビットレートの最大値        |
  | * video                    | boolean | true | ビデオ有効／無効                      |
  | * videoCodecType           | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)  |
  | * videoBitRate             | integer |      | ビデオビットレートの最大値            |
  | * multistream              | boolean |      | マルチストリーム有効／無効            |
  | * spotlight                | integer |      | 最大話者数                            |
  | * simulcast                | boolean |      | サイマルキャスト有効／無効            |
  | * simulcastRid             | string  |      | サイマルキャストRID (r0/r1/r2)        |
  | * clientId                 | string  |      | クライアントID                        |
  | * timeout                  | integer |      | タイムアウト時間(ms)                  |
  | * e2ee                     | boolean |      | E2EE 有効/無効                        |
  | * signalingNotifyMetadata  | json    |      | signaling notify 用の metadata        |


- connect(stream)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  mediaStream       | MediaStream Object  |      | メディアストリームオブジェクト  |

- disconnect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- on(kind, callback)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  kind       | string    |      | イベントタイプ(disconnect, push, track, removetrack, notify, log, timeout) |
  |  callback   | function  |      | コールバック |

example
```javascript
var channelId = 'Sora';
var metadata = 'ham';
var sendrecv = sora.sendonly(channelId, metadata);

navigator.mediaDevices.getUserMedia({audio: true, video: true})
  .then(mediaStream => {
    // connect
    sendrecv.connect(mediaStream)
      .then(stream => {
        // stream を video.src に追加する等の処理
      });
  })
  .catch(e => {
    console.error(e);
  });

// disconnect
sendrecv.disconnect()
  .then(() => {
    // video を止める等の処理
  });

// event
sendrecv.on('disconnect', function(e) {
  console.error(e);
});
```

### Sendonly (Publisher)

受信しない配信者として接続する

- sora.sendonly(channelId, metadata, options={});

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  | channelId                  | string  |      | チャネルID                            |
  | metadata                   | json    |      | メタデータ                            |
  | options                    | object  |      | シグナリングパラメーター              |
  | * audio                    | boolean | true | オーディオ有効／無効                  |
  | * audioCodecType           | string  |      | オーディオコーデックタイプ(OPUS)      |
  | * audioBitRate             | integer |      | オーディオビットレートの最大値        |
  | * video                    | boolean | true | ビデオ有効／無効                      |
  | * videoCodecType           | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)  |
  | * videoBitRate             | integer |      | ビデオビットレートの最大値            |
  | * multistream              | boolean |      | マルチストリーム有効／無効            |
  | * spotlight                | integer |      | 最大話者数                            |
  | * simulcast                | boolean |      | サイマルキャスト有効／無効            |
  | * clientId                 | string  |      | クライアントID                        |
  | * timeout                  | integer |      | タイムアウト時間(ms)                  |
  | * e2ee                     | boolean |      | E2EE 有効/無効                        |
  | * signalingNotifyMetadata  | json    |      | signaling notify 用の metadata        |


- connect(stream)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  mediaStream       | MediaStream Object  |      | メディアストリームオブジェクト  |

- disconnect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- on(kind, callback)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  kind       | string    |      | イベントタイプ(disconnect, push, track, removetrack, notify, log, timeout) |
  |  callback   | function  |      | コールバック |

example
```javascript
var channelId = 'Sora';
var metadata = 'ham';
var sendonly = sora.sendonly(channelId, metadata);

navigator.mediaDevices.getUserMedia({audio: true, video: true})
  .then(mediaStream => {
    // connect
    sendonly.connect(mediaStream)
      .then(stream => {
        // stream を video.src に追加する等の処理
      });
  })
  .catch(e => {
    console.error(e);
  });

// disconnect
sendonly.disconnect()
  .then(() => {
    // video を止める等の処理
  });

// event
sendonly.on('disconnect', function(e) {
  console.error(e);
});
```


### Recvonly (Subscriber)

視聴者のみとして接続する

- sora.recvonly(channelId, metadata, options={});

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  | channelId                  | string  |      | チャネルID                                  |
  | metadata                   | json    |      | メタデータ                                  |
  | options                    | object  |      | シグナリングパラメーター                    |
  | * audio                    | boolean | true | オーディオ有効／無効                        |
  | * audioCodecType           | string  |      | オーディオコーデックタイプ(OPUS)            |
  | * audioBitRate             | integer |      | オーディオビットレートの最大値              |
  | * video                    | boolean | true | ビデオ有効／無効                            |
  | * videoCodecType           | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)        |
  | * videoBitRate             | integer |      | ビデオビットレートの最大値                  |
  | * multistream              | boolean |      | マルチストリーム有効／無効                  |
  | * spotlight                | integer |      | 最大話者数                                  |
  | * simulcast                | boolean |      | サイマルキャスト有効／無効                  |
  | * simulcastRid             | string  |      | サイマルキャストRID(r0/r1/r2)               |
  | * clientId                 | string  |      | クライアントID                              |
  | * timeout                  | integer |      | タイムアウト時間(ms)                        |
  | * e2ee                     | boolean |      | E2EE 有効/無効                              |
  | * signalingNotifyMetadata  | json    |      | signaling notify 用の metadata              |


- connect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- disconnect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- on(kind, callback)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  kind       | string    |      | イベントタイプ(disconnect, push, track, removetrack, notify, log, timeout) |
  |  callback   | function  |      | コールバック |

example
```javascript
var channelId = 'Sora';
var metadata = 'ham';
var subscriber = sora.recvonly(channelId, metadata, options);

// connect
recvonly.connect()
  .then(stream => {
    // stream を video.src に追加する等の処理
  })
  .catch(e => {
    console.error(e);
  });

// disconnect
recvonly.disconnect()
  .then(() => {
    // video を止める等の処理
  });

// event
recvonly.on('disconnect', function(e) {
  console.error(e);
});
```

## ライセンス

Apache License 2.0

```
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
