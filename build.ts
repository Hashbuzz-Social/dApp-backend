/**
 * Remove old files, copy front-end ones, and log the build.
 */

import fs from "fs-extra";
import childProcess from "child_process";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

(async () => {
    try {
        const distPath = "./dist/";
        const packageJson = await fs.readJson('./package.json');
        const version = packageJson.version;
        const logFileName = `build_${version}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        const logFilePath = path.join(distPath, logFileName);

        //check for jetlogger folder and file   
        const jetLoggerFolder = path.join("./", "logs");
        const jetLoggerFile = path.join("./logs", "jet-logger.log");

        if (!await fs.pathExists(jetLoggerFolder)) {
            console.info("Creating logs folder");
            await fs.mkdir(jetLoggerFolder);
        }

        if (!await fs.pathExists(jetLoggerFile)) {
            console.info("Creating jet-logger.log file");
            await fs.writeFile(jetLoggerFile, '');
        }


        // check for .keys folder and file keystore.json create it
        const keysFolder = path.join("./", ".keys");
        const keysFile = path.join("./.keys", "keyStore.json");

        if (!await fs.pathExists(keysFolder)) {
            console.info("Creating .keys folder");
            await fs.mkdir(keysFolder);
        }

        if (!await fs.pathExists(keysFile)) {
            console.info("Creating keystore.json file");
            await fs.writeFile(keysFile, '');
        }

        // Remove current build
        await remove(distPath);
        // Copy front-end files
        await copy("./src/public", path.join(distPath, "public"));
        await copy("./src/views", path.join(distPath, "views"));
        // await copy("./contractBuild/Hashbuzz.bin", path.join(distPath, "contractBuild/Hashbuzz.bin"));
        // await copy("./contractBuild/Hashbuzz.abi", path.join(distPath, "contractBuild/Hashbuzz.abi"));
        // Copy back-end files
        await exec("tsc --build tsconfig.prod.json", "./");

        // Log the build
        await logBuild(logFilePath);
    } catch (err) {
        console.error(err);
    }
})();

function remove(loc: string): Promise<void> {
    return fs.remove(loc);
}

function copy(src: string, dest: string): Promise<void> {
    return fs.copy(src, dest);
}

function exec(cmd: string, loc: string): Promise<void> {
    return new Promise((res, rej) => {
        childProcess.exec(cmd, { cwd: loc }, (err, stdout, stderr) => {
            if (stdout) {
                console.info(stdout);
            }
            if (stderr) {
                console.warn(stderr);
            }
            return err ? rej(err) : res();
        });
    });
}

async function logBuild(logFilePath: string): Promise<void> {
    const logContent = `Build completed at ${new Date().toISOString()}`;
    await fs.outputFile(logFilePath, logContent);
    console.info(`Build log created at ${logFilePath}`);
}