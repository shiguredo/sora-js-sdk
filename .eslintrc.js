module.exports = {
  "env": {
    "browser": true,
    "commonjs": true,
    "es6": true
  },
  "extends": ["eslint:recommended"],
  "installedESLint": true,
  "parser": "babel-eslint",
  "parserOptions": {
    "ecmaFeatures": {
      "experimentalObjectRestSpread": true,
      "jsx": true
    },
    "sourceType": "module"
  },
  "plugins": [
    "flowtype"
  ],
  "globals": {
    "process": true
  },
  "rules": {
    "indent": [
      "error",
      2,
      { "SwitchCase": 1 }
    ],
    "keyword-spacing": [
      "error",
      { "before": true, "after": true, "overrides": {} }
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "no-unused-vars": [
      "error",
      { "args": "all", "argsIgnorePattern": "^_" }
    ],
    "no-var": "error",
    "quotes": [
      "error",
      "single"
    ],
    "max-len": [
      "error",
      120,
      2
    ],
    "object-curly-spacing": [
      "error",
      "always"
    ],
    "semi": [
      "error",
      "always"
    ],
    "space-in-parens": ["error", "never"],
    "space-unary-ops": "error"
  }
};
