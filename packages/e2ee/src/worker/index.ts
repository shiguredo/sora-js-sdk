/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./e2ee.ts"/>

type RemoteSecretKeyMaterial = {
  keyId: number
  secretKeyMaterial: Uint8Array
}

// nonce サイズ
const Nn = 12
// key サイズ
const Nk = 16
// key サイズ（bit）
const keyLength = Nk * 8

async function generateDeriveKey(material: CryptoKey): Promise<CryptoKey> {
  const salt = textEncoder.encode('SFrame10')
  const info = textEncoder.encode('key')
  const deriveKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      hash: 'SHA-256',
      info: info,
    },
    material,
    {
      name: 'AES-GCM',
      length: keyLength,
    },
    false,
    ['encrypt', 'decrypt'],
  )
  return deriveKey
}

async function generateWriteIV(material: CryptoKey): Promise<Uint8Array> {
  const salt = textEncoder.encode('SFrame10')
  const info = textEncoder.encode('salt')

  const writeIVBuffer = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      salt: salt,
      hash: 'SHA-384',
      info: info,
    },
    material,
    // IV は 96 ビットなので
    Nn * 8,
  )
  const writeIV = new Uint8Array(writeIVBuffer)
  return writeIV
}

let removalTimeoutId = 0

onmessage = (event): void => {
  const { type } = event.data
  if (type === 'selfSecretKeyMaterial') {
    const { selfSecretKeyMaterial, selfConnectionId, selfKeyId, waitingTime } = event.data
    const timeoutId = setTimeout(() => {
      crypto.subtle
        .importKey('raw', selfSecretKeyMaterial.buffer, 'HKDF', false, ['deriveBits', 'deriveKey'])
        .then((material) => {
          generateDeriveKey(material).then((deriveKey) => {
            setSelfDeriveKey(selfConnectionId, selfKeyId, deriveKey)
          })

          generateWriteIV(material).then((writeIV) => {
            setWriteIV(selfConnectionId, selfKeyId, writeIV)
          })

          clearTimeout(timeoutId)
        })
    }, waitingTime || 0)

    // TODO: +1000 で鍵生成後に実行されるようにしているが短い場合は伸ばす
    const removalWaitingTime = (waitingTime || 0) + 1000
    if (removalTimeoutId) {
      // 動作済みタイマー有り
      if (waitingTime) {
        // connection.destroyed
        clearTimeout(removalTimeoutId)
        removalTimeoutId = setTimeout(() => {
          removeOldRemoteDeriveKeys()
          clearTimeout(removalTimeoutId)
          removalTimeoutId = 0
        }, removalWaitingTime)
      }
    } else {
      // 動作済みタイマーなし
      // connection.created の場合も少し実行を遅らせる
      removalTimeoutId = setTimeout(() => {
        removeOldRemoteDeriveKeys()
        clearTimeout(removalTimeoutId)
        removalTimeoutId = 0
      }, removalWaitingTime)
    }
  } else if (type === 'remoteSecretKeyMaterials') {
    const { remoteSecretKeyMaterials } = event.data

    for (const [connectionId, remoteSecretKeyMaterial] of Object.entries(
      remoteSecretKeyMaterials as Record<string, RemoteSecretKeyMaterial>,
    )) {
      const { keyId, secretKeyMaterial } = remoteSecretKeyMaterial
      crypto.subtle
        .importKey('raw', secretKeyMaterial.buffer, 'HKDF', false, ['deriveBits', 'deriveKey'])
        .then((material) => {
          generateDeriveKey(material).then((deriveKey) => {
            setRemoteDeriveKey(connectionId, keyId, deriveKey)
          })

          generateWriteIV(material).then((writeIV) => {
            setWriteIV(connectionId, keyId, writeIV)
          })

          setLatestRemoteKeyId(connectionId, keyId)
        })
    }
  } else if (type === 'removeRemoteDeriveKey') {
    const { connectionId } = event.data
    removeDeriveKey(connectionId)
  } else if (type === 'encrypt') {
    const { readableStream, writableStream } = event.data
    const transformStream = new TransformStream({
      transform: encryptFunction,
    })
    readableStream.pipeThrough(transformStream).pipeTo(writableStream)
  } else if (type === 'decrypt') {
    const { readableStream, writableStream } = event.data
    const transformStream = new TransformStream({
      transform: decryptFunction,
    })
    readableStream.pipeThrough(transformStream).pipeTo(writableStream)
  } else if (type === 'clear') {
    countMap.clear()
    writeIVMap.clear()
    remoteDeriveKeyMap.clear()
    latestRemoteKeyIdMap.clear()
    selfDeriveKeyMap.clear()
  }
}
