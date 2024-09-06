// 切断待機タイムアウトエラー
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super('Disconnect wait timeout')
  }
}
