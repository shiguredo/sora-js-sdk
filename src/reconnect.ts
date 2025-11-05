import type { ReconnectErrorEvent, ReconnectedEvent, ReconnectingEvent } from './types'

const DEFAULT_MAX_ATTEMPTS = 8
const DEFAULT_RECONNECT_DELAY = 1000
const DEFAULT_BACKOFF = 2.0
const DEFAULT_MAX_DELAY = 30000

// 自動再接続処理を管理するクラス
export class AutoReconnector {
  // ConnectionBase から受け取るコールバック群
  private readonly callbacks: Callbacks
  // 最大試行回数
  private readonly maxAttempts: number
  // 初期遅延
  private readonly baseDelay: number
  // 指数バックオフの係数
  private readonly backoff: number
  // 遅延の上限
  private readonly maxDelay: number
  // 時刻を取得する関数（テストしやすくするため差し替え可能）
  private readonly now: () => number
  // 現在の試行回数
  private attempt = 0
  // 待機用タイマー ID
  private timerId: number | null = null
  // 直近のエラーメッセージ
  private lastError: string | undefined
  // 再接続を開始した時刻
  private readonly startedAt: number
  // 再接続処理が有効かどうか
  private active = false

  constructor(
    callbacks: Callbacks,
    options?: {
      maxAttempts?: number
      reconnectDelay?: number
      reconnectBackoff?: number
      maxReconnectDelay?: number
      now?: () => number
    },
  ) {
    this.callbacks = callbacks
    this.maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.baseDelay = options?.reconnectDelay ?? DEFAULT_RECONNECT_DELAY
    this.backoff = options?.reconnectBackoff ?? DEFAULT_BACKOFF
    this.maxDelay = options?.maxReconnectDelay ?? DEFAULT_MAX_DELAY
    this.now = options?.now ?? Date.now
    this.startedAt = this.now()
  }

  start(): void {
    // 多重起動は無視する
    if (this.active) {
      return
    }
    this.active = true
    this.scheduleNext(0)
  }

  stop(): void {
    // 再接続処理を停止してタイマーを解除する
    this.active = false
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  setLastError(error?: string): void {
    this.lastError = error
  }

  private scheduleNext(delay: number): void {
    if (!this.active) {
      return
    }
    this.timerId = setTimeout(() => this.tryReconnect(), delay)
  }

  private async tryReconnect(): Promise<void> {
    // stop された場合は処理しない
    if (!this.active) {
      return
    }
    if (!this.callbacks.shouldContinue()) {
      this.stop()
      return
    }
    this.attempt += 1
    const delay = this.computeDelay(this.attempt)
    const reconnectingEvent = this.createReconnectingEvent(delay)
    this.callbacks.fireReconnecting(reconnectingEvent)
    try {
      await this.callbacks.reconnect(this.attempt)
      const reconnectedEvent = this.createReconnectedEvent()
      this.callbacks.fireReconnected(reconnectedEvent)
      this.stop()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      if (!this.callbacks.shouldContinue()) {
        // 再接続継続不可の判定が入った場合はここで終了する
        this.stop()
        return
      }
      if (this.attempt >= this.maxAttempts) {
        const event = this.createReconnectErrorEvent()
        this.callbacks.fireReconnectError(event)
        this.stop()
        return
      }
      const nextDelay = this.computeDelay(this.attempt + 1)
      this.scheduleNext(nextDelay)
    }
  }

  private computeDelay(attempt: number): number {
    if (attempt <= 1) {
      return this.baseDelay
    }
    const delay = this.baseDelay * this.backoff ** (attempt - 1)
    return Math.min(delay, this.maxDelay)
  }

  private createReconnectingEvent(delay: number): ReconnectingEvent {
    return {
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
      delay,
      lastError: this.lastError,
    } as ReconnectingEvent
  }

  private createReconnectedEvent(): ReconnectedEvent {
    const totalDelay = this.now() - this.startedAt
    return {
      attempt: this.attempt,
      totalDelay,
    } as ReconnectedEvent
  }

  private createReconnectErrorEvent(): ReconnectErrorEvent {
    return {
      attempt: this.attempt,
      lastError: this.lastError,
    } as ReconnectErrorEvent
  }
}

type Callbacks = {
  // 再接続試行ごとに呼び出す
  reconnect: (attempt: number) => Promise<void>
  // 再接続を開始する際に通知する
  fireReconnecting: (event: ReconnectingEvent) => void
  // 再接続に成功した際に通知する
  fireReconnected: (event: ReconnectedEvent) => void
  // 再接続に失敗し、これ以上試行しない場合に通知する
  fireReconnectError: (event: ReconnectErrorEvent) => void
  // 再接続を続けてよいかどうか判定する。false の場合試行を終了する
  shouldContinue: () => boolean
  // MediaStream など再接続不可条件を検知した際に呼び出す
  handleReconnectAbort: () => void
}
