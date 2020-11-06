import fs from "fs";
import minify from "rollup-plugin-babel-minify";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";
import pkg from "./package.json";

const env = process.env.NODE_ENV || "development";
if (env === "development") {
  pkg.version += "-dev";
}
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
      file: "dist/sora_e2ee.js",
      format: "umd",
      name: "SoraE2EE",
      banner: banner,
    },
  },
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
      minify({
        comments: false,
      }),
    ],
    output: {
      sourcemap: true,
      file: "dist/sora_e2ee.min.js",
      format: "umd",
      name: "SoraE2EE",
      banner: banner,
    },
  },
];
