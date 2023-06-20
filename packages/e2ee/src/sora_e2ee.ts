import WasmExec from '@sora/go-wasm'

type PreKeyBundle = {
  identityKey: string
  signedPreKey: string
  preKeySignature: string
}

type RemoteSecretKeyMaterial = {
  keyId: number
  secretKeyMaterial: Uint8Array
}

type ReceiveMessageResult = {
  remoteSecretKeyMaterials: Record<string, RemoteSecretKeyMaterial>
  messages: Uint8Array[]
}

type StartResult = {
  selfKeyId: number
  selfSecretKeyMaterial: Uint8Array
}

type StartSessionResult = {
  selfConnectionId: string
  selfKeyId: number
  selfSecretKeyMaterial: Uint8Array
  remoteSecretKeyMaterials: Record<string, RemoteSecretKeyMaterial>
  messages: Uint8Array[]
}

type StopSessionResult = {
  selfConnectionId: string
  selfKeyId: number
  selfSecretKeyMaterial: Uint8Array
  messages: Uint8Array[]
}

interface E2EE {
  init(): Promise<{ preKeyBundle: PreKeyBundle }>
  addPreKeyBundle(
    connectionId: string,
    identityKey: string,
    signedPreKey: string,
    preKeySignature: string,
  ): Error | null
  receiveMessage(message: Uint8Array): [ReceiveMessageResult, Error | null]
  remoteFingerprints(): Record<string, string>
  selfFingerprint(): string
  start(selfConnectionId: string): [StartResult, Error | null]
  startSession(
    connectionId: string,
    identityKey: string,
    signedPreKey: string,
    preKeySignature: string,
  ): [StartSessionResult, Error | null]
  stopSession(connectionId: string): [StopSessionResult, Error | null]
  version(): string
}

declare class Go {
  importObject: {
    go: Record<string, () => void>
  }
  run(instance: unknown): Promise<void>
}

interface E2EEWindow extends Window {
  Go: Go
  e2ee: E2EE
}
declare let window: E2EEWindow

const WORKER_SCRIPT = '__WORKER_SCRIPT__'

class SoraE2EE {
  worker: Worker | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onWorkerDisconnect: (() => any) | null

  constructor() {
    // 対応しているかどうかの判断
    // @ts-ignore トライアル段階の API なので無視する
    const supportsInsertableStreams = !!RTCRtpSender.prototype.createEncodedStreams
    if (!supportsInsertableStreams) {
      throw new Error('E2EE is not supported in this browser.')
    }
    this.worker = null
    this.onWorkerDisconnect = null
  }
  // worker を起動する
  startWorker(): void {
    // ワーカーを起動する
    const workerScript = atob(WORKER_SCRIPT)
    this.worker = new Worker(
      URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' })),
    )
    this.worker.onmessage = (event): void => {
      const { operation } = event.data
      if (operation === 'disconnect' && typeof this.onWorkerDisconnect === 'function') {
        this.onWorkerDisconnect()
      }
    }
  }
  // worker の掃除をする
  clearWorker(): void {
    if (this.worker) {
      this.worker.postMessage({
        type: 'clear',
      })
    }
  }
  // worker を終了する
  terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate()
    }
  }
  // 初期化処理
  async init(): Promise<PreKeyBundle> {
    const { preKeyBundle } = await window.e2ee.init()
    return preKeyBundle
  }

  setupSenderTransform(readableStream: ReadableStream, writableStream: WritableStream): void {
    if (!this.worker) {
      throw new Error('Worker is null. Call startWorker in advance.')
    }
    const message = {
      type: 'encrypt',
      readableStream: readableStream,
      writableStream: writableStream,
    }
    this.worker.postMessage(message, [readableStream, writableStream])
  }

  setupReceiverTransform(readableStream: ReadableStream, writableStream: WritableStream): void {
    if (!this.worker) {
      throw new Error('Worker is null. Call startWorker in advance.')
    }
    const message = {
      type: 'decrypt',
      readableStream: readableStream,
      writableStream: writableStream,
    }
    this.worker.postMessage(message, [readableStream, writableStream])
  }

  postRemoteSecretKeyMaterials(result: ReceiveMessageResult): void {
    if (!this.worker) {
      throw new Error('Worker is null. Call startWorker in advance.')
    }
    this.worker.postMessage({
      type: 'remoteSecretKeyMaterials',
      remoteSecretKeyMaterials: result.remoteSecretKeyMaterials,
    })
  }

  postRemoveRemoteDeriveKey(connectionId: string): void {
    if (!this.worker) {
      throw new Error('Worker is null. Call startWorker in advance.')
    }
    this.worker.postMessage({
      type: 'removeRemoteDeriveKey',
      connectionId: connectionId,
    })
  }

  postSelfSecretKeyMaterial(
    selfConnectionId: string,
    selfKeyId: number,
    selfSecretKeyMaterial: Uint8Array,
    waitingTime = 0,
  ): void {
    if (!this.worker) {
      throw new Error('Worker is null. Call startWorker in advance.')
    }
    this.worker.postMessage({
      type: 'selfSecretKeyMaterial',
      selfConnectionId: selfConnectionId,
      selfKeyId: selfKeyId,
      selfSecretKeyMaterial: selfSecretKeyMaterial,
      waitingTime: waitingTime,
    })
  }

  startSession(connectionId: string, preKeyBundle: PreKeyBundle): StartSessionResult {
    const [result, err] = window.e2ee.startSession(
      connectionId,
      preKeyBundle.identityKey,
      preKeyBundle.signedPreKey,
      preKeyBundle.preKeySignature,
    )
    if (err) {
      throw err
    }
    return result
  }

  stopSession(connectionId: string): StopSessionResult {
    const [result, err] = window.e2ee.stopSession(connectionId)
    if (err) {
      throw err
    }
    return result
  }

  receiveMessage(message: Uint8Array): ReceiveMessageResult {
    const [result, err] = window.e2ee.receiveMessage(message)
    if (err) {
      throw err
    }
    return result
  }

  start(selfConnectionId: string): StartResult {
    const [result, err] = window.e2ee.start(selfConnectionId)
    if (err) {
      throw err
    }
    return result
  }

  addPreKeyBundle(connectionId: string, preKeyBundle: PreKeyBundle): void {
    const err = window.e2ee.addPreKeyBundle(
      connectionId,
      preKeyBundle.identityKey,
      preKeyBundle.signedPreKey,
      preKeyBundle.preKeySignature,
    )
    if (err) {
      throw err
    }
  }

  selfFingerprint(): string {
    return window.e2ee.selfFingerprint()
  }

  remoteFingerprints(): Record<string, string> {
    return window.e2ee.remoteFingerprints()
  }

  static async loadWasm(wasmUrl: string): Promise<void> {
    if (!window.e2ee === undefined) {
      console.warn('E2ee wasm is already loaded. Will not be reload.')
      return
    }
    WasmExec()
    if (!window.Go) {
      throw new Error(`Failed to load module Go. window.Go is ${window.Go}.`)
    }
    const go = new Go()
    const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject)
    go.run(instance)
    if (!window.e2ee) {
      throw new Error(`Failed to load module e2ee. window.e2ee is ${window.e2ee}.`)
    }
  }

  static version(): string {
    return '__SORA_E2EE_VERSION__'
  }

  static wasmVersion(): string {
    return window.e2ee.version()
  }
}

export default SoraE2EE
