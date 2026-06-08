// 切断待機タイムアウトエラー
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
    this.name = "DisconnectWaitTimeoutError";
  }
}

// 内部エラー
export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
    this.name = "DisconnectInternalError";
  }
}

// DataChannel onerror によるエラー
export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
    this.name = "DisconnectDataChannelError";
  }
}
