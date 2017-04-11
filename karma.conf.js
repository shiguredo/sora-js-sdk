module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['mocha'],
    files: [
      'test/**/*.spec.js'
    ],
    exclude: [
    ],
    preprocessors: {
      'test/**/*.spec.js': ['webpack']
    },
    reporters: ['progress'],
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
    concurrency: Infinity,
    webpackMiddleware: {
      stats: 'errors-only'
    },
    webpack: {
      devtool: 'inline-source-map',
      module: {
        exprContextCritical: false,
        rules: [
          {
            test: /\.js$/,
            exclude: [/node_modules/],
            use: [{
              loader: 'babel-loader',
              options: { presets: ['es2015'],  plugins: ['transform-flow-strip-types'] }
            }],
          },
        ],
      }
    }
  });
};
