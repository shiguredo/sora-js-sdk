module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['mocha', 'browserify'],
    files: [
      'test/**/*.spec.js'
    ],
    exclude: [
    ],
    preprocessors: {
      'test/**/*.spec.js': ['browserify']
    },
    browserify: {
      debug: true,
      transform: [
        ['babelify', { presets: ['es2015'] }]
      ]
    },
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['Chrome'],
    singleRun: false,
    concurrency: Infinity
  });
};
