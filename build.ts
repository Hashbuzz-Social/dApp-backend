/**
 * Remove old files, copy front-end ones.
 */

import fs from "fs-extra";
import logger from "jet-logger";
import childProcess from "child_process";
import dotenv from "dotenv";

dotenv.config();

(async () => {
  try {
    // Remove current build
    await remove("./dist/");
    // Copy front-end files
    await copy("./src/public", "./dist/public");
    await copy("./src/views", "./dist/views");
    await copy("./contractBuild/Hashbuzz.bin" , "./dist/contractBuild/Hashbuzz.bin")
    await copy("./contractBuild/Hashbuzz.abi" , "./dist/contractBuild/Hashbuzz.abi")
    // Copy production env file
    // if (process.env.NODE_ENV !== "docker") {
    //   await copy(".env", "./dist/.env");
    // }
    // Copy back-end files
    await exec("tsc --build tsconfig.prod.json", "./");
  } catch (err) {
    logger.err(err);
  }
})();

function remove(loc: string): Promise<void> {
  return new Promise((res, rej) => {
    return fs.remove(loc, (err) => {
      return !!err ? rej(err) : res();
    });
  });
}

function copy(src: string, dest: string): Promise<void> {
  return new Promise((res, rej) => {
    return fs.copy(src, dest, (err) => {
      return !!err ? rej(err) : res();
    });
  });
}

function exec(cmd: string, loc: string): Promise<void> {
  return new Promise((res, rej) => {
    return childProcess.exec(cmd, { cwd: loc }, (err, stdout, stderr) => {
      if (!!stdout) {
        logger.info(stdout);
      }
      if (!!stderr) {
        logger.warn(stderr);
      }
      return !!err ? rej(err) : res();
    });
  });
}
