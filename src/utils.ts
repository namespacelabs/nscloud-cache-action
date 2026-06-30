import * as path from 'node:path';
import * as core from '@actions/core';
import * as fs from 'node:fs';

export const Env_CacheRoot = 'NSC_CACHE_PATH';
export const StatePathsKey = 'paths';
export const StateMountKey = 'mount';

const privateNamespaceDir = '.ns';
const metadataFileName = 'cache-metadata.json';

export interface CachePath {
  pathInCache?: string;
  framework: string;
  mountTarget: string;
}

export function resolveHome(filepath: string): string {
  // Ugly, but should work
  const home = process.env.HOME || '~';
  const pathParts = filepath.split(path.sep);
  if (pathParts.length > 1 && pathParts[0] === '~') {
    return path.join(home, ...pathParts.slice(1));
  }
  return filepath;
}

export interface CacheMetadata {
  version?: number;
  updatedAt?: string;
  userRequest?: {[key: string]: CacheMount};
}
export interface CacheMount {
  source: string;
  cacheFramework: string;
  mountTarget: string[];
}

export function ensureCacheMetadata(cachePath: string): CacheMetadata {
  const namespaceFolderPath = path.join(cachePath, privateNamespaceDir);
  fs.mkdirSync(namespaceFolderPath, {recursive: true});

  const metadataFilePath = path.join(namespaceFolderPath, metadataFileName);
  if (!fs.existsSync(metadataFilePath)) {
    return {};
  }

  const rawData = fs.readFileSync(metadataFilePath, 'utf8');
  const metadata: CacheMetadata = JSON.parse(rawData) as CacheMetadata;
  return metadata;
}

export function writeCacheMetadata(cachePath: string, metadata: CacheMetadata) {
  const namespaceFolderPath = path.join(cachePath, privateNamespaceDir);
  fs.mkdirSync(namespaceFolderPath, {recursive: true});

  const metadataFilePath = path.join(namespaceFolderPath, metadataFileName);
  const rawData = JSON.stringify(metadata);
  fs.writeFileSync(metadataFilePath, rawData, {mode: 0o666});
}

export function shouldUseSymlinks() {
  const useSymlinks = process.env.RUNNER_OS === 'macOS';
  core.debug(`Using symlinks: ${useSymlinks} on ${process.env.RUNNER_OS}.`);
  return useSymlinks;
}
