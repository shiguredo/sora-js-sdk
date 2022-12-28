import fs from "fs";
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import pkg from '../../package.json';

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;
const lyraWorkerScript = fs.readFileSync("./_worker/lyra_worker.js", "base64");

export default [
  {
    input: 'src/sora.ts',
    plugins: [
      replace({
        __SORA_JS_SDK_VERSION__: pkg.version,
        __LYRA_WORKER_SCRIPT__: lyraWorkerScript,
        preventAssignment: true
      }),
      resolve(),
      typescript({
        tsconfig: './tsconfig.json'
      }),
      commonjs(),
    ],
    output: {
      sourcemap: false,
      file: '../../dist/sora.js',
      format: 'umd',
      name: 'Sora',
      banner: banner
    }
  },
  {
    input: 'src/sora.ts',
    plugins: [
      replace({
        __SORA_JS_SDK_VERSION__: pkg.version,
        __LYRA_WORKER_SCRIPT__: lyraWorkerScript,
        preventAssignment: true
      }),
      resolve(),
      typescript({
        tsconfig: './tsconfig.json'
      }),
      commonjs(),
    ],
    output: {
      sourcemap: false,
      file: '../../dist/sora.mjs',
      format: 'module',
      name: 'Sora',
      banner: banner
    }
  }
];
