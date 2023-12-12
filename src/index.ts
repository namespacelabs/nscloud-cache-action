import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as utils from "./utils.js";

const Env_CacheRoot = "NSC_CACHE_PATH";
const Input_Key = "key"; // unused
const Input_Path = "path";
const Input_Cache = "cache";
const Input_FailOnCacheMiss = "fail-on-cache-miss";
const Output_CacheHit = "cache-hit";

void main();

type Path = {
  path: string;
  wipe?: boolean;
};

async function main() {
  const cachePaths = await resolveCachePaths();
  const localCachePath = process.env[Env_CacheRoot];
  if (localCachePath == null) {
    throw new Error(
      `Local cache not found. Did you configure the runs-on labels to enable Namespace cross-invocation cache?`
    );
  }
  core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);

  const cacheMisses = await restoreLocalCache(localCachePath, cachePaths);

  const fullHit = cacheMisses.length === 0;
  core.setOutput(Output_CacheHit, fullHit.toString());

  if (!fullHit) {
    core.warning(`Some cache paths missing: ${cacheMisses}.`);

    const failOnCacheMiss = core.getBooleanInput(Input_FailOnCacheMiss);
    if (failOnCacheMiss) {
      throw new Error(`Some cache paths missing: ${cacheMisses}.`);
    }
  } else {
    core.info(`All cache paths found and restored.`);
  }

  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "df -h ${localCachePath} | awk 'FNR == 2 {print $2,$3}'"`,
    [],
    {
      silent: true,
      ignoreReturnCode: true,
    }
  );
  const cacheUtilData = stdout.trim().split(" ");
  core.info(
    `Total available cache space is ${cacheUtilData[0]}, and ${cacheUtilData[1]} have been used.`
  );
}

export async function restoreLocalCache(
  localCachePath: string,
  cachePath: Path[]
): Promise<string[]> {
  const cacheMisses: string[] = [];

  for (const p of cachePath) {
    const expandedFilePath = utils.resolveHome(p.path);
    const fileCachedPath = path.join(localCachePath, expandedFilePath);
    if (!fs.existsSync(fileCachedPath)) {
      cacheMisses.push(p.path);
    }

    if (p.wipe) {
      await io.rmRF(fileCachedPath);
    }

    await io.mkdirP(fileCachedPath);
    await io.mkdirP(expandedFilePath);
    await exec.exec(`sudo mount --bind ${fileCachedPath} ${expandedFilePath}`);
  }

  return cacheMisses;
}

async function resolveCachePaths(): Promise<Path[]> {
  const paths: Path[] = [];

  const manual: string[] = core.getMultilineInput(Input_Path);
  for (const p of manual) {
    paths.push({ path: p });
  }

  const cacheModes: string[] = core.getMultilineInput(Input_Cache);
  for (const mode of cacheModes) {
    paths.push(...(await resolveCacheMode(mode)));
  }

  return paths;
}

async function resolveCacheMode(cacheMode: string): Promise<Path[]> {
  switch (cacheMode) {
    case "go":
      const goCache = await getExecStdout(`go env GOCACHE`);
      const goModCache = await getExecStdout(`go env GOMODCACHE`);
      return [{ path: goCache }, { path: goModCache }];

    case "yarn":
      const yarnCache = await getExecStdout(`yarn cache dir`);
      return [{ path: yarnCache }];

    case "pnpm":
      const pnpmCache = await getExecStdout(`pnpm store path`);
      const paths: Path[] = [{ path: pnpmCache }];

      const json = await getExecStdout(`pnpm m ls --depth -1 --json`);
      console.log(json);
      const mapped = await getExecStdout(
        `pnpm m ls --depth -1 --json | jq 'map(.path)'`
      );
      console.log(mapped);

      const pnpmModules = await getExecStdout(
        `pnpm m ls --depth -1 --json | jq 'map(.path)' | jq -r '.[]'`
      );
      console.log(pnpmModules);

      for (const mod of pnpmModules.split("\n")) {
        paths.push({ path: mod + "/node_modules", wipe: true });
      }

      return paths;

    case "rust":
      // Do not cache the whole ~/.cargo dir as it contains ~/.cargo/bin, where the cargo binary lives
      return [
        { path: "~/.cargo/registry" },
        { path: "~/.cargo/git" },
        { path: "./target" },
      ];

    default:
      core.warning(`Unknown cache option: ${cacheMode}.`);
      return [];
  }
}

async function getExecStdout(cmd: string, input?: string): Promise<string> {
  const { stdout } = await exec.getExecOutput(cmd, [], {
    input: Buffer.from(input, "utf8"),
    //  silent: true,
  });

  return stdout.trim();
}
