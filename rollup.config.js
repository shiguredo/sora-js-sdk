import minify from 'rollup-plugin-babel-minify';
import typescript from 'rollup-plugin-typescript2';
import replace from '@rollup/plugin-replace';
import pkg from './package.json';

const env = process.env.NODE_ENV || 'development';
if (env === 'development') {
  pkg.version += '-dev';
}
const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;

export default [
  {
    input: 'src/sora.ts',
    plugins: [
      replace({
        SORA_JS_SDK_VERSION: `'${pkg.version}'`
      }),
      typescript({
        tsconfig: './tsconfig.json'
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
    input: 'src/sora.ts',
    plugins: [
      replace({
        SORA_JS_SDK_VERSION: `'${pkg.version}'`
      }),
      typescript({
        tsconfig: './tsconfig.json'
      }),
      minify({
        comments: false
      })
    ],
    output: {
      sourcemap: true,
      file: 'dist/sora.min.js',
      format: 'umd',
      name: 'Sora',
      banner: banner
    }
  }
];
