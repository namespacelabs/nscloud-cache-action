import * as fs from "node:fs";
import os from 'os';
import * as path from "node:path";
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
const ModeXcode = "xcode";
const AptDirCacheKey = "Dir::Cache";
const AptDirCacheArchivesKey = "Dir::Cache::archives";
const AptDirEtcKey = "Dir::Etc";
const AptDirEtcPartsKey = "Dir::Etc::parts";

void main();

async function main() {
  // nscloud-cache-action should run within seconds. Time out after five minutes as a safety guard.
  const timeoutId = setTimeout(() => {
    core.setFailed("nscloud-cache-action timed out");
    process.exit(1);
  }, 5 * 60 * 1000);

  try {
    await run();
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function run() {
  const localCachePath = process.env[utils.Env_CacheRoot];
  if (localCachePath == null) {
    let hint = `Please update your \x1b[1mruns-on\x1b[0m labels. E.g.:

\x1b[32mruns-on\x1b[34m:\x1b[0m
  - \x1b[34mnscloud-ubuntu-22.04-amd64-8x16-\x1b[1mwith-cache\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-size-50gb\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-tag-my-cache-key\x1b[0m

You can replace \x1b[1mmy-cache-key\x1b[0m with something that represents what you’re storing in the cache.`;

    if (process.env.NSC_RUNNER_PROFILE_INFO) {
      hint = "Please enable \x1b[1mCaching\x1b[0m in your runner profile.";
    }

    throw new Error(
      `nscloud-cache-action requires a cache volume to be configured.

${hint}

See also https://namespace.so/docs/solutions/github-actions/caching

Are you running in a container? Check out https://namespace.so/docs/reference/github-actions/runner-configuration#jobs-in-containers`
    );
  }
  core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);

  const useSymlinks = utils.shouldUseSymlinks();

  const cachePaths = await resolveCachePaths(localCachePath);
  const cacheMisses = await restoreLocalCache(cachePaths, useSymlinks);

  const fullHit = cacheMisses.length === 0;
  core.setOutput(Output_CacheHit, fullHit.toString());

  if (!fullHit) {
    core.info(`Some cache paths missing: ${cacheMisses}.`);

    const failOnCacheMiss = core.getBooleanInput(Input_FailOnCacheMiss);
    if (failOnCacheMiss) {
      throw new Error(`Some cache paths missing: ${cacheMisses}.`);
    }
  } else {
    core.info("All cache paths found and restored.");
  }

  try {
    // Write/update cache volume metadata file
    const metadata = utils.ensureCacheMetadata(localCachePath);
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
  } catch (e) {
    core.warning("Failed to record cache metadata.");
    core.info(e.message);
  }

  // Save the list of cache paths to actions state for the post-cache action
  core.saveState(utils.StatePathsKey, cachePaths);

  const cacheUtilInfo = await getCacheSummaryUtil(localCachePath);
  core.info(
    `Total available cache space is ${cacheUtilInfo.size}, and ${cacheUtilInfo.used} have been used.`
  );
}

export async function restoreLocalCache(
  cachePaths: utils.CachePath[],
  useSymlinks: boolean
): Promise<string[]> {
  const cacheMisses: string[] = [];

  for (const p of cachePaths) {
    if (!fs.existsSync(p.pathInCache)) {
      cacheMisses.push(p.mountTarget);
    }

    const expandedFilePath = utils.resolveHome(p.mountTarget);
    const st = fs.lstatSync(expandedFilePath, { throwIfNoEntry: false });

    if (p.framework == "custom") {
      try {
        if (mountTargetExists(expandedFilePath, st)) {
          core.warning(`Mount target will be overwritten as path ${p.mountTarget} already exists.`);
        }
      } catch (e) {
        core.error(`Failed to check mount target path ${p.mountTarget}: ${e.message}`);
      }
    }

    await io.mkdirP(p.pathInCache);

    if (useSymlinks) {
      await utils.sudoMkdirP(path.dirname(expandedFilePath));
      await exec.exec("sudo", ["rm", "-rf", expandedFilePath]);
      await exec.exec("sudo", ["ln", "-sfn", p.pathInCache, expandedFilePath]);
      await utils.chownSelf(expandedFilePath);
    } else {
      if (st && !st.isDirectory()) {
        // If path exists and is not a directory, we can't mount over it
        await exec.exec("sudo", ["rm", "-rf", expandedFilePath]);
      }
      // Sudo to be able to create dirs in root (e.g. /nix), but set the runner as owner.
      await utils.sudoMkdirP(expandedFilePath);
      await exec.exec(`sudo mount --bind ${p.pathInCache} ${expandedFilePath}`);
    }
  }

  return cacheMisses;
}

async function resolveCachePaths(
  localCachePath: string
): Promise<utils.CachePath[]> {
  const paths: utils.CachePath[] = [];

  const manual: string[] = core.getMultilineInput(Input_Path);

  let cachesNodeModules = false;
  for (const p of manual) {
    paths.push({ mountTarget: p, framework: "custom" });

    if (p.endsWith("/node_modules")) {
      cachesNodeModules = true;
    }
  }

  if (cachesNodeModules) {
    core.warning(
      `Caching node_modules is not always safe. Prefer using cache modes if possible.
See also https://namespace.so/docs/reference/github-actions/nscloud-cache-action#cache`
    );
  }

  const cacheModes: string[] = core.getMultilineInput(Input_Cache);
  let cachesXcode = false;
  for (const mode of cacheModes) {
    if (mode === ModeXcode) {
      cachesXcode = true;
    }
  }

  for (const mode of cacheModes) {
    paths.push(...(await resolveCacheMode(mode, cachesXcode)));
  }

  for (const p of paths) {
    const expandedFilePath = utils.resolveHome(p.mountTarget);
    const fileCachedPath = path.join(localCachePath, expandedFilePath);
    p.pathInCache = fileCachedPath;
  }

  return paths;
}

async function resolveCacheMode(
  cacheMode: string,
  cachesXcode: boolean
): Promise<utils.CachePath[]> {
  switch (cacheMode) {
    case "apt": {
      const cfg = await getAptConfigDump();

      const etcDir = cfg.get(AptDirEtcKey);
      const etcPartsDir = cfg.get(AptDirEtcPartsKey);
      await exec.exec("sudo", ["rm", "-f", `/${etcDir}/${etcPartsDir}/docker-clean`]);

      const cacheDir = cfg.get(AptDirCacheKey);
      const cacheArchivesDir = cfg.get(AptDirCacheArchivesKey);

      return [{
        mountTarget: `/${cacheDir}/${cacheArchivesDir}`,
        framework: cacheMode,
      }]
    }

    case "brew": {
      const brewCache = await getExecStdout("brew --cache");
      return [{ mountTarget: brewCache, framework: cacheMode }];
    }

    case "cocoapods": {
      return [
        {
          mountTarget: "./Pods",
          framework: cacheMode,
        },
        {
          mountTarget: "~/Library/Caches/CocoaPods",
          framework: cacheMode,
        },
      ];
    }

    case "composer": {
      const composerCache = await getExecStdout(
        "composer config --global cache-files-dir"
      );
      return [{ mountTarget: composerCache, framework: cacheMode }];
    }

    case "deno": {
      const deno = await getExecStdout("deno info --json");
      const denoParsed = JSON.parse(deno);

      return [
        { mountTarget: denoParsed.denoDir, framework: cacheMode },
      ];
    }

    case "go": {
      const goCache = await getExecStdout("go env -json GOCACHE GOMODCACHE");
      const goCacheParsed = JSON.parse(goCache);

      return [
        { mountTarget: goCacheParsed.GOCACHE, framework: cacheMode },
        { mountTarget: goCacheParsed.GOMODCACHE, framework: cacheMode },
      ];
    }

    case "gradle": {
      return [
        { mountTarget: "~/.gradle/caches", framework: cacheMode },
        { mountTarget: "~/.gradle/wrapper", framework: cacheMode },
      ];
    }

    case "maven": {
      return [{ mountTarget: "~/.m2/repository", framework: cacheMode }];
    }

    case "playwright": {
      let mountTarget = "~/.cache/ms-playwright";
      switch (os.platform()) {
        case "darwin":
          mountTarget = "~/Library/Caches/ms-playwright";
          break;
        case "win32":
          mountTarget = "%USERPROFILE%\AppData\Local\ms-playwright";
          break;
      }

      if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
        mountTarget = process.env.PLAYWRIGHT_BROWSERS_PATH;
      }

      return [{
        mountTarget: mountTarget,
        framework: cacheMode,
      }]
    }

    case "pnpm": {
      const ver = await pnpmVersion();
      const semver = require("semver");

      const execFn = semver.lt(ver, "9.7.0")
        ? getExecStdoutDropWarnings // pnpm prints warnings to stdout pre 9.7.
        : getExecStdout;

      const pnpmCache = await execFn("pnpm store path --loglevel error");
      const paths: utils.CachePath[] = [
        { mountTarget: pnpmCache, framework: cacheMode },
      ];

      // Hard-linking and clone do not work. Select copy mode to avoid spurious warnings.
      core.exportVariable("npm_config_package_import_method", "copy");
      return paths;
    }

    case "poetry": {
      const poetryCache = await getExecStdout("poetry config cache-dir");
      return [{ mountTarget: poetryCache, framework: cacheMode }];
    }

    case "python": {
      const pipCache = await getExecStdout("pip cache dir");
      return [{ mountTarget: pipCache, framework: cacheMode }];
    }

    case "ruby": {
      return [
        {
          // Caches output of `bundle install`.
          mountTarget: "./vendor/bundle",
          framework: cacheMode,
        },
        {
          // Caches output of `bundle cache` (less common).
          mountTarget: "./vendor/cache",
          framework: cacheMode,
        },
      ];
    }

    case "rust": {
      // Do not cache the whole ~/.cargo dir as it contains ~/.cargo/bin, where the cargo binary lives
      return [
        { mountTarget: "~/.cargo/registry", framework: cacheMode },
        { mountTarget: "~/.cargo/git", framework: cacheMode },
        { mountTarget: "./target", framework: cacheMode },
        // Cache cleaning feature uses SQLite file https://blog.rust-lang.org/2023/12/11/cargo-cache-cleaning.html
        { mountTarget: "~/.cargo/.global-cache", framework: cacheMode },
      ];
    }

    case "swiftpm": {
      const res = [
        {
          mountTarget: "./.build",
          framework: cacheMode,
        },
        {
          mountTarget: "~/Library/Caches/org.swift.swiftpm",
          framework: cacheMode,
        },
        {
          mountTarget: "~/Library/org.swift.swiftpm",
          framework: cacheMode,
        },
      ];

      if (!cachesXcode) {
        // Xcode caching already caches all derived data.
        // Cached data lands in the same location, so also restoring with `swift` mode will work.
        res.push({
          mountTarget:
            "~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex",
          framework: cacheMode,
        });
      }

      return res;
    }

    case "uv": {
      // Defaults to clone (also known as Copy-on-Write) on macOS, and hardlink on Linux and Windows.
      // Neither works with cache volumes, and fall back to `copy`. Select `symlink` to avoid copies.
      core.exportVariable("UV_LINK_MODE", "symlink");

      const uvCache = await getExecStdout("uv cache dir");
      return [{ mountTarget: uvCache, framework: cacheMode }];
    }

    // Experimental, this can be huge.
    case ModeXcode: {
      core.exportVariable("COMPILATION_CACHE_ENABLE_CACHING_DEFAULT", "YES");
      return [
        {
          // Consider: `defaults read com.apple.dt.Xcode.plist IDECustomDerivedDataLocation`
          mountTarget: "~/Library/Developer/Xcode/DerivedData/CompilationCache.noindex",
          framework: cacheMode,
        },
      ];
    }

    case "yarn": {
      const yarnVersion = await getExecStdout("yarn --version");
      const yarnCache = yarnVersion.startsWith("1.")
        ? await getExecStdout("yarn cache dir")
        : await getExecStdout("yarn config get cacheFolder");
      return [{ mountTarget: yarnCache, framework: cacheMode }];
    }

    default:
      core.warning(`Unknown cache option: ${cacheMode}.`);
      return [];
  }
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
      silent: !core.isDebug(),
      ignoreReturnCode: true,
    }
  );
  const cacheUtilData = stdout.trim().split(" ");

  return {
    size: cacheUtilData[0],
    used: cacheUtilData[1],
  };
}

async function pnpmVersion(): Promise<string> {
  const out = await getExecStdout("pnpm --version");

  // pnpm prints warnings to stdout pre 9.7, so only the last line contains the version.
  const lines = out.split(/\r?\n/);

  return lines[lines.length - 1];
}

async function getAptConfigDump(): Promise<Map<string, string>> {
  const { stdout } = await exec.getExecOutput("apt-config dump", [], {
    silent: true,
  });

  const config = new Map<string, string>();
  const pattern = /(.+)\s"(.*)";/;

  for (const line of stdout.split(/\r?\n/)) {
    const match = pattern.exec(line.trim());
    if (!match) {
      continue;
    }
    config.set(match[1], match[2]);
  }

  return config;
}

async function getExecStdoutDropWarnings(cmd: string): Promise<string> {
  const { stdout } = await exec.getExecOutput(cmd);

  return stdout
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("\u2009WARN\u2009"))
    .join("\r\n")
    .trim();
}

async function getExecStdout(cmd: string): Promise<string> {
  const { stdout } = await exec.getExecOutput(cmd);
  return stdout.trim();
}

function mountTargetExists(
  filePath: string,
  stat: fs.Stats | undefined
): boolean {
  if (!stat) {
    return false;
  }

  if (stat.isFile()) {
    return true;
  }

  if (stat.isDirectory()) {
    return fs.readdirSync(filePath).length > 0;
  }

  if (stat.isSymbolicLink()) {
    const expandedFilePath = fs.realpathSync(filePath);
    const linkStat = fs.lstatSync(expandedFilePath);
    if (!linkStat || !linkStat.isDirectory()) {
      // symlink to non-directory
      return false;
    }
    return fs.readdirSync(expandedFilePath).length > 0;
  }

  return false;
}
