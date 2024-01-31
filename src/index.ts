import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as utils from "./utils";

const Input_Key = "key"; // unused
const Input_Path = "path";
const Input_Cache = "cache";
const Input_FailOnCacheMiss = "fail-on-cache-miss";
const Output_CacheHit = "cache-hit";
const ActionVersion = "nscloud-action-cache@v1";

void main();

async function main() {
  const localCachePath = process.env[utils.Env_CacheRoot];
  if (localCachePath == null) {
    throw new Error(
      "Local cache not found. Did you configure the runs-on labels to enable Namespace cross-invocation cache?"
    );
  }
  core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);

  const cachePaths = await resolveCachePaths(localCachePath);
  const cacheMisses = await restoreLocalCache(cachePaths);

  const fullHit = cacheMisses.length === 0;
  core.setOutput(Output_CacheHit, fullHit.toString());

  if (!fullHit) {
    core.warning(`Some cache paths missing: ${cacheMisses}.`);

    const failOnCacheMiss = core.getBooleanInput(Input_FailOnCacheMiss);
    if (failOnCacheMiss) {
      throw new Error(`Some cache paths missing: ${cacheMisses}.`);
    }
  } else {
    core.info("All cache paths found and restored.");
  }

  // Write/update cache volume metadata file
  const metadata = await utils.ensureCacheMetadata(localCachePath);
  metadata.updatedAt = new Date().toISOString();
  metadata.version = 1;
  if (!metadata.userRequest) {
    metadata.userRequest = {};
  }

  for (const p of cachePaths) {
    metadata.userRequest[p.pathInCache] = {
      cacheFramework: p.framework,
      mountTarget: [p.mountTarget],
      source: ActionVersion,
    };
  }
  utils.writeCacheMetadata(localCachePath, metadata);
  // Save the list of cache paths to actions state for the post-cache action
  core.saveState(utils.StatePathsKey, cachePaths);

  const cacheUtilInfo = await getCacheSummaryUtil(localCachePath);
  core.info(
    `Total available cache space is ${cacheUtilInfo.size}, and ${cacheUtilInfo.used} have been used.`
  );
}

export async function restoreLocalCache(
  cachePaths: utils.CachePath[]
): Promise<string[]> {
  const cacheMisses: string[] = [];

  for (const p of cachePaths) {
    if (!fs.existsSync(p.pathInCache)) {
      cacheMisses.push(p.mountTarget);
    }

    if (p.wipe) {
      await io.rmRF(p.pathInCache);
    }

    const expandedFilePath = utils.resolveHome(p.mountTarget);
    await io.mkdirP(expandedFilePath);
    await io.mkdirP(p.pathInCache);
    await exec.exec(`sudo mount --bind ${p.pathInCache} ${expandedFilePath}`);
  }

  return cacheMisses;
}

async function resolveCachePaths(
  localCachePath: string
): Promise<utils.CachePath[]> {
  const paths: utils.CachePath[] = [];

  const manual: string[] = core.getMultilineInput(Input_Path);
  for (const p of manual) {
    paths.push({ mountTarget: p, framework: "custom" });
  }

  const cacheModes: string[] = core.getMultilineInput(Input_Cache);
  for (const mode of cacheModes) {
    paths.push(...(await resolveCacheMode(mode)));
  }

  for (const p of paths) {
    const expandedFilePath = utils.resolveHome(p.mountTarget);
    const fileCachedPath = path.join(localCachePath, expandedFilePath);
    p.pathInCache = fileCachedPath;
  }

  return paths;
}

async function resolveCacheMode(cacheMode: string): Promise<utils.CachePath[]> {
  switch (cacheMode) {
    case "go": {
      const goCache = await getExecStdout("go env GOCACHE");
      const goModCache = await getExecStdout("go env GOMODCACHE");
      return [
        { mountTarget: goCache, framework: cacheMode },
        { mountTarget: goModCache, framework: cacheMode },
      ];
    }

    case "yarn": {
      const yarnVersion = await getExecStdout("yarn --version");
      const yarnCache = yarnVersion.startsWith("1.")
        ? await getExecStdout("yarn cache dir")
        : await getExecStdout("yarn config get cacheFolder");
      return [{ mountTarget: yarnCache, framework: cacheMode }];
    }

    case "python": {
      const pipCache = await getExecStdout("pip cache dir");
      return [{ mountTarget: pipCache, framework: cacheMode }];
    }

    case "pnpm": {
      const pnpmCache = await getExecStdout("pnpm store path");
      const paths: utils.CachePath[] = [
        { mountTarget: pnpmCache, framework: cacheMode },
      ];

      const json = await getExecStdout("pnpm m ls --depth -1 --json");
      const jsonMultiParse = require("json-multi-parse");
      const parsed = jsonMultiParse(json);

      for (const list of parsed) {
        for (const entry of list) {
          if (entry.path) {
            paths.push({
              mountTarget: `${entry.path}/node_modules`,
              wipe: true,
              framework: cacheMode,
            });
          }
        }
      }

      return paths;
    }

    case "rust":
      // Do not cache the whole ~/.cargo dir as it contains ~/.cargo/bin, where the cargo binary lives
      return [
        { mountTarget: "~/.cargo/registry", framework: cacheMode },
        { mountTarget: "~/.cargo/git", framework: cacheMode },
        { mountTarget: "./target", framework: cacheMode },
        // Cache cleaning feature uses SQLite file https://blog.rust-lang.org/2023/12/11/cargo-cache-cleaning.html
        { mountTarget: "~/.cargo/.global-cache", framework: cacheMode },
      ];

    case "gradle":
      return [
        { mountTarget: "~/.gradle/caches", framework: cacheMode },
        { mountTarget: "~/.gradle/wrapper", framework: cacheMode },
      ];

    case "maven":
      return [{ mountTarget: "~/.m2/repository", framework: cacheMode }];

    default:
      core.warning(`Unknown cache option: ${cacheMode}.`);
      return [];
  }
}

async function getExecStdout(cmd: string): Promise<string> {
  const { stdout } = await exec.getExecOutput(cmd, [], {
    silent: true,
  });

  return stdout.trim();
}

type CacheSummaryUtil = {
  size: string;
  used: string;
};

async function getCacheSummaryUtil(
  cachePath: string
): Promise<CacheSummaryUtil> {
  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "df -h ${cachePath} | awk 'FNR == 2 {print $2,$3}'"`,
    [],
    {
      silent: true,
      ignoreReturnCode: true,
    }
  );
  const cacheUtilData = stdout.trim().split(" ");

  return {
    size: cacheUtilData[0],
    used: cacheUtilData[1],
  };
}
