# Sora JavaScript SDK

- バージョン
    - 0.5.0

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

#### new Sora(signalingUrl)

|Param   |Type   |Default   |Description  |
|:-:|:-:|:-:|:-:|
|signalingUrl  |string   |   |シグナリング先 URL   |

##### example

```javascript
var sora = new Sora("ws://127.0.0.1/signaling");
```


#### connection()

SoraConnection オブジェクト作成

##### example

```javascript
var connection = sora.connection();
```


### SoraConnection

#### connect(params)

シグナリング接続する

|Param   |Type   |Default   |Description  |
|:-|:-:|:-:|:-:|
| params              | object  |          | シグナリングパラメーター              |
| * role              | string  |          | ロール(upstream/downstream)           |
| * channelId         | string  |          | チャネルID                            |
| * accessToken       | string  |          | アクセストークン                      |
| * audio             | boolean | true     | オーディオ有効/無効                   |
| * audioCodecType    | string  | OPUS     | オーディオコーデックタイプ(OPUS/PCMU) |
| * video             | boolean | true     | ビデオ有効/無効                       |
| * videoCodecType    | string  | VP8      | ビデオコーデックタイプ(VP8/VP9/H264)  |
| * videoBitRate      | number  |          | ビデオビットレート(0 - 5000)          |
| * videoSnapshot     | boolean | false    | スナップショット有効/無効             |
| * multistream       | boolean | false    | マルチストリーム有効/無効             |


##### example

```javascript
var params = {
  role: "upstream",
  channelId: "Sora",
  accessToken: "",
  codecType: "VP8"
};
connection.connect(params)
          .then(function(offer) {
            console.log(offer);
          });
```

#### answer(sdp)

Answer SDP を送信する

|Param   |Type   |Default   |Description  |
|:-:|:-:|:-:|:-:|
| sdp   | string |          | Answer SDP  |

##### example

```
connection.answer(sdp);
```


#### candidate(candidate)

candidate を送信する

|Param   |Type   |Default   |Description  |
|:-:|:-:|:-:|:-:|
| candidate | object |          | candidate object  |

##### example

```javascript
connection.candidate(candidate);
```

#### disconnect()

切断する

##### example

```javascript
connection.disconnect();
```

### on(kind, callback)

callback を登録する

|Param   |Type   |Default   |Description  |
|:-:|:-:|:-:|:-:|
| kind     | string   |          | コールバックの種類 |
| callback | function |          | コールバック       |

##### example

```javascript
connection.on("disconnect", function(e) {
  console.log(e);
});
```
