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
  // sora-js-sdk-version要素が更新されるまで待つ
  await page.waitForSelector('#sora-js-sdk-version:not(:empty)', { timeout: 5000 })

  // バージョンをDOM要素から取得
  const version = await page.evaluate(() => {
    const versionElement = document.querySelector('#sora-js-sdk-version')
    return versionElement ? versionElement.textContent : null
  })

  return checkVersionSupport(version, requirement)
}
