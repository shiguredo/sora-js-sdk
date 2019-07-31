import babel from 'rollup-plugin-babel';
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
      babel({
        presets: ['@babel/preset-flow']
      })
    ],
    output: {
      sourcemap: false,
      file: 'dist/sora.js',
      format: 'umd',
      name: 'Sora',
      banner: banner,
      intro: `const VERSION = '${pkg.version}';`
    }
  },
  {
    input: 'src/sora.js',
    plugins: [
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
      banner: banner,
      intro: `const VERSION = '${pkg.version}';`
    }
  }
];
