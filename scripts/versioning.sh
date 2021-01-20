#!/bin/bash

version=`cat ./package.json | jq -r -c ".version"`

if [ $1 = "canary" ]; then
  if [[ ${version} =~ ^.*canary.*$ ]]; then
    npx lerna version prerelease --preid canary --no-git-tag-version --tag-version-prefix '';
  else
    npx lerna version preminor --preid canary --no-git-tag-version --tag-version-prefix '';
  fi
elif [ $1 = "major" ]; then
  npx lerna version major --no-git-tag-version --tag-version-prefix '';
elif [ $1 = "minor" ]; then
  npx lerna version minor --no-git-tag-version --tag-version-prefix '';
elif [ $1 = "patch" ]; then
  npx lerna version patch --no-git-tag-version --tag-version-prefix '';
fi

next_version=`cat ./lerna.json | jq -r -c ".version"`
npm version ${next_version} --git-tag-version false;
