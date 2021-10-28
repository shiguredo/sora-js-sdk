#!/bin/bash

version=`cat ./package.json | jq -r -c ".version"`

if [ $1 = "canary" ]; then
  if [[ ${version} =~ ^.*canary.*$ ]]; then
    npm version prerelease --preid canary --no-git-tag-version;
  else
    npm version preminor --preid canary --no-git-tag-version;
  fi
elif [ $1 = "major" ]; then
  npm version major --no-git-tag-version --tag-version-prefix '';
elif [ $1 = "minor" ]; then
  npm version minor --no-git-tag-version --tag-version-prefix '';
elif [ $1 = "patch" ]; then
  npm version patch --no-git-tag-version --tag-version-prefix '';
fi

next_version=`cat ./package.json | jq -r -c ".version"`

echo "Next version is '${next_version}'"
read -p "Do you wish to git commit and tag this version? (y/n)" answer
echo $answer
case $answer in
  "" | "Y" | "y" | "yes" | "Yes" | "YES" )
    npm run build
    git add .
    git commit -m "${next_version}"
    git tag ${next_version}
    ;;
  * ) exit 0;;
esac
