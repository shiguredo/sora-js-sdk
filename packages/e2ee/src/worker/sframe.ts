/* eslint-disable @typescript-eslint/no-unused-vars */
const connectionIdLength = 26

function byteCount(n: number): number {
  if (n == 0) {
    return 1
  }
  // log256(x) = log(x) / log(256)
  return Math.floor(Math.log(n) / Math.log(2 ** 8) + 1)
}

function arrayBufferToNumber(arrayBuffer: ArrayBuffer): number {
  // 32bit までを想定 (BigInt への書き換え時に要修正)
  const newArrayBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT)
  const newDataView = new DataView(newArrayBuffer)

  const dataView = new DataView(arrayBuffer)

  const paddingLength = Uint32Array.BYTES_PER_ELEMENT - dataView.byteLength

  for (let i = 0; i < paddingLength; i += 1) {
    newDataView.setUint8(i, 0)
  }

  for (let i = paddingLength, j = 0; i < Uint32Array.BYTES_PER_ELEMENT; i += 1, j += 1) {
    newDataView.setUint8(i, dataView.getUint8(j))
  }

  return newDataView.getUint32(0)
}

function encodeSFrameHeader(s: number, count: number, keyId: number): Uint8Array {
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
    throw new Error('EXCEEDED-MAXIMUM-BROADCASTING-TIME')
  }

  const klen = byteCount(keyId)
  const len = byteCount(count)

  const headerBuffer = new ArrayBuffer(1 + klen + len)
  const headerDataView = new DataView(headerBuffer)
  // S, LEN, 1, KLEN で 1 byte
  headerDataView.setUint8(0, (s << 7) + (len << 4) + (1 << 3) + klen)

  const headerUint8Array = new Uint8Array(headerBuffer)

  const keyIdBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT)
  const keyIdDataView = new DataView(keyIdBuffer)
  keyIdDataView.setUint32(0, keyId)
  const keyIdUint8Array = new Uint8Array(keyIdBuffer)
  headerUint8Array.set(keyIdUint8Array.subarray(Uint32Array.BYTES_PER_ELEMENT - klen), 1)

  const countBuffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT)
  const countDataView = new DataView(countBuffer)
  countDataView.setUint32(0, count)
  const countUint8Array = new Uint8Array(countBuffer)
  headerUint8Array.set(countUint8Array.subarray(Uint32Array.BYTES_PER_ELEMENT - len), klen + 1)

  return headerUint8Array
}

function splitHeader(sframe: ArrayBuffer): [ArrayBuffer, ArrayBuffer, ArrayBuffer] {
  const sframeDataView = new DataView(sframe)
  const header = sframeDataView.getUint8(0)
  const len = (header & 0x70) >> 4
  const klen = header & 0x07

  const sframeHeaderLength = 1 + klen + len
  const sframeHeader = sframe.slice(0, sframeHeaderLength)

  if (sframeHeader.byteLength < sframeHeaderLength) {
    throw new Error('UNEXPECTED-SFRAME-LENGTH')
  }

  const connectionId = sframe.slice(sframeHeaderLength, sframeHeaderLength + connectionIdLength)

  const encryptedFrame = sframe.slice(sframeHeaderLength + connectionIdLength, sframe.byteLength)

  return [sframeHeader, connectionId, encryptedFrame]
}

function parseSFrameHeader(sframeHeader: ArrayBuffer): [number, number, number] {
  const sframeHeaderDataView = new DataView(sframeHeader)
  const header = sframeHeaderDataView.getUint8(0)

  const s = (header & 0x80) >> 7
  const len = (header & 0x70) >> 4
  const x = (header & 0x08) >> 3
  const klen = header & 0x07

  // x flag
  if (x !== 1) {
    throw new Error('UNEXPECTED-X-FLAG')
  }

  const headerLength = 1 + klen + len

  if (sframeHeaderDataView.byteLength < headerLength) {
    throw new Error('UNEXPECTED-SFRAME-HEADER-LENGTH')
  }

  const keyIdBuffer = sframeHeader.slice(1, 1 + klen)
  const keyId = arrayBufferToNumber(keyIdBuffer)

  const countBuffer = sframeHeader.slice(1 + klen, headerLength)
  const count = arrayBufferToNumber(countBuffer)

  return [s, count, keyId]
}
