import argparse
import re
import subprocess
from typing import Optional


# ファイルを読み込み、バージョンを更新
def update_version(file_path: str, dry_run: bool) -> Optional[str]:
    with open(file_path, "r", encoding="utf-8") as f:
        content: str = f.read()

    # 現在のバージョンを取得
    current_version_match = re.search(r'"version"\s*:\s*"([\d\.\w-]+)"', content)
    if not current_version_match:
        raise ValueError("Version not found or incorrect format in package.json")

    current_version: str = current_version_match.group(1)

    # バージョンが -canary.X を持っている場合の更新
    if "-canary." in current_version:
        new_content, count = re.subn(
            r'("version"\s*:\s*")(\d+\.\d+\.\d+-canary\.)(\d+)',
            lambda m: f"{m.group(1)}{m.group(2)}{int(m.group(3)) + 1}",
            content,
        )
    else:
        # -canary.X がない場合、次のマイナーバージョンにして -canary.0 を追加
        new_content, count = re.subn(
            r'("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)',
            lambda m: f"{m.group(1)}{m.group(2)}.{int(m.group(3)) + 1}.0-canary.0",
            content,
        )

    if count == 0:
        raise ValueError("Version not found or incorrect format in package.json")

    # 新しいバージョンを確認
    new_version_match = re.search(r'"version"\s*:\s*"([\d\.\w-]+)"', new_content)
    if not new_version_match:
        raise ValueError("Failed to extract the new version after the update.")

    new_version: str = new_version_match.group(1)

    print(f"Current version: {current_version}")
    print(f"New version: {new_version}")
    confirmation: str = (
        input("Do you want to update the version? (Y/n): ").strip().lower()
    )

    if confirmation != "y":
        print("Version update canceled.")
        return None

    # Dry-run 時の動作
    if dry_run:
        print("Dry-run: Version would be updated to:")
        print(new_content)
    else:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Version updated in package.json to {new_version}")

    return new_version


# pnpm install & pnpm build 実行
def run_pnpm_operations(dry_run: bool) -> None:
    if dry_run:
        print("Dry-run: Would run 'pnpm run build'")
    else:
        subprocess.run(["pnpm", "run", "build"], check=True)
        print("pnpm run build executed")


# git コミット、タグ、プッシュを実行
def git_commit_version(new_version: str, dry_run: bool) -> None:
    if dry_run:
        print("Dry-run: Would run 'git add package.json'")
        print(f"Dry-run: Would run '[canary] Bump version to {new_version}'")
    else:
        subprocess.run(["git", "add", "package.json"], check=True)
        subprocess.run(
            ["git", "commit", "-m", f"[canary] Bump version to {new_version}"],
            check=True,
        )
        print(f"Version bumped and committed: {new_version}")


# git コミット、タグ、プッシュを実行
def git_operations_after_build(new_version: str, dry_run: bool) -> None:
    if dry_run:
        print("Dry-run: Would run 'git add dist/'")
        print(f"Dry-run: Would run '[canary] Add dist files for {new_version}'")
        print(f"Dry-run: Would run 'git tag {new_version}'")
        print("Dry-run: Would run 'git push'")
        print(f"Dry-run: Would run 'git push origin {new_version}'")
    else:
        subprocess.run(["git", "add", "dist/"], check=True)
        subprocess.run(
            ["git", "commit", "-m", f"[canary] Add dist files for {new_version}"],
            check=True,
        )
        subprocess.run(["git", "tag", new_version], check=True)
        subprocess.run(["git", "push"], check=True)
        subprocess.run(["git", "push", "origin", new_version], check=True)


# メイン処理
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update package.json version, run pnpm install, build, and commit changes."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode without making actual changes",
    )
    args = parser.parse_args()

    package_json_path: str = "package.json"

    # バージョン更新
    new_version: Optional[str] = update_version(package_json_path, args.dry_run)

    if not new_version:
        return  # ユーザーが確認をキャンセルした場合、処理を中断

    # バージョン更新後にまず git commit
    git_commit_version(new_version, args.dry_run)

    # pnpm install & build 実行
    run_pnpm_operations(args.dry_run)

    # ビルド後のファイルを git commit, タグ付け、プッシュ
    git_operations_after_build(new_version, args.dry_run)


if __name__ == "__main__":
    main()
