import { expect, test } from 'vitest'
import { checkVersionSupport, isVersionGreaterThanOrEqual } from '../e2e-tests/tests/helper'

test('isVersionGreaterThanOrEqual: メジャーバージョンが新しい場合はtrueを返す', () => {
  expect(isVersionGreaterThanOrEqual('2025.1.0', '2024.1.0')).toBe(true)
})

test('isVersionGreaterThanOrEqual: メジャーバージョンが古い場合はfalseを返す', () => {
  expect(isVersionGreaterThanOrEqual('2024.1.0', '2025.1.0')).toBe(false)
})

test('isVersionGreaterThanOrEqual: メジャーバージョンが同じでマイナーバージョンが新しい場合はtrueを返す', () => {
  expect(isVersionGreaterThanOrEqual('2025.2.0', '2025.1.0')).toBe(true)
})

test('isVersionGreaterThanOrEqual: メジャーバージョンが同じでマイナーバージョンが古い場合はfalseを返す', () => {
  expect(isVersionGreaterThanOrEqual('2025.1.0', '2025.2.0')).toBe(false)
})

test('isVersionGreaterThanOrEqual: 完全に同じバージョンの場合はtrueを返す', () => {
  expect(isVersionGreaterThanOrEqual('2025.2.0', '2025.2.0')).toBe(true)
})

test('isVersionGreaterThanOrEqual: パッチバージョンが新しい場合はtrueを返す', () => {
  expect(isVersionGreaterThanOrEqual('2025.2.1', '2025.2.0')).toBe(true)
})

test('isVersionGreaterThanOrEqual: プレリリースバージョンを正しく処理する', () => {
  expect(isVersionGreaterThanOrEqual('2025.2.0-canary.1', '2025.2.0')).toBe(true)
})

test('checkVersionSupport: バージョンがnullの場合はサポートされていないと判定する', () => {
  const result = checkVersionSupport(null, {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(false)
  expect(result.skipReason).toBe('Sora JS SDK version not found')
})

test('checkVersionSupport: バージョンがパースできない場合はサポートされていないと判定する', () => {
  const result = checkVersionSupport('invalid-version', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(false)
  expect(result.skipReason).toBe('Cannot parse Sora JS SDK version: invalid-version')
})

test('checkVersionSupport: メジャーバージョンが古い場合はサポートされていないと判定する', () => {
  const result = checkVersionSupport('2024.3.0', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(false)
  expect(result.skipReason).toBe(
    'Sora JS SDK version 2024.3.0 is older than 2025.2 (Test Feature support required)',
  )
  expect(result.version).toBe('2024.3.0')
})

test('checkVersionSupport: メジャーバージョンが同じでマイナーバージョンが古い場合はサポートされていないと判定する', () => {
  const result = checkVersionSupport('2025.1.0', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(false)
  expect(result.skipReason).toBe(
    'Sora JS SDK version 2025.1.0 is older than 2025.2 (Test Feature support required)',
  )
})

test('checkVersionSupport: 要求バージョン以上の場合はサポートされていると判定する', () => {
  const result = checkVersionSupport('2025.2.0', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(true)
  expect(result.version).toBe('2025.2.0')
  expect(result.skipReason).toBeUndefined()
})

test('checkVersionSupport: 要求バージョンより新しい場合はサポートされていると判定する', () => {
  const result = checkVersionSupport('2025.3.0', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'Test Feature',
  })
  expect(result.isSupported).toBe(true)
  expect(result.version).toBe('2025.3.0')
})

test('checkVersionSupport: プレリリースバージョンを正しく処理する', () => {
  const result = checkVersionSupport('2025.2.0-canary.0', {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'RPC',
  })
  expect(result.isSupported).toBe(true)
  expect(result.version).toBe('2025.2.0-canary.0')
})