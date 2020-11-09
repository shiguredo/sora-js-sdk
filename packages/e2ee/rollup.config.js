import fs from "fs";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";
import pkg from "./package.json";

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;
const workerScript = fs.readFileSync("./_worker/sora_e2ee_worker.js", "base64");

export default [
  {
    input: "src/sora_e2ee.ts",
    plugins: [
      replace({
        SORA_E2EE_VERSION: `'${pkg.version}'`,
        WORKER_SCRIPT: workerScript,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
    output: {
      sourcemap: false,
      file: "dist/sora_e2ee.mjs",
      format: "module",
      name: "SoraE2EE",
      banner: banner,
    },
  },
];
