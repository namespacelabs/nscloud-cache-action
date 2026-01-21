import * as core from "@actions/core";
import * as exec from "@actions/exec";

export const Input_Space_Enabled = "space-enabled";
export const Input_FailOnCacheMiss = "fail-on-cache-miss";
export const Input_Detect_Mode = "detect";
export const Input_Mode = "mode";
export const Input_Cache = "cache"; // deprecated, use Input_Mode
export const Input_Path = "path";
export const Output_CacheHit = "cache-hit";

export function isSpaceEnabled(): boolean {
  return core.getBooleanInput(Input_Space_Enabled);
}

export async function space(args?: string[], options?: exec.ExecOptions): Promise<exec.ExecOutput> {
  args.push("--output=json")

  const result = await exec.getExecOutput("space", args, {
    silent: true,
    ignoreReturnCode: true,
    ...options,
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.exitCode !== 0) {
    throw new Error(`'space ${args.join(" ")}' failed with exit code ${result.exitCode}`);
  }

  return result;
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
  const { stdout: mount } = await space(getMountCommand());
  return JSON.parse(mount.trim()) as MountResponse;
}

export function exportAddEnvs(addEnvs?: MountResponseOutputAddEnvs): void {
  if (!addEnvs) {
    return;
  }
  for (const [key, value] of Object.entries(addEnvs)) {
    core.exportVariable(key, value);
  }
}

// getManualModesInput combines modes, handling deprecated inputs
export function getManualModesInput(): string[] {
  return core.getMultilineInput(Input_Mode).concat(core.getMultilineInput(Input_Cache)).sort();
}

export function getMountCommand(): string[] {
  const args: string[] = [];

  let detectModes = core.getMultilineInput(Input_Detect_Mode).sort();
  if (detectModes.length > 0) {
    if (detectModes.length === 1 && detectModes[0].toLowerCase() === 'true') {
      detectModes = ["*"];
    }
    args.push("--detect="+detectModes.join(","));
  }

  const manualModes = getManualModesInput();
  if (manualModes.length > 0) {
    args.push("--mode="+manualModes.join(","));
  }

  const manualPaths = core.getMultilineInput(Input_Path);
  if (manualPaths.length > 0) {
    args.push("--path="+manualPaths.join(","));
  }

  // if nothing has been enabled, default to detecting all
  if (args.length === 0) {
    args.push("--detect=*");
  }

  args.unshift("cache", "mount");
  return args;
}
