// バージョン比較用のヘルパー関数を追加
export const isVersionGreaterThanOrEqual = (packageVersion: string, version: string): boolean => {
  const v1Parts = packageVersion.split('.').map(Number)
  const v2Parts = version.split('.').map(Number)

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1 = v1Parts[i] || 0
    const v2 = v2Parts[i] || 0
    if (v1 > v2) return true
    if (v1 < v2) return false
  }
  return true
}

import type { Page } from '@playwright/test'

export interface VersionRequirement {
  majorVersion: number
  minorVersion: number
  featureName: string
}

// Playwrightに依存しない純粋な関数
export function checkVersionSupport(
  version: string | null,
  requirement: VersionRequirement,
): { isSupported: boolean; skipReason?: string; version?: string } {
  if (!version) {
    return {
      isSupported: false,
      skipReason: 'Sora JS SDK version not found',
    }
  }

  const versionMatch = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!versionMatch) {
    return {
      isSupported: false,
      skipReason: `Cannot parse Sora JS SDK version: ${version}`,
    }
  }

  const majorVersion = Number.parseInt(versionMatch[1], 10)
  const minorVersion = Number.parseInt(versionMatch[2], 10)

  if (
    majorVersion < requirement.majorVersion ||
    (majorVersion === requirement.majorVersion && minorVersion < requirement.minorVersion)
  ) {
    return {
      isSupported: false,
      skipReason: `Sora JS SDK version ${version} is older than ${requirement.majorVersion}.${requirement.minorVersion} (${requirement.featureName} support required)`,
      version,
    }
  }

  return { isSupported: true, version }
}

// Playwright用のラッパー関数
export async function checkSoraVersion(
  page: Page,
  requirement: VersionRequirement,
): Promise<{ isSupported: boolean; skipReason?: string; version?: string }> {
  await page.goto('http://localhost:9000/rpc/')

  const version = await page.evaluate(() => {
    // @ts-ignore
    return window.Sora ? window.Sora.version() : null
  })

  return checkVersionSupport(version, requirement)
}
