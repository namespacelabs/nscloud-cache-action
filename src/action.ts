import * as core from '@actions/core';
import {exec as spacectlExec} from '@namespacelabs/actions-toolkit/spacectl';

export const Input_FailOnCacheMiss = 'fail-on-cache-miss';
export const Input_Detect_Mode = 'detect';
export const Input_Cache = 'cache';
export const Input_Path = 'path';
export const Output_CacheHit = 'cache-hit';

export interface MountResponse {
  input: MountResponseInput;
  output: MountResponseOutput;
}

export interface MountResponseInput {
  modes: string[];
  paths?: string[];
}

export interface MountResponseOutput {
  destructive_mode: boolean;
  add_envs?: MountResponseOutputAddEnvs;
  disk_usage: MountResponseOutputDiskUsage;
  mounts: MountResponseOutputMount[];
  removed_paths: string[];
}

export interface MountResponseOutputAddEnvs {
  [key: string]: string;
}

export interface MountResponseOutputDiskUsage {
  total: string;
  used: string;
}

export interface MountResponseOutputMount {
  mode: string;
  cache_path: string;
  mount_path: string;
  cache_hit: boolean;
}

export async function mount(options: MountOptions): Promise<MountResponse> {
  const result = await spacectlExec(getMountCommand(options));
  return JSON.parse(result.stdout.trim()) as MountResponse;
}

export function exportAddEnvs(addEnvs?: MountResponseOutputAddEnvs): void {
  if (!addEnvs) {
    return;
  }
  for (const [key, value] of Object.entries(addEnvs)) {
    core.exportVariable(key, value);
  }
}

export interface MountOptions {
  detect: string[];
  modes: string[];
  paths: string[];
}

export function parseMountInputs(): MountOptions {
  let detect = core.getMultilineInput(Input_Detect_Mode).sort();
  if (detect.length === 1 && detect[0].toLowerCase() === 'true') {
    detect = ['*'];
  }

  const mode = core.getMultilineInput(Input_Cache).sort();
  const paths = core.getMultilineInput(Input_Path);

  return {detect, modes: mode, paths};
}

export function getMountCommand(options: MountOptions): string[] {
  const args: string[] = [];

  if (options.detect.length > 0) {
    args.push('--detect=' + options.detect.join(','));
  }

  if (options.modes.length > 0) {
    args.push('--mode=' + options.modes.join(','));
  }

  for (const p of options.paths) {
    args.push('--path=' + p);
  }

  if (args.length === 0) {
    args.push('--detect=*');
  }

  args.unshift('cache', 'mount');
  return args;
}
