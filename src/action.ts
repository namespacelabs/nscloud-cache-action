import * as core from '@actions/core';
import {exec as spacectlExec} from '@namespacelabs/actions-toolkit/spacectl';

export const Input_Spacectl_Enabled = 'spacectl-enabled';
export const Input_FailOnCacheMiss = 'fail-on-cache-miss';
export const Input_Detect_Mode = 'detect';
export const Input_Cache = 'cache';
export const Input_Path = 'path';
export const Output_CacheHit = 'cache-hit';

export function isSpacectlEnabled(): boolean {
  return core.getBooleanInput(Input_Spacectl_Enabled);
}

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

export async function mount(): Promise<MountResponse> {
  const result = await spacectlExec(getMountCommand());
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

export function getManualModesInput(): string[] {
  return core.getMultilineInput(Input_Cache).sort();
}

export function getMountCommand(): string[] {
  const args: string[] = [];

  let detectModes = core.getMultilineInput(Input_Detect_Mode).sort();
  if (detectModes.length > 0) {
    if (detectModes.length === 1 && detectModes[0].toLowerCase() === 'true') {
      detectModes = ['*'];
    }
    args.push('--detect=' + detectModes.join(','));
  }

  const manualModes = getManualModesInput();
  if (manualModes.length > 0) {
    args.push('--mode=' + manualModes.join(','));
  }

  const manualPaths = core.getMultilineInput(Input_Path);
  if (manualPaths.length > 0) {
    args.push('--path=' + manualPaths.join(','));
  }

  if (args.length === 0) {
    args.push('--detect=*');
  }

  args.unshift('cache', 'mount');
  return args;
}
