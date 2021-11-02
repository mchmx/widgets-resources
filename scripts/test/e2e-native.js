const { execSync } = require("child_process");
const findFreePort = require("find-free-port");
const fetch = require("node-fetch");
const { join } = require("path");
const { cat, cp, ls, mkdir, rm } = require("shelljs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { createWriteStream } = require("fs");
const { tmpdir } = require("os");

main().catch(e => {
    console.error(e);
    process.exit(-1);
});

async function main() {
    const mendixVersion = await getMendixVersion();
    const ghcr = process.env.CI && process.env.FORKED !== "true" ? "ghcr.io/mendix/widgets-resources/" : "";

    const testArchivePath = await getTestProject("https://github.com/mendix/Native-Mobile-Resources", "main");
    try {
        mkdir("-p", "tests/testProject");
        execSync(`unzip -o ${testArchivePath} -d tests/testProject`);
        rm("-f", testArchivePath);
    } catch (e) {
        throw new Error("Failed to unzip the test project into tests/testProject", e.message);
    }

    const output = execSync("npx lerna list --json --since origin/master --loglevel silent --scope '*-native'");
    const packages = JSON.parse(output);

    execSync("npx lerna run release --since origin/master --scope '*-native'");

    packages.forEach(package => {
        cp(`${package.location}/dist/*.mpk`, "tests/testProject/widgets");
    });

    const existingImages = execSync(`docker image ls -q ${ghcr}mxbuild:${mendixVersion}`).toString().trim();
    if (!existingImages) {
        console.log(`Creating new mxbuild docker image...`);
        execSync(
            `docker build -f ${join(
                process.cwd(),
                "packages/tools/pluggable-widget-tools/scripts/mxbuild.Dockerfile"
            )}` +
                `--build-arg MENDIX_VERSION=${mendixVersion} ` +
                `-t mxbuild:${mendixVersion} ${__dirname}`,
            { stdio: "inherit" }
        );
    }

    if (ghcr) {
        console.log(`Pulling mxruntime docker image from Github Container Registry...`);
        execSync(`docker pull ${ghcr}mxruntime:${mendixVersion}`);
    }

    const existingRuntimeImages = execSync(`docker image ls -q ${ghcr}mxruntime:${mendixVersion}`).toString().trim();
    if (!existingRuntimeImages) {
        console.log(`Creating new runtime docker image...`);
        execSync(
            `docker build -f ${join(
                process.cwd(),
                "packages/tools/pluggable-widget-tools/scripts/runtime.Dockerfile"
            )} ` +
                `--build-arg MENDIX_VERSION=${mendixVersion} ` +
                `-t mxruntime:${mendixVersion} ${__dirname}`,
            { stdio: "inherit" }
        );
    }

    // Build testProject via mxbuild
    const projectFile = ls("tests/testProject/*.mpr").toString();
    execSync(
        `docker run -t -v ${process.cwd()}:/source ` +
            `--rm ${ghcr}mxbuild:${mendixVersion} bash -c "mx update-widgets --loose-version-check /source/${projectFile} && mxbuild ` +
            `-o /tmp/automation.mda /source/${projectFile}"`,
        { stdio: "inherit" }
    );
    console.log("Bundle created and all the widgets are updated");

    // Spin up the runtime and run testProject
    const freePort = await findFreePort(3000);
    const runtimeContainerId = execSync(
        `docker run -td -v ${process.cwd()}:/source -v ${__dirname}:/shared:ro -w /source -p ${freePort}:8080 ` +
            `-e MENDIX_VERSION=${mendixVersion} --entrypoint /bin/bash ` +
            `--rm ${ghcr}mxruntime:${mendixVersion} /shared/runtime.sh`
    )
        .toString()
        .trim();

    try {
        if (attempts === 0) {
            throw new Error("Runtime didn't start in time, existing now...");
        }
        console.log("Executing tests....");
    } catch (e) {
        try {
            execSync(`docker logs ${runtimeContainerId}`, { stdio: "inherit" });
        } catch (_) {}
        console.log(cat("results/runtime.log").toString());
        throw e;
    } finally {
        execSync(`docker rm -f ${runtimeContainerId}`);
        execSync(`docker rm -f ${browserContainerId}`);
    }
}

async function getTestProject(repository, branch) {
    const downloadedArchivePath = join(tmpdir(), `testProject.zip`);

    if (!repository.includes("github.com")) {
        throw new Error("githubUrl is not a valid github repository!");
    }

    try {
        await promisify(pipeline)(
            (await fetch(`${repository}/archive/refs/heads/${branch}.zip`)).body,
            createWriteStream(downloadedArchivePath)
        );
        return downloadedArchivePath;
    } catch (e) {
        console.log(`Url is not available :(`);
        rm("-f", downloadedArchivePath);
    }
    throw new Error("Cannot find test project in GitHub repository. Try again later.");
}

async function getMendixVersion() {
    const mendixOptionIndex = process.argv.indexOf("--mx-version");
    const targetMendixVersion = mendixOptionIndex >= 0 ? process.argv[mendixOptionIndex + 1] : undefined;
    let mendixVersion;

    if (process.env.MENDIX_VERSION) {
        return process.env.MENDIX_VERSION;
    }
    try {
        const mendixVersions = await fetch(
            "https://raw.githubusercontent.com/mendix/widgets-resources/master/configs/e2e/mendix-versions.json"
        );

        const mendixVersionsJson = await mendixVersions.json();

        if (targetMendixVersion && targetMendixVersion in mendixVersionsJson) {
            mendixVersion = mendixVersionsJson[targetMendixVersion];
        } else {
            mendixVersion = mendixVersionsJson.latest;
        }
    } catch (e) {
        throw new Error("Couldn't reach github.com. Make sure you are connected to internet.");
    }
    if (!mendixVersion) {
        throw new Error("Couldn't retrieve Mendix version from github.com. Try again later.");
    }

    return mendixVersion;
}
