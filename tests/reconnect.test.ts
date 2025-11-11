import { expect, test, vi } from 'vitest'

import { AutoReconnector } from '../src/reconnect'

const createCallbacks = () => {
  return {
    reconnect: vi.fn(),
    fireReconnecting: vi.fn(),
    fireReconnected: vi.fn(),
    fireReconnectError: vi.fn(),
    shouldContinue: vi.fn(() => true),
    handleReconnectAbort: vi.fn(),
  }
}

test('再接続成功時に fireReconnected が呼ばれる', async () => {
  const callbacks = createCallbacks()
  callbacks.reconnect.mockResolvedValueOnce(undefined)
  const now = vi.fn(() => 0)

  const reconnector = new AutoReconnector(callbacks, {
    maxAttempts: 3,
    reconnectDelay: 10,
    reconnectBackoff: 2,
    maxReconnectDelay: 40,
    now,
  })

  vi.useFakeTimers()
  reconnector.start()

  expect(callbacks.fireReconnecting).not.toHaveBeenCalled()

  await vi.runOnlyPendingTimersAsync()

  expect(callbacks.fireReconnecting).toHaveBeenCalledTimes(1)
  expect(callbacks.fireReconnecting).toHaveBeenLastCalledWith(
    expect.objectContaining({
      attempt: 1,
      maxAttempts: 3,
      delay: 10,
      lastError: undefined,
    }),
  )
  expect(callbacks.reconnect).toHaveBeenCalledTimes(1)
  expect(callbacks.fireReconnected).toHaveBeenCalledTimes(1)
  expect(callbacks.fireReconnectError).not.toHaveBeenCalled()

  vi.useRealTimers()
})

test('最大試行回数に達すると fireReconnectError が呼ばれる', async () => {
  const callbacks = createCallbacks()
  callbacks.reconnect.mockRejectedValue(new Error('failed'))
  const now = vi.fn(() => 1000)

  const reconnector = new AutoReconnector(callbacks, {
    maxAttempts: 2,
    reconnectDelay: 10,
    reconnectBackoff: 2,
    maxReconnectDelay: 40,
    now,
  })

  vi.useFakeTimers()
  reconnector.start()
  await vi.runOnlyPendingTimersAsync()
  await vi.runOnlyPendingTimersAsync()
  await vi.runOnlyPendingTimersAsync()

  expect(callbacks.reconnect).toHaveBeenCalledTimes(2)
  expect(callbacks.fireReconnectError).toHaveBeenCalledTimes(1)
  expect(callbacks.fireReconnectError).toHaveBeenCalledWith(
    expect.objectContaining({
      attempt: 2,
      lastError: 'failed',
    }),
  )
  expect(callbacks.fireReconnected).not.toHaveBeenCalled()

  vi.useRealTimers()
})

test('shouldContinue が false の場合再接続を停止する', async () => {
  const callbacks = createCallbacks()
  callbacks.reconnect.mockRejectedValue(new Error('failed'))
  callbacks.shouldContinue.mockReturnValueOnce(true).mockReturnValue(false)

  const reconnector = new AutoReconnector(callbacks, {
    maxAttempts: 5,
    reconnectDelay: 10,
    reconnectBackoff: 2,
    maxReconnectDelay: 40,
  })

  vi.useFakeTimers()
  reconnector.start()
  await vi.runOnlyPendingTimersAsync()
  await vi.runOnlyPendingTimersAsync()

  expect(callbacks.reconnect).toHaveBeenCalledTimes(1)
  expect(callbacks.fireReconnectError).not.toHaveBeenCalled()
  expect(callbacks.fireReconnected).not.toHaveBeenCalled()

  vi.useRealTimers()
})
