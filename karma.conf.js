const babel = require('rollup-plugin-babel');
const pkg = require('./package.json');

const env = process.env.NODE_ENV || 'development';
if (env === 'development') {
  pkg.version += '-dev';
}

module.exports = function(config) {
  config.set({
    files: ['test/**/*.spec.js'],
    frameworks: ['mocha', 'chai'],
    preprocessors: {
      'test/**/*.spec.js': ['rollup']
    },
    rollupPreprocessor: {
      plugins: [
        babel({
          presets: ['@babel/preset-flow'],
          comments: false
        })
      ],
      output: {
        format: 'iife',
        name: 'sora',
        sourcemap: 'inline',
        intro: `const VERSION = '${pkg.version}';`
      }
    },
    reporters: ['progress'],
    mochaReporter: {
      showDiff: true
    },
    port: 9876,
    colors: true,
    logLevel: config.LOG_WARN,
    autoWatch: true,
    customLaunchers: {
      chrome_without_security: {
        base: 'Chrome',
        flags: [
          '--disable-user-media-security',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream'
        ],
        displayName: 'Chrome w/o security'
      }
    },
    browsers: ['chrome_without_security'],
    singleRun: false,
    concurrency: Infinity
  });
};
