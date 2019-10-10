import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';
import pkg from './package.json';

const env = process.env.NODE_ENV || 'development';
if (env === 'development') {
  pkg.version += '-dev';
}
const banner = `
/*!
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 */
`;

export default [
  {
    input: 'src/sora.js',
    plugins: [
      replace({
        SORA_JS_SDK_VERSION: `'${pkg.version}'`
      }),
      babel({
        presets: ['@babel/preset-flow']
      })
    ],
    output: {
      sourcemap: false,
      file: 'dist/sora.js',
      format: 'umd',
      name: 'Sora',
      banner: banner
    }
  },
  {
    input: 'src/sora.js',
    plugins: [
      replace({
        SORA_JS_SDK_VERSION: `'${pkg.version}'`
      }),
      babel({
        presets: ['@babel/preset-flow', 'minify'],
        comments: false
      })
    ],
    output: {
      sourcemap: false,
      file: 'dist/sora.min.js',
      format: 'umd',
      name: 'Sora',
      banner: banner
    }
  }
];
