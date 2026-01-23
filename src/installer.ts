import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import * as path from "path";
import * as fs from "fs";

const Input_SpaceVersion = "space-version";
const Input_GithubToken = "github-token";

const TOOL_NAME = "space";
const REPO_OWNER = "namespacelabs";
const REPO_NAME = "space";

export async function getSpace(): Promise<string> {
  const versionSpec = core.getInput(Input_SpaceVersion);
  const token = core.getInput(Input_GithubToken);
  const arch = getArch();

  const existingPath = await getSpaceBinaryPath();

  // Case 1: No space binary exists - download required version or latest
  if (!existingPath) {
    const version = await resolveVersion(versionSpec, token);
    return await findOrDownload(version, token, arch);
  }

  // Case 2: Space exists, no version specified - use existing as-is
  if (!versionSpec) {
    const installedVersion = await getInstalledVersion(existingPath);
    core.info(`Using existing space v${installedVersion}`);
    const existingDir = path.dirname(existingPath);
    core.addPath(existingDir);
    return existingDir;
  }

  // Case 3: Space exists, "latest" or "pre-release" specified - ensure we have target version
  if (versionSpec === "latest" || versionSpec === "pre-release") {
    const installedVersion = await getInstalledVersion(existingPath);
    const targetVersion = await resolveVersion(versionSpec, token);
    const label = versionSpec === "pre-release" ? "latest pre-release" : "latest";

    if (installedVersion === targetVersion) {
      core.info(`Existing space v${installedVersion} is already ${label}`);
      const existingDir = path.dirname(existingPath);
      core.addPath(existingDir);
      return existingDir;
    }

    core.info(
      `Existing space v${installedVersion} is not ${label} (v${targetVersion})`
    );
    return await findOrDownload(targetVersion, token, arch);
  }

  // Case 4: Space exists, specific version requested - check if matches
  const installedVersion = await getInstalledVersion(existingPath);
  const requestedVersion = normalizeVersion(versionSpec);

  if (installedVersion === requestedVersion) {
    core.info(`Existing space v${installedVersion} matches requested version`);
    const existingDir = path.dirname(existingPath);
    core.addPath(existingDir);
    return existingDir;
  }

  core.info(
    `Version mismatch: installed v${installedVersion}, requested v${requestedVersion}`
  );
  return await findOrDownload(requestedVersion, token, arch);
}

function getPlatform(): string {
  switch (process.platform) {
    case "darwin":
      return "darwin";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}

function getArch(): string {
  switch (process.arch) {
    case "arm64":
      return "arm64";
    default:
      return "amd64";
  }
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/, "");
}

async function resolveVersion(versionSpec: string, token: string): Promise<string> {
  if (!versionSpec || versionSpec === "latest") {
    return await getLatestVersion(token);
  }
  if (versionSpec === "pre-release") {
    return await getLatestPreReleaseVersion(token);
  }
  return normalizeVersion(versionSpec);
}

async function getSpaceBinaryPath(): Promise<string> {
  const powertoysDir = process.env.NSC_POWERTOYS_DIR;
  if (powertoysDir) {
    const spacePath = path.join(powertoysDir, TOOL_NAME);
    if (fs.existsSync(spacePath)) {
      return spacePath;
    }
    return "";
  }

  try {
    return await io.which(TOOL_NAME, false);
  } catch {
    return "";
  }
}

function getDownloadUrl(version: string, platform: string, arch: string): string {
  const cleanVersion = version.replace(/^v/, "");
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${cleanVersion}/space_${cleanVersion}_${platform}_${arch}.tar.gz`;
}

async function getLatestVersion(token: string): Promise<string> {
  const octokit = github.getOctokit(token);
  const { data } = await octokit.rest.repos.getLatestRelease({
    owner: REPO_OWNER,
    repo: REPO_NAME,
  });
  return data.tag_name.replace(/^v/, "");
}

async function getLatestPreReleaseVersion(token: string): Promise<string> {
  const octokit = github.getOctokit(token);

  for await (const response of octokit.paginate.iterator(
    octokit.rest.repos.listReleases,
    { owner: REPO_OWNER, repo: REPO_NAME, per_page: 100 }
  )) {
    const preRelease = response.data.find((release) => release.prerelease);
    if (preRelease) {
      return preRelease.tag_name.replace(/^v/, "");
    }
  }

  throw new Error("No pre-release version found");
}

interface SpaceVersionInfo {
  version: string;
  commit: string;
  date: string;
}

async function getInstalledVersion(spacePath: string): Promise<string> {
  const result = await exec.getExecOutput(spacePath, ["version", "-o=json"], {
    silent: true,
    ignoreReturnCode: true,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to get space version: ${result.stderr || result.stdout}`
    );
  }

  const info = JSON.parse(result.stdout.trim()) as SpaceVersionInfo;
  return info.version;
}

async function findOrDownload(
  version: string,
  token: string,
  arch: string
): Promise<string> {
  const cachedPath = tc.find(TOOL_NAME, version, arch);
  if (cachedPath) {
    core.info(`Found space v${version} in cache`);
    core.addPath(cachedPath);
    return cachedPath;
  }

  const toolPath = await downloadAndCache(version, token);
  core.addPath(toolPath);
  return toolPath;
}

async function downloadAndCache(version: string, token: string): Promise<string> {
  const platform = getPlatform();
  const arch = getArch();

  const downloadUrl = getDownloadUrl(version, platform, arch);
  core.info(`Downloading space v${version} from ${downloadUrl}`);

  let downloadPath: string;
  try {
    downloadPath = await tc.downloadTool(downloadUrl, undefined, token);
  } catch (error) {
    throw new Error(
      `Failed to download space v${version}: ${error instanceof Error ? error.message : error}`
    );
  }

  core.info("Extracting space...");
  const extractedPath = await tc.extractTar(downloadPath);

  core.info("Adding to tool cache...");
  const cachedPath = await tc.cacheDir(extractedPath, TOOL_NAME, version, arch);
  core.info(`Cached space v${version} to ${cachedPath}`);

  return cachedPath;
}
