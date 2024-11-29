import * as fs from 'node:fs'
import * as path from 'node:path'

const getPackageVersion = (): string => {
  const packageJsonPath = path.resolve(__dirname, '../examples/package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return packageJson.dependencies['sora-js-sdk'].replace('^', '')
}

// バージョン比較用のヘルパー関数を追加
export const isVersionGreaterThanOrEqual = (version: string): boolean => {
  const packageVersion = getPackageVersion()

  const v1Parts = packageVersion.split('.').map(Number)
  const v2Parts = version.split('.').map(Number)

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1 = v1Parts[i] || 0
    const v2 = v2Parts[i] || 0
    if (v1 < v2) return true
    if (v1 > v2) return false
  }
  return true
}
