#!/bin/bash

version=`cat ./package.json | jq -r -c ".version"`

if [[ ${version} =~ ^.*canary.*$ ]]; then
  npm version prerelease --preid canary --no-git-tag-version > /dev/null;
else
  npm version preminor --preid canary --no-git-tag-version > /dev/null;
fi

echo "==== sora-js-sdk@${version} $1 update ===="

next_version=`cat ./package.json | jq -r -c ".version"`

echo "Next version is '${next_version}'"
echo ""
read -p "Do you wish to run 'git commit -m \"${next_version}\"'? (y/n) " commit
case $commit in
  "" | "Y" | "y" | "yes" | "Yes" | "YES" )
    npm run build
    git add .
    git commit -m "${next_version}"
    ;;
  * ) exit 0;;
esac

echo ""
read -p "Do you wish to run 'git tag ${next_version}'? (y/n) " tag
case $tag in
  "" | "Y" | "y" | "yes" | "Yes" | "YES" )
    git tag ${next_version}
    ;;
  * ) exit 0;;
esac
