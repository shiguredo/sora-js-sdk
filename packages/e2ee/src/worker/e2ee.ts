/* eslint-disable @typescript-eslint/triple-slash-reference, @typescript-eslint/no-unused-vars */
/// <reference path="./sframe.ts"/>

type UnencryptedBytes = {
  key: 10
  delta: 3
  undefined: 1
}

type Chunk = {
  synchronizationSource: number
  data: ArrayBuffer
  type: keyof UnencryptedBytes
}
// TODO: 扱う数値が大きい箇所では Number から BigInt に置き換える
// TODO: BigInt に置き換える際に変更する
const maxKeyId = 2 ** 32
const maxCount = 2 ** 32

const selfDeriveKeyMap: Map<string, { connectionId: string; keyId: number; deriveKey: CryptoKey }> =
  new Map()
const countMap: Map<string, number> = new Map()
const writeIVMap: Map<string, Uint8Array> = new Map()
const remoteDeriveKeyMap: Map<string, Map<number, CryptoKey>> = new Map()
const latestRemoteKeyIdMap: Map<string, number> = new Map()

const littleEndian = true
const bigEndian = !littleEndian

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// VP8 のみ
// TODO(nakai): VP9 / AV1 も将来的に対応も考える
const unencryptedBytes = {
  // I フレーム
  key: 10,
  // 非 I フレーム
  delta: 3,
  // オーディオ
  undefined: 1,
}

function getCount(connectionId: string): number {
  return countMap.get(connectionId) || 0
}

function setCount(connectionId: string, count: number): Map<string, number> {
  return countMap.set(connectionId, count)
}

function getRemoteDeriveKey(connectionId: string, keyId: number): CryptoKey | undefined {
  if (!remoteDeriveKeyMap.has(connectionId)) {
    throw new Error('REMOTE-DERIVEKEY-MAP-NOT-FOUND')
  }

  const deriveKeyMap = remoteDeriveKeyMap.get(connectionId)
  if (!deriveKeyMap) {
    return
  }
  return deriveKeyMap.get(keyId)
}

function setRemoteDeriveKey(connectionId: string, keyId: number, deriveKey: CryptoKey): void {
  let deriveKeyMap = remoteDeriveKeyMap.get(connectionId)
  if (!deriveKeyMap) {
    deriveKeyMap = new Map()
  }
  deriveKeyMap.set(keyId, deriveKey)
  remoteDeriveKeyMap.set(connectionId, deriveKeyMap)
}

function setLatestRemoteKeyId(connectionId: string, keyId: number): void {
  const latestRemoteKeyId = latestRemoteKeyIdMap.get(connectionId)
  if (latestRemoteKeyId) {
    if (latestRemoteKeyId < keyId) {
      latestRemoteKeyIdMap.set(connectionId, keyId)
    }
  } else {
    latestRemoteKeyIdMap.set(connectionId, keyId)
  }
}

function removeOldRemoteDeriveKeys(): void {
  latestRemoteKeyIdMap.forEach((latestKeyId, connectionId) => {
    const deriveKeyMap = remoteDeriveKeyMap.get(connectionId)
    if (deriveKeyMap) {
      deriveKeyMap.forEach((_, keyId) => {
        if (latestKeyId !== keyId) {
          deriveKeyMap.delete(keyId)
        }
      })
    }
  })
}

function removeDeriveKey(connectionId: string): void {
  latestRemoteKeyIdMap.delete(connectionId)
  remoteDeriveKeyMap.delete(connectionId)
}

function getLatestSelfDeriveKey(): { connectionId: string; keyId: number; deriveKey: CryptoKey } {
  const deriveKey = selfDeriveKeyMap.get('latest')
  if (!deriveKey) {
    throw new Error('LATEST-SELF-DERIVEKEY-NOT_FOUND')
  }
  return deriveKey
}

function setSelfDeriveKey(connectionId: string, keyId: number, deriveKey: CryptoKey): void {
  const currentSelfDeriveKey = selfDeriveKeyMap.get('latest')
  if (currentSelfDeriveKey) {
    if (currentSelfDeriveKey['keyId'] < keyId) {
      const nextSelfDeriveKey = { connectionId, keyId, deriveKey }
      selfDeriveKeyMap.set('latest', nextSelfDeriveKey)
    }
  } else {
    const nextSelfDeriveKey = { connectionId, keyId, deriveKey }
    selfDeriveKeyMap.set('latest', nextSelfDeriveKey)
  }
}

function silenceFrame(encodedFrame: Chunk): Chunk {
  // connection.created, receiveMessage 受信前の場合
  if (encodedFrame.type === undefined) {
    // 音声は暗号化はいると聞けたものじゃないので置き換える
    const newData = new ArrayBuffer(3)
    const newUint8 = new Uint8Array(newData)

    // Opus サイレンスフレーム
    newUint8.set([0xd8, 0xff, 0xfe])
    encodedFrame.data = newData
  } else {
    // 映像が正常じゃないため PLI ストームが発生してしまう
    // そのため 320x240 の真っ黒な画面に置き換える
    const newData = new ArrayBuffer(60)
    const newUint8 = new Uint8Array(newData)

    // prettier-ignore
    newUint8.set([0xb0, 0x05, 0x00, 0x9d, 0x01, 0x2a, 0xa0, 0x00, 0x5a, 0x00,
      0x39, 0x03, 0x00, 0x00, 0x1c, 0x22, 0x16, 0x16, 0x22, 0x66,
      0x12, 0x20, 0x04, 0x90, 0x40, 0x00, 0xc5, 0x01, 0xe0, 0x7c,
      0x4d, 0x2f, 0xfa, 0xdd, 0x4d, 0xa5, 0x7f, 0x89, 0xa5, 0xff,
      0x5b, 0xa9, 0xb4, 0xaf, 0xf1, 0x34, 0xbf, 0xeb, 0x75, 0x36,
      0x95, 0xfe, 0x26, 0x96, 0x60, 0xfe, 0xff, 0xba, 0xff, 0x40,
    ]);
    encodedFrame.data = newData
  }
  return encodedFrame
}

function setWriteIV(connectionId: string, keyId: number, writeIV: Uint8Array): void {
  const key = [connectionId, keyId.toString()].join(':')
  writeIVMap.set(key, writeIV)
}

function getWriteIV(connectionId: string, keyId: number): Uint8Array | undefined {
  const key = [connectionId, keyId.toString()].join(':')
  return writeIVMap.get(key)
}

function generateIV(count: number, connectionId: string, keyId: number): Uint8Array {
  // TODO: keyId が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
  // TODO: count が Number.MAX_SAFE_INTEGER, 7 byte を超えていた場合はエラーか例外
  // 32 bit まで
  if (maxKeyId < keyId || maxCount < count) {
    throw new Error('EXCEEDED-MAXIMUM-BROADCASTING-TIME')
  }

  const writeIV = getWriteIV(connectionId, keyId)
  if (!writeIV) {
    throw new Error('WRITEIV-NOT-FOUND')
  }

  const paddingLength = Nn - Uint32Array.BYTES_PER_ELEMENT

  const countWithPaddingBuffer = new ArrayBuffer(Nn)
  const countWithPaddingDataView = new DataView(countWithPaddingBuffer)

  countWithPaddingDataView.setUint32(paddingLength, count, bigEndian)

  const iv = new Uint8Array(Nn)
  const countWithPadding = new Uint8Array(countWithPaddingBuffer)
  for (let i = 0; i < Nn; i++) {
    iv[i] = writeIV[i] ^ countWithPadding[i]
  }

  return iv
}

function parsePayload(
  payloadType: keyof UnencryptedBytes,
  payload: Chunk['data'],
): [Uint8Array, Uint8Array] {
  return [
    new Uint8Array(payload, 0, unencryptedBytes[payloadType]),
    new Uint8Array(payload, unencryptedBytes[payloadType]),
  ]
}

function encodeFrameAdd(
  header: Uint8Array,
  sframeHeader: Uint8Array,
  connectionId: string,
): Uint8Array {
  const connectionIdData = textEncoder.encode(connectionId)
  const frameAdd = new Uint8Array(
    header.byteLength + sframeHeader.byteLength + connectionIdData.byteLength,
  )
  frameAdd.set(header, 0)
  frameAdd.set(sframeHeader, header.byteLength)
  frameAdd.set(connectionIdData, header.byteLength + sframeHeader.byteLength)
  return frameAdd
}

async function encryptFunction(
  encodedFrame: Chunk,
  controller: TransformStreamDefaultController,
): Promise<void> {
  const { connectionId, keyId, deriveKey } = getLatestSelfDeriveKey()
  if (!deriveKey) {
    return
  }

  const currentCount = getCount(connectionId)

  // count が 32 bit 以上の場合は停止する
  if (currentCount > maxCount) {
    postMessage({ type: 'disconnect' })
  }

  const iv = generateIV(currentCount, connectionId, keyId)
  if (!iv) {
    return
  }
  const [header, payload] = parsePayload(encodedFrame.type, encodedFrame.data)
  const sframeHeader = encodeSFrameHeader(0, currentCount, keyId)
  const frameAdd = encodeFrameAdd(header, sframeHeader, connectionId)

  crypto.subtle
    .encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        // 暗号化されていない部分
        additionalData: frameAdd,
      },
      deriveKey,
      payload,
    )
    .then((cipherText) => {
      const newData = new ArrayBuffer(frameAdd.byteLength + cipherText.byteLength)
      const newDataUint8 = new Uint8Array(newData)
      newDataUint8.set(frameAdd, 0)
      newDataUint8.set(new Uint8Array(cipherText), frameAdd.byteLength)
      encodedFrame.data = newData

      controller.enqueue(encodedFrame)
    })

  setCount(connectionId, currentCount + 1)
}

async function decryptFunction(
  encodedFrame: Chunk,
  controller: TransformStreamDefaultController,
): Promise<void> {
  // 空フレーム対応
  if (encodedFrame.data.byteLength < 1) {
    return
  }

  try {
    const frameMetadataBuffer = encodedFrame.data.slice(0, unencryptedBytes[encodedFrame.type])
    const frameMetadata = new Uint8Array(frameMetadataBuffer)
    const [sframeHeaderBuffer, connectionIdBuffer, encryptedFrameBuffer] = splitHeader(
      encodedFrame.data.slice(unencryptedBytes[encodedFrame.type]),
    )
    const sframeHeader = new Uint8Array(sframeHeaderBuffer)
    const connectionId = textDecoder.decode(connectionIdBuffer)
    const [s, count, keyId] = parseSFrameHeader(sframeHeaderBuffer)
    // 今回は s flag は 0 のみ
    if (s !== 0) {
      throw new Error('UNEXPECTED-S-FLAG')
    }

    const deriveKey = getRemoteDeriveKey(connectionId, keyId)
    if (!deriveKey) {
      return
    }

    const iv = generateIV(count, connectionId, keyId)
    if (!iv) {
      return
    }

    const frameAdd = encodeFrameAdd(frameMetadata, sframeHeader, connectionId)

    crypto.subtle
      .decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: frameAdd,
        },
        deriveKey,
        new Uint8Array(encryptedFrameBuffer),
      )
      .then((plainText) => {
        const newData = new ArrayBuffer(frameMetadataBuffer.byteLength + plainText.byteLength)
        const newUint8 = new Uint8Array(newData)
        newUint8.set(new Uint8Array(frameMetadataBuffer, 0, unencryptedBytes[encodedFrame.type]))
        newUint8.set(new Uint8Array(plainText), unencryptedBytes[encodedFrame.type])
        encodedFrame.data = newData
        controller.enqueue(encodedFrame)
      })
  } catch (e) {
    // 想定外のパケットフォーマットを受信した場合
    controller.enqueue(silenceFrame(encodedFrame))
  }
}
