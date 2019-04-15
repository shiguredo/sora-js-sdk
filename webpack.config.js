/* global __dirname */

const path = require('path');
const webpack = require('webpack');
const pkg = require('./package.json');

const env = process.env.NODE_ENV || 'development';
let version = pkg.version;
if (env === 'development') {
  version += '-dev';
}
const banner = pkg.name + '\n' + pkg.description +
  '\n@version: ' + version + '\n@author: ' + pkg.author + '\n@license: ' + pkg.license;

module.exports = {
  context: path.resolve(__dirname, './src'),
  entry: {
    sora: './sora.js',
    'sora.min': './sora.js',
  },
  output: {
    library: 'Sora',
    libraryTarget: 'umd',
    umdNamedDefine: true,
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js',
  },
  plugins: [
    new webpack.BannerPlugin(banner),
    new webpack.DefinePlugin({
      'process.version': JSON.stringify(version),
    }),
    new webpack.optimize.UglifyJsPlugin({ include: /\.min\.js$/, minimize: true })
  ],
  module: {
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
  },
};
