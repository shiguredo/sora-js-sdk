# Sora JavaScript SDK
[![CircleCI](https://circleci.com/gh/shiguredo/sora-js-sdk.svg?style=svg)](https://circleci.com/gh/shiguredo/sora-js-sdk)
[![GitHub tag](https://img.shields.io/github/tag/shiguredo/sora-js-sdk.svg)](https://github.com/shiguredo/sora-js-sdk)
[![npm version](https://badge.fury.io/js/sora-js-sdk.svg)](https://badge.fury.io/js/sora-js-sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Sora JavaScript SDK は[株式会社時雨堂](https://shiguredo.jp/)が開発、販売している [WebRTC SFU Sora](https://sora.shiguredo.jp) をブラウザから扱うための SDK です。

使い方は [Sora JavaScript SDK ドキュメント](https://sora.shiguredo.jp/js-sdk-doc/) を参照してください。

- sora.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.js
- sora.min.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.min.js

## About Support

We check PRs or Issues only when written in JAPANESE.
In other languages, we won't be able to deal with them. Thank you for your understanding.

## サポートについて

Sora JavaScript SDK に関する質問・要望・バグなどの報告は Issues の利用をお願いします。
ただし、 Sora のライセンス契約の有無に関わらず、 Issue への応答時間と問題の解決を保証しませんのでご了承ください。

Sora JavaScript SDK に対する有償のサポートについては現在提供しておりません。

## システム条件

- WebRTC SFU Sora 19.04 以降

## サンプル

- Upstream/Downstream
    - https://github.com/shiguredo/sora-js-sdk/blob/master/example/updown.html
- Multistream
    - https://github.com/shiguredo/sora-js-sdk/blob/master/example/multistream.html
- Multistream Downstream
    - https://github.com/shiguredo/sora-js-sdk/blob/master/example/multistream_down.html

## Issues について

質問やバグ報告の場合は、次の開発環境のバージョンを **「メジャーバージョン、マイナーバージョン、メンテナンスバージョン」** まで含めて書いてください。

- Sora JavaScript SDK のバージョン
- 利用ブラウザのバージョン

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


### Publisher

配信者として接続する

- sora.publisher(channelId, metadata, options={});

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  | channelId        | string  |      | チャネルID                            |
  | metadata         | string  |      | メタデータ                            |
  | options          | object  |      | シグナリングパラメーター              |
  | * audio          | boolean | true | オーディオ有効／無効                  |
  | * audioCodecType | string  |      | オーディオコーデックタイプ(OPUS/PCMU) |
  | * audioBitRate   | integer |      | オーディオビットレートの最大値        |
  | * video          | boolean | true | ビデオ有効／無効                      |
  | * videoCodecType | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)  |
  | * videoBitRate   | integer |      | ビデオビットレートの最大値            |
  | * multistream    | boolean |      | マルチストリーム有効／無効            |
  | * spotlight      | integer |      | 最大話者数                            |
  | * simulcast      | boolean |      | サイマルキャスト有効／無効            |
  | * simulcast_rid  | boolean |      | rid ベースサイマルキャスト有効／無効  |
  | * clientId       | string  |      | クライアントID                        |


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
  |  kind       | string    |      | イベントタイプ(disconnect, push, addstream, removestream, notify, log) |
  |  callback   | function  |      | コールバック |

example
```javascript
var channelId = 'Sora';
var metadata = 'ham';
var publisher = sora.publisher(channelId, metadata);

navigator.mediaDevices.getUserMedia({audio: true, video: true})
  .then(mediaStream => {
    // connect
    publisher.connect(mediaStream)
      .then(stream => {
        // stream を video.src に追加する等の処理
      });
  })
  .catch(e => {
    console.error(e);
  });

// disconnect
publisher.disconnect()
  .then(() => {
    // video を止める等の処理
  });

// event
publisher.on('disconnect', function(e) {
  console.error(e);
});
```


### Subscriber

視聴者として接続する

- sora.subscriber(channelId, metadata, options={});

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  | channelId          | string  |      | チャネルID                                  |
  | metadata           | string  |      | メタデータ                                  |
  | options            | object  |      | シグナリングパラメーター                    |
  | * audio            | boolean | true | オーディオ有効／無効                        |
  | * audioCodecType   | string  |      | オーディオコーデックタイプ(OPUS/PCMU)       |
  | * audioBitRate     | integer |      | オーディオビットレートの最大値              |
  | * video            | boolean | true | ビデオ有効／無効                            |
  | * videoCodecType   | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)        |
  | * videoBitRate     | integer |      | ビデオビットレートの最大値                  |
  | * multistream      | boolean |      | マルチストリーム有効／無効                  |
  | * spotlight        | integer |      | 最大話者数                                  |
  | * simulcast        | boolean |      | サイマルキャスト有効／無効                  |
  | * simulcastQuality | string  |      | サイマルキャストクオリティ(low/middle/high) |
  | * clientId         | string  |      | クライアントID                              |


- connect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- disconnect()

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|

- on(kind, callback)

  |Param   |Type   |Default   |Description  |
  |:--|:-:|:-:|:--|
  |  kind       | string    |      | イベントタイプ(disconnect, push, addstream, removestream, notify, log) |
  |  callback   | function  |      | コールバック |

example
```javascript
var channelId = 'Sora';
var metadata = 'ham';
var subscriber = sora.subscriber(channelId, metadata, options);

// connect
subscriber.connect()
  .then(stream => {
    // stream を video.src に追加する等の処理
  })
  .catch(e => {
    console.error(e);
  });

// disconnect
subscriber.disconnect()
  .then(() => {
    // video を止める等の処理
  });

// event
publisher.on('disconnect', function(e) {
  console.error(e);
});
```

## 開発者向け
```
$ git clone https://github.com/shiguredo/sora-js-sdk.git
$ cd sora-js-sdk
$ yarn install
```

### ビルド
```
 $ yarn build
```

### 開発時
```
 $ yarn watch
 $ yarn server
```

### リリース
```
 $ yarn lint
 $ yarn test
 $ yarn release
```
