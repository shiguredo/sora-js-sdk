###################
Sora JavaScript SDK
###################

:バージョン: 0.5.0

`WebRTC SFU Sora <https://sora.shiguredo.jp>`_ をブラウザから扱うための SDK です。

:sora.js: https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.js
:sora.min.js: https://github.com/shiguredo/sora-js-sdk/blob/master/dist/sora.min.js

========
サンプル
========

:URL: https://github.com/shiguredo/sora-js-sdk/blob/master/example/updown_test.html


========
API 一覧
========

Sora
====

new Sora(signalingUrl)
----------------------

+--------------+--------+----------+--------------------+
| Param        | Type   | Default  | Description        |
+==============+========+==========+====================+
| signalingUrl | string |          | シグナリング先 URL |
+--------------+--------+----------+--------------------+

example::

  var sora = new Sora("ws://127.0.0.1/signaling");



connection()
----------------------
SoraConnection オブジェクト作成

example::

  var connection = sora.connection();


SoraConnection
==============

connect(params)
---------------
シグナリング接続する

+---------------------+---------+----------+---------------------------------------+
| Param               | Type    | Default  | Description                           |
+=====================+=========+==========+=======================================+
| params              | object  |          | シグナリングパラメーター              |
+---------------------+---------+----------+---------------------------------------+
| - role              | string  |          | ロール(upstream/downstream)           |
+---------------------+---------+----------+---------------------------------------+
| - channelId         | string  |          | チャネルID                            |
+---------------------+---------+----------+---------------------------------------+
| - accessToken       | string  |          | アクセストークン                      |
+---------------------+---------+----------+---------------------------------------+
| - audio             | boolean | true     | オーディオ有効/無効                   |
+---------------------+---------+----------+---------------------------------------+
| - audioCodecType    | string  | OPUS     | オーディオコーデックタイプ(OPUS/PCMU) |
+---------------------+---------+----------+---------------------------------------+
| - video             | boolean | true     | ビデオ有効/無効                       |
+---------------------+---------+----------+---------------------------------------+
| - videoCodecType    | string  | VP8      | ビデオコーデックタイプ(VP8/VP9/H264)  |
+---------------------+---------+----------+---------------------------------------+
| - videoBitRate      | number  |          | ビデオビットレート(0 - 5000)          |
+---------------------+---------+----------+---------------------------------------+
| - videoSnapshot     | boolean | false    | スナップショット有効/無効             |
+---------------------+---------+----------+---------------------------------------+
| - multistream       | boolean | false    | マルチストリーム有効/無効             |
+---------------------+---------+----------+---------------------------------------+

example::

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


answer(sdp)
-----------
Answer SDP を送信する

+-------+--------+----------+-------------+
| Param | Type   | Default  | Description |
+=======+========+==========+=============+
| sdp   | string |          | Answer SDP  |
+-------+--------+----------+-------------+

example::

  connection.answer(sdp);


candidate(candidate)
--------------------
candidate を送信する

+-----------+--------+----------+-------------------+
| Param     | Type   | Default  | Description       |
+===========+========+==========+===================+
| candidate | object |          | candidate object  |
+-----------+--------+----------+-------------------+

example::

  connection.candidate(candidate);


disconnect()
------------
切断する

example::

  connection.disconnect();


on(kind, callback)
-----------------
callback を登録する

+----------+----------+----------+--------------------+
| Param    | Type     | Default  | Description        |
+==========+==========+==========+====================+
| kind     | string   |          | コールバックの種類 |
+----------+----------+----------+--------------------+
| callback | function |          | コールバック       |
+----------+----------+----------+--------------------+

example::

  connection.on("disconnect", function(e) {
    console.log(e);
  });
