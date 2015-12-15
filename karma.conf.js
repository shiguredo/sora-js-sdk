module.exports = function(config) {
  config.set({
    basePath: "",
    frameworks: ["mocha", "browserify"],
    files: [
      "test/**/*.spec.js"
    ],
    exclude: [
    ],
    preprocessors: {
      "test/**/*.spec.js": ["browserify"]
    },
    browserify: {
      debug: true,
      transform: [
        ["babelify", {plugins: ["babel-plugin-espower"]}]
      ]
    },
    reporters: ["progress"],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ["Chrome"],
    singleRun: false,
    concurrency: Infinity
  })
}
