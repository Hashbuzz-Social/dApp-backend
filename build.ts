import fs from "fs-extra";
import childProcess from "child_process";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

(async () => {
    try {
        // Define paths and filenames
        const distPath = "./dist/";
        const packageJson = await fs.readJson('./package.json');
        const version = packageJson.version;
        const logFileName = `build_${version}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        const logFilePath = path.join(distPath, logFileName);

        let existingKeys = [];

        await setupLogging();
        existingKeys = await handleKeys();

        // Remove current build
        await logAndExecute("Removing current build", remove, distPath);

        // Copy front-end files
        await logAndExecute("Copying front-end files", copy, "./src/public", path.join(distPath, "public"));
        await logAndExecute("Copying front-end views", copy, "./src/views", path.join(distPath, "views"));

        // Copy back-end files
        await logAndExecute("Compiling TypeScript files", exec, "tsc --build tsconfig.prod.json", "./");

        // Write existing keys if available
        if (existingKeys.length > 0) {
            const distKeytFolder = path.join("./dist", ".keys");
            const distKeyStoreFile = path.join("./dist", ".keys", "keyStore.json");
            // create file and folder and then write
            await logAndExecute("Creating .keys folder in dist", createFolder, distKeytFolder);
            await logAndExecute("Creating keyStore.json file in dist/.keys", createFile, distKeyStoreFile);
            await logAndExecute("Writing existing keys", writeExistingKeys, path.join(distPath, ".keys", "keyStore.json"), JSON.stringify(existingKeys, null, 2));
        }

        // Log the build
        await logBuild(logFilePath);

    } catch (err) {
        console.error("Build failed:", err);
    }
})();

// Functions
async function setupLogging() {
    const jetLoggerFolder = path.join("./", "logs");
    const jetLoggerFile = path.join(jetLoggerFolder, "jet-logger.log");

    await logAndExecute("Creating logs folder", createFolder, jetLoggerFolder);
    await logAndExecute("Creating jet-logger.log file", createFile, jetLoggerFile);
}

async function handleKeys() {
    const keysFolder = path.join("./", ".keys");
    const keysFile = path.join(keysFolder, "keyStore.json");
    const distKeyStoreFile = path.join("./dist/.keys", "keyStore.json");

    await logAndExecute("Creating .keys folder", createFolder, keysFolder);
    await logAndExecute("Creating keyStore.json file", createFile, keysFile);

    if (await fs.pathExists(distKeyStoreFile)) {
        const data = fs.readFileSync(distKeyStoreFile, "utf-8");
        if (data) {
            try {
                console.log("Existing keys found:", data);
                return JSON.parse(data);
            } catch (err) {
                console.error("Error parsing JSON data:", err);
            }
        } else {
            console.log("No existing keys found");
        }
    }
    return [];
}

function createFolder(folderPath: string): Promise<void> {
    if (fs.pathExistsSync(folderPath)) {
        return Promise.resolve();
    }
    return fs.mkdir(folderPath);
}

function createFile(filePath: string): Promise<void> {
    if (fs.pathExistsSync(filePath)) {
        return Promise.resolve();
    }
    return fs.writeFile(filePath, '');
}

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

async function writeExistingKeys(filePath: string, data: string): Promise<void> {
    console.log("Writing existing keys to file");
    // await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    fs.writeFileSync(filePath, data, "utf-8");
}

async function logAndExecute(description: string, fn: Function, ...args: any[]) {
    console.info(description);
    try {
        await fn(...args);
    } catch (err) {
        console.error(`Error during ${description.toLowerCase()}:`, err);
        throw err;
    }
}
