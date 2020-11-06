"use strict";
/* eslint-disable @typescript-eslint/no-unused-vars */
const connectionIdLength = 26;
function byteCount(n) {
    if (n == 0) {
        return 1;
    }
    // log256(x) = log(x) / log(256)
    return Math.floor(Math.log(n) / Math.log(2 ** 8) + 1);
}
function arrayBufferToNumber(arrayBuffer) {
    // 32bit までを想定 (BigInt への書き換え時に要修正)
    const newArrayBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const newDataView = new DataView(newArrayBuffer);
    const dataView = new DataView(arrayBuffer);
    const paddingLength = Uint32Array.BYTES_PER_ELEMENT - dataView.byteLength;
    for (let i = 0; i < paddingLength; i += 1) {
        newDataView.setUint8(i, 0);
    }
    for (let i = paddingLength, j = 0; i < Uint32Array.BYTES_PER_ELEMENT; i += 1, j += 1) {
        newDataView.setUint8(i, dataView.getUint8(j));
    }
    return newDataView.getUint32(0);
}
function encodeSFrameHeader(s, count, keyId) {
    //  0 1 2 3 4 5 6 7
    // +-+-+-+-+-+-+-+-+---------------------------+---------------------------+
    // |S|LEN  |1|KLEN |   KID... (length=KLEN)    |    CTR... (length=LEN)    |
    // +-+-+-+-+-+-+-+-+---------------------------+---------------------------+
    // S: 1 bit
    // LEN: 3 bit
    // X: 1 bit
    // KLEN: 3 bit
    // KID: KLEN byte
    // CTR: LEN byte
    // TODO: keyId (KID) が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
    // TODO: count (CTR) が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
    if (maxKeyId < keyId || maxCount < count) {
        throw new Error("EXCEEDED-MAXIMUM-BROADCASTING-TIME");
    }
    const klen = byteCount(keyId);
    const len = byteCount(count);
    const headerBuffer = new ArrayBuffer(1 + klen + len);
    const headerDataView = new DataView(headerBuffer);
    // S, LEN, 1, KLEN で 1 byte
    headerDataView.setUint8(0, (s << 7) + (len << 4) + (1 << 3) + klen);
    const headerUint8Array = new Uint8Array(headerBuffer);
    const keyIdBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const keyIdDataView = new DataView(keyIdBuffer);
    keyIdDataView.setUint32(0, keyId);
    const keyIdUint8Array = new Uint8Array(keyIdBuffer);
    headerUint8Array.set(keyIdUint8Array.subarray(Uint32Array.BYTES_PER_ELEMENT - klen), 1);
    const countBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const countDataView = new DataView(countBuffer);
    countDataView.setUint32(0, count);
    const countUint8Array = new Uint8Array(countBuffer);
    headerUint8Array.set(countUint8Array.subarray(Uint32Array.BYTES_PER_ELEMENT - len), klen + 1);
    return headerUint8Array;
}
function splitHeader(sframe) {
    const sframeDataView = new DataView(sframe);
    const header = sframeDataView.getUint8(0);
    const len = (header & 0x70) >> 4;
    const klen = header & 0x07;
    const sframeHeaderLength = 1 + klen + len;
    const sframeHeader = sframe.slice(0, sframeHeaderLength);
    if (sframeHeader.byteLength < sframeHeaderLength) {
        throw new Error("UNEXPECTED-SFRAME-LENGTH");
    }
    const connectionId = sframe.slice(sframeHeaderLength, sframeHeaderLength + connectionIdLength);
    const encryptedFrame = sframe.slice(sframeHeaderLength + connectionIdLength, sframe.byteLength);
    return [sframeHeader, connectionId, encryptedFrame];
}
function parseSFrameHeader(sframeHeader) {
    const sframeHeaderDataView = new DataView(sframeHeader);
    const header = sframeHeaderDataView.getUint8(0);
    const s = (header & 0x80) >> 7;
    const len = (header & 0x70) >> 4;
    const x = (header & 0x08) >> 3;
    const klen = header & 0x07;
    // x flag
    if (x !== 1) {
        throw new Error("UNEXPECTED-X-FLAG");
    }
    const headerLength = 1 + klen + len;
    if (sframeHeaderDataView.byteLength < headerLength) {
        throw new Error("UNEXPECTED-SFRAME-HEADER-LENGTH");
    }
    const keyIdBuffer = sframeHeader.slice(1, 1 + klen);
    const keyId = arrayBufferToNumber(keyIdBuffer);
    const countBuffer = sframeHeader.slice(1 + klen, headerLength);
    const count = arrayBufferToNumber(countBuffer);
    return [s, count, keyId];
}
/* eslint-disable @typescript-eslint/triple-slash-reference, @typescript-eslint/no-unused-vars */
/// <reference path="./sframe.ts"/>
// TODO: 扱う数値が大きい箇所では Number から BigInt に置き換える
// TODO: BigInt に置き換える際に変更する
const maxKeyId = 2 ** 32;
const maxCount = 2 ** 32;
const selfDeriveKeyMap = new Map();
const countMap = new Map();
const writeIVMap = new Map();
const remoteDeriveKeyMap = new Map();
const latestRemoteKeyIdMap = new Map();
const littleEndian = true;
const bigEndian = !littleEndian;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
// VP8 のみ
// TODO(nakai): VP9 / AV1 も将来的に対応も考える
const unencryptedBytes = {
    // I フレーム
    key: 10,
    // 非 I フレーム
    delta: 3,
    // オーディオ
    undefined: 1,
};
function getCount(connectionId) {
    return countMap.get(connectionId) || 0;
}
function setCount(connectionId, count) {
    return countMap.set(connectionId, count);
}
function getRemoteDeriveKey(connectionId, keyId) {
    if (!remoteDeriveKeyMap.has(connectionId)) {
        throw new Error("REMOTE-DERIVEKEY-MAP-NOT-FOUND");
    }
    const deriveKeyMap = remoteDeriveKeyMap.get(connectionId);
    if (!deriveKeyMap) {
        return undefined;
    }
    return deriveKeyMap.get(keyId);
}
function setRemoteDeriveKey(connectionId, keyId, deriveKey) {
    let deriveKeyMap = remoteDeriveKeyMap.get(connectionId);
    if (!deriveKeyMap) {
        deriveKeyMap = new Map();
    }
    deriveKeyMap.set(keyId, deriveKey);
    remoteDeriveKeyMap.set(connectionId, deriveKeyMap);
}
function setLatestRemoteKeyId(connectionId, keyId) {
    const latestRemoteKeyId = latestRemoteKeyIdMap.get(connectionId);
    if (latestRemoteKeyId) {
        if (latestRemoteKeyId < keyId) {
            latestRemoteKeyIdMap.set(connectionId, keyId);
        }
    }
    else {
        latestRemoteKeyIdMap.set(connectionId, keyId);
    }
}
function removeOldRemoteDeriveKeys() {
    latestRemoteKeyIdMap.forEach((latestKeyId, connectionId) => {
        const deriveKeyMap = remoteDeriveKeyMap.get(connectionId);
        if (deriveKeyMap) {
            deriveKeyMap.forEach((_, keyId) => {
                if (latestKeyId !== keyId) {
                    deriveKeyMap.delete(keyId);
                }
            });
        }
    });
}
function removeDeriveKey(connectionId) {
    latestRemoteKeyIdMap.delete(connectionId);
    remoteDeriveKeyMap.delete(connectionId);
}
function getLatestSelfDeriveKey() {
    const deriveKey = selfDeriveKeyMap.get("latest");
    if (!deriveKey) {
        throw new Error("LATEST-SELF-DERIVEKEY-NOT_FOUND");
    }
    return deriveKey;
}
function setSelfDeriveKey(connectionId, keyId, deriveKey) {
    const currentSelfDeriveKey = selfDeriveKeyMap.get("latest");
    if (currentSelfDeriveKey) {
        if (currentSelfDeriveKey["keyId"] < keyId) {
            const nextSelfDeriveKey = { connectionId, keyId, deriveKey };
            selfDeriveKeyMap.set("latest", nextSelfDeriveKey);
        }
    }
    else {
        const nextSelfDeriveKey = { connectionId, keyId, deriveKey };
        selfDeriveKeyMap.set("latest", nextSelfDeriveKey);
    }
}
function silenceFrame(encodedFrame) {
    // connection.created, receiveMessage 受信前の場合
    if (encodedFrame.type === undefined) {
        // 音声は暗号化はいると聞けたものじゃないので置き換える
        const newData = new ArrayBuffer(3);
        const newUint8 = new Uint8Array(newData);
        // Opus サイレンスフレーム
        newUint8.set([0xd8, 0xff, 0xfe]);
        encodedFrame.data = newData;
    }
    else {
        // 映像が正常じゃないため PLI ストームが発生してしまう
        // そのため 320x240 の真っ黒な画面に置き換える
        const newData = new ArrayBuffer(60);
        const newUint8 = new Uint8Array(newData);
        // prettier-ignore
        newUint8.set([0xb0, 0x05, 0x00, 0x9d, 0x01, 0x2a, 0xa0, 0x00, 0x5a, 0x00,
            0x39, 0x03, 0x00, 0x00, 0x1c, 0x22, 0x16, 0x16, 0x22, 0x66,
            0x12, 0x20, 0x04, 0x90, 0x40, 0x00, 0xc5, 0x01, 0xe0, 0x7c,
            0x4d, 0x2f, 0xfa, 0xdd, 0x4d, 0xa5, 0x7f, 0x89, 0xa5, 0xff,
            0x5b, 0xa9, 0xb4, 0xaf, 0xf1, 0x34, 0xbf, 0xeb, 0x75, 0x36,
            0x95, 0xfe, 0x26, 0x96, 0x60, 0xfe, 0xff, 0xba, 0xff, 0x40,
        ]);
        encodedFrame.data = newData;
    }
    return encodedFrame;
}
function setWriteIV(connectionId, keyId, writeIV) {
    const key = [connectionId, keyId.toString()].join(":");
    writeIVMap.set(key, writeIV);
}
function getWriteIV(connectionId, keyId) {
    const key = [connectionId, keyId.toString()].join(":");
    return writeIVMap.get(key);
}
function generateIV(count, connectionId, keyId) {
    // TODO: keyId が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
    // TODO: count が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
    // 32 bit まで
    if (maxKeyId < keyId || maxCount < count) {
        throw new Error("EXCEEDED-MAXIMUM-BROADCASTING-TIME");
    }
    const writeIV = getWriteIV(connectionId, keyId);
    if (!writeIV) {
        throw new Error("WRITEIV-NOT-FOUND");
    }
    const paddingLength = Nn - Uint32Array.BYTES_PER_ELEMENT;
    const countWithPaddingBuffer = new ArrayBuffer(Nn);
    const countWithPaddingDataView = new DataView(countWithPaddingBuffer);
    countWithPaddingDataView.setUint32(paddingLength, count, bigEndian);
    const iv = new Uint8Array(Nn);
    const countWithPadding = new Uint8Array(countWithPaddingBuffer);
    for (let i = 0; i < Nn; i++) {
        iv[i] = writeIV[i] ^ countWithPadding[i];
    }
    return iv;
}
function parsePayload(payloadType, payload) {
    return [
        new Uint8Array(payload, 0, unencryptedBytes[payloadType]),
        new Uint8Array(payload, unencryptedBytes[payloadType]),
    ];
}
function encodeFrameAdd(header, sframeHeader, connectionId) {
    const connectionIdData = textEncoder.encode(connectionId);
    const frameAdd = new Uint8Array(header.byteLength + sframeHeader.byteLength + connectionIdData.byteLength);
    frameAdd.set(header, 0);
    frameAdd.set(sframeHeader, header.byteLength);
    frameAdd.set(connectionIdData, header.byteLength + sframeHeader.byteLength);
    return frameAdd;
}
async function encryptFunction(encodedFrame, controller) {
    const { connectionId, keyId, deriveKey } = getLatestSelfDeriveKey();
    if (!deriveKey) {
        console.info("DERIVEKEY-NOT-FOUND");
        return;
    }
    const currentCount = getCount(connectionId);
    // count が 32 bit 以上の場合は停止する
    if (currentCount > maxCount) {
        postMessage({ type: "disconnect" });
    }
    const iv = generateIV(currentCount, connectionId, keyId);
    if (!iv) {
        console.info("WRITEIV-NOT-FOUND");
        return;
    }
    const [header, payload] = parsePayload(encodedFrame.type, encodedFrame.data);
    const sframeHeader = encodeSFrameHeader(0, currentCount, keyId);
    const frameAdd = encodeFrameAdd(header, sframeHeader, connectionId);
    crypto.subtle
        .encrypt({
        name: "AES-GCM",
        iv: iv,
        // 暗号化されていない部分
        additionalData: frameAdd,
    }, deriveKey, payload)
        .then((cipherText) => {
        const newData = new ArrayBuffer(frameAdd.byteLength + cipherText.byteLength);
        const newDataUint8 = new Uint8Array(newData);
        newDataUint8.set(frameAdd, 0);
        newDataUint8.set(new Uint8Array(cipherText), frameAdd.byteLength);
        encodedFrame.data = newData;
        controller.enqueue(encodedFrame);
    });
    setCount(connectionId, currentCount + 1);
}
async function decryptFunction(encodedFrame, controller) {
    // 空フレーム対応
    if (encodedFrame.data.byteLength < 1) {
        console.info("EMPTY-DATA");
        return;
    }
    try {
        const frameMetadataBuffer = encodedFrame.data.slice(0, unencryptedBytes[encodedFrame.type]);
        const frameMetadata = new Uint8Array(frameMetadataBuffer);
        const [sframeHeaderBuffer, connectionIdBuffer, encryptedFrameBuffer] = splitHeader(encodedFrame.data.slice(unencryptedBytes[encodedFrame.type]));
        const sframeHeader = new Uint8Array(sframeHeaderBuffer);
        const connectionId = textDecoder.decode(connectionIdBuffer);
        const [s, count, keyId] = parseSFrameHeader(sframeHeaderBuffer);
        // 今回は s flag は 0 のみ
        if (s !== 0) {
            throw new Error("UNEXPECTED-S-FLAG");
        }
        const deriveKey = getRemoteDeriveKey(connectionId, keyId);
        if (!deriveKey) {
            console.warn("DERIVEKEY-NOT-FOUND: ", connectionId, keyId);
            return;
        }
        const iv = generateIV(count, connectionId, keyId);
        if (!iv) {
            console.info("WRITEIV-NOT-FOUND");
            return;
        }
        const frameAdd = encodeFrameAdd(frameMetadata, sframeHeader, connectionId);
        crypto.subtle
            .decrypt({
            name: "AES-GCM",
            iv: iv,
            additionalData: frameAdd,
        }, deriveKey, new Uint8Array(encryptedFrameBuffer))
            .then((plainText) => {
            const newData = new ArrayBuffer(frameMetadataBuffer.byteLength + plainText.byteLength);
            const newUint8 = new Uint8Array(newData);
            newUint8.set(new Uint8Array(frameMetadataBuffer, 0, unencryptedBytes[encodedFrame.type]));
            newUint8.set(new Uint8Array(plainText), unencryptedBytes[encodedFrame.type]);
            encodedFrame.data = newData;
            controller.enqueue(encodedFrame);
        });
    }
    catch (e) {
        // 想定外のパケットフォーマットを受信した場合
        controller.enqueue(silenceFrame(encodedFrame));
    }
}
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./e2ee.ts"/>
// nonce サイズ
const Nn = 12;
// key サイズ
const Nk = 16;
// key サイズ（bit）
const keyLength = Nk * 8;
async function generateDeriveKey(material) {
    const salt = textEncoder.encode("SFrame10");
    const info = textEncoder.encode("key");
    const deriveKey = await crypto.subtle.deriveKey({
        name: "HKDF",
        salt: salt,
        hash: "SHA-256",
        info: info,
    }, material, {
        name: "AES-GCM",
        length: keyLength,
    }, false, ["encrypt", "decrypt"]);
    return deriveKey;
}
async function generateWriteIV(material) {
    const salt = textEncoder.encode("SFrame10");
    const info = textEncoder.encode("salt");
    const writeIVBuffer = await crypto.subtle.deriveBits({
        name: "HKDF",
        salt: salt,
        hash: "SHA-384",
        info: info,
    }, material, 
    // IV は 96 ビットなので
    Nn * 8);
    const writeIV = new Uint8Array(writeIVBuffer);
    return writeIV;
}
let removalTimeoutId = 0;
onmessage = (event) => {
    const { type } = event.data;
    if (type === "selfSecretKeyMaterial") {
        const { selfSecretKeyMaterial, selfConnectionId, selfKeyId, waitingTime } = event.data;
        const timeoutId = setTimeout(() => {
            crypto.subtle
                .importKey("raw", selfSecretKeyMaterial.buffer, "HKDF", false, ["deriveBits", "deriveKey"])
                .then((material) => {
                generateDeriveKey(material).then((deriveKey) => {
                    setSelfDeriveKey(selfConnectionId, selfKeyId, deriveKey);
                });
                generateWriteIV(material).then((writeIV) => {
                    setWriteIV(selfConnectionId, selfKeyId, writeIV);
                });
                clearTimeout(timeoutId);
            });
        }, waitingTime || 0);
        // TODO: +1000 で鍵生成後に実行されるようにしているが短い場合は伸ばす
        const removalWaitingTime = (waitingTime || 0) + 1000;
        if (removalTimeoutId) {
            // 動作済みタイマー有り
            if (waitingTime) {
                // connection.destroyed
                clearTimeout(removalTimeoutId);
                removalTimeoutId = setTimeout(() => {
                    removeOldRemoteDeriveKeys();
                    clearTimeout(removalTimeoutId);
                    removalTimeoutId = 0;
                }, removalWaitingTime);
            }
        }
        else {
            // 動作済みタイマーなし
            // connection.created の場合も少し実行を遅らせる
            removalTimeoutId = setTimeout(() => {
                removeOldRemoteDeriveKeys();
                clearTimeout(removalTimeoutId);
                removalTimeoutId = 0;
            }, removalWaitingTime);
        }
    }
    else if (type === "remoteSecretKeyMaterials") {
        const { remoteSecretKeyMaterials } = event.data;
        for (const [connectionId, remoteSecretKeyMaterial] of Object.entries(remoteSecretKeyMaterials)) {
            const { keyId, secretKeyMaterial } = remoteSecretKeyMaterial;
            crypto.subtle
                .importKey("raw", secretKeyMaterial.buffer, "HKDF", false, ["deriveBits", "deriveKey"])
                .then((material) => {
                generateDeriveKey(material).then((deriveKey) => {
                    setRemoteDeriveKey(connectionId, keyId, deriveKey);
                });
                generateWriteIV(material).then((writeIV) => {
                    setWriteIV(connectionId, keyId, writeIV);
                });
                setLatestRemoteKeyId(connectionId, keyId);
            });
        }
    }
    else if (type === "removeRemoteDeriveKey") {
        const { connectionId } = event.data;
        removeDeriveKey(connectionId);
    }
    else if (type === "encrypt") {
        const { readableStream, writableStream } = event.data;
        const transformStream = new TransformStream({
            transform: encryptFunction,
        });
        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    }
    else if (type === "decrypt") {
        const { readableStream, writableStream } = event.data;
        const transformStream = new TransformStream({
            transform: decryptFunction,
        });
        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    }
    else if (type === "clear") {
        countMap.clear();
        writeIVMap.clear();
        remoteDeriveKeyMap.clear();
        selfDeriveKeyMap.clear();
    }
};
