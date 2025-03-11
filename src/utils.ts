import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";

export const Env_CacheRoot = "NSC_CACHE_PATH";
export const StatePathsKey = "paths";

const privateNamespaceDir = ".ns";
const metadataFileName = "cache-metadata.json";

export interface CachePath {
  pathInCache?: string;
  wipe?: boolean;
  framework: string;
  mountTarget: string;
}

export function resolveHome(filepath: string): string {
  // Ugly, but should work
  const home = process.env.HOME || "~";
  const pathParts = filepath.split(path.sep);
  if (pathParts.length > 1 && pathParts[0] === "~") {
    return path.join(home, ...pathParts.slice(1));
  }
  return filepath;
}

// Creates directories in path. Exercises root permissions,
// but sets owner for created dirs to the current user.
export async function sudoMkdirP(path: string) {
  const anc = ancestors(path);
  for (const p of anc) {
    if (fs.existsSync(p)) {
      core.debug(`${p} already exists`);
      continue;
    }

    const { exitCode, stderr } = await exec.getExecOutput(
      "sudo",
      ["mkdir", p],
      {
        silent: true,
        ignoreReturnCode: true,
      }
    );

    if (exitCode > 0) {
      // Sadly, the exit code is 1 and we cannot match for EEXIST in case of concurrent directory creation.
      if (fs.existsSync(p)) {
        core.debug(`${p} was concurrently created`);
        continue;
      }

      core.info(stderr);
      throw new Error(`'sudo mkdir ${p}' failed with exit code ${exitCode}`);
    }

    await chownSelf(p);
  }
}

export async function chownSelf(path: string) {
  const uid = process.getuid();
  const gid = process.getgid();
  const userColonGroup = `${uid}:${gid}`;
  await exec.exec("sudo", ["chown", userColonGroup, path]);
}

function ancestors(filepath: string) {
  const res: string[] = [];
  let norm = path.normalize(filepath);
  while (norm !== "." && norm !== "/") {
    res.unshift(norm);
    const next = path.dirname(norm);
    if (next === norm) break;
    norm = next;
  }
  return res;
}

export async function getCacheUtil(cachePath: string): Promise<number> {
  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "du -sb ${cachePath} | cut -f1"`,
    [],
    {
      silent: true,
      ignoreReturnCode: true,
    }
  );
  const cacheUtil = Number.parseInt(stdout.trim());
  return cacheUtil;
}

export interface CacheMetadata {
  version?: number;
  updatedAt?: string;
  userRequest?: { [key: string]: CacheMount };
}
export interface CacheMount {
  source: string;
  cacheFramework: string;
  mountTarget: string[];
}

export function ensureCacheMetadata(cachePath: string): CacheMetadata {
  const namespaceFolderPath = path.join(cachePath, privateNamespaceDir);
  fs.mkdirSync(namespaceFolderPath, { recursive: true });

  const metadataFilePath = path.join(namespaceFolderPath, metadataFileName);
  if (!fs.existsSync(metadataFilePath)) {
    return {};
  }

  const rawData = fs.readFileSync(metadataFilePath, "utf8");
  const metadata: CacheMetadata = JSON.parse(rawData) as CacheMetadata;
  return metadata;
}

export function writeCacheMetadata(cachePath: string, metadata: CacheMetadata) {
  const namespaceFolderPath = path.join(cachePath, privateNamespaceDir);
  fs.mkdirSync(namespaceFolderPath, { recursive: true });

  const metadataFilePath = path.join(namespaceFolderPath, metadataFileName);
  const rawData = JSON.stringify(metadata);
  fs.writeFileSync(metadataFilePath, rawData, { mode: 0o666 });
}

export function shouldUseSymlinks() {
  const useSymlinks = process.env.RUNNER_OS === "macOS";
  core.debug(`Using symlinks: ${useSymlinks} on ${process.env.RUNNER_OS}.`);
  return useSymlinks;
}