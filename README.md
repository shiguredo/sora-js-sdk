# Sora JavaScript SDK

- バージョン
    - 1.0.0

[株式会社時雨堂](https://shiguredo.jp/)が開発、販売している [WebRTC SFU Sora](https://sora.shiguredo.jp) をブラウザから扱うための SDK です。

- sora.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.js
- sora.min.js
    - https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.min.js

## サポートについて

Sora JavaScript SDK に関する質問・要望・バグなどの報告は Issues の利用をお願いします。
ただし、 Sora のライセンス契約の有無に関わらず、 Issue への応答時間と問題の解決を保証しませんのでご了承ください。
Sora JavaScript SDK に対する有償のサポートについては sora at shiguredo.jp までお問い合わせください。

## サンプル

- URL
    - https://github.com/shiguredo/sora-js-sdk/blob/master/example/updown_test.html


## API 一覧

### Sora

#### Sora.connection(signalingUrl, debug=false)

|Param   |Type   |Default   |Description  |
|:--|:-:|:-:|:--|
|signalingUrl  |string   |   |シグナリング先 URL   |
|debug  |boolean   | false  |デバッグフラグ   |

##### example

```javascript
var sora = Sora.connection("ws://127.0.0.1/signaling");
```

#### connection()

SoraConnection オブジェクト作成

##### example

```javascript
var connection = sora.connection();
```

### Publisher

配信者として接続する

#### sora.publisher(channelId, metadata, options={});

|Param   |Type   |Default   |Description  |
|:--|:-:|:-:|:--|
| channelId        | string  |      | チャネルID                            |
| metadata         | string  |      | メタデータ                            |
| options          | object  |      | シグナリングパラメーター              |
| * audio          | boolean | true | オーディオ有効／無効                  |
| * audioCodecType | string  |      | オーディオコーデックタイプ(OPUS/PCMU) |
| * video          | boolean | true | ビデオ有効／無効                      |
| * videoCodecType | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)  |
| * videoBitRate   | integer |      | ビデオビットレート                    |
| * videoSnapshot  | boolean |      | スナップショット有効／無効            |
| * multistream    | boolean |      | マルチストリーム有効／無効            |

#### connect(stream)

|Param   |Type   |Default   |Description  |
|:--|:-:|:-:|:--|
|  mediaStream       | MediaStream Object  |      | メディアストリームオブジェクト  |

##### example

```javascript
var channelId = 'Sora';
var metadata = 'ham';
var publisher = sora.publisher(channelId, metadata, options);

navigator.mediaDevices.getUserMedia({audio: true, video: true})
  .then(mediaStream => {
    publisher.connect(mediaStream)
      .then(stream => {
        // stream を video.src に追加する等の処理
      });
  })
  .catch(e => {
    console.error(e);
  });
```

### Subscriber

視聴者として接続する

#### sora.subscriber(channelId, metadata, options={});

配信者として接続する

|Param   |Type   |Default   |Description  |
|:--|:-:|:-:|:--|
| channelId        | string  |      | チャネルID                            |
| metadata         | string  |      | メタデータ                            |
| options          | object  |      | シグナリングパラメーター              |
| * audio          | boolean | true | オーディオ有効／無効                  |
| * audioCodecType | string  |      | オーディオコーデックタイプ(OPUS/PCMU) |
| * video          | boolean | true | ビデオ有効／無効                      |
| * videoCodecType | string  |      | ビデオコーデックタイプ(VP8/VP9/H264)  |
| * videoBitRate   | integer |      | ビデオビットレート                    |
| * videoSnapshot  | boolean |      | スナップショット有効／無効            |
| * multistream    | boolean |      | マルチストリーム有効／無効            |

#### connect()

|Param   |Type   |Default   |Description  |
|:--|:-:|:-:|:--|

##### example

```javascript
var channelId = 'Sora';
var metadata = 'ham';
var subscriber = sora.subscriber(channelId, metadata, options);

subscriber.connect()
  .then(stream => {
    // stream を video.src に追加する等の処理
  })
  .catch(e => {
    console.error(e);
  });
```
