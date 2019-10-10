module.exports = {
  presets: ['@babel/preset-flow'],
  env: {
    test: {
      presets: ['@babel/preset-env']
    }
  }
};
