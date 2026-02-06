import * as core from '@actions/core';
import {install as installSpacectl} from '@namespacelabs/actions-toolkit/spacectl';
import * as action from './action';
import * as utils from './utils';

const Input_SpacectlVersion = 'spacectl-version';
const Input_SpacectlSystemBinary = 'spacectl-system-binary';
const Input_GithubToken = 'github-token';

void main();

async function main() {
  // nscloud-cache-action should run within seconds. Time out after five minutes as a safety guard.
  const timeoutId = setTimeout(
    () => {
      core.setFailed('nscloud-cache-action timed out');
      process.exit(1);
    },
    5 * 60 * 1000
  );

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
  verifyCacheVolume();

  const versionSpec = core.getInput(Input_SpacectlVersion) || undefined;
  const githubToken = core.getInput(Input_GithubToken) || undefined;
  const systemBinary =
    (core.getInput(Input_SpacectlSystemBinary) as
      | 'prefer'
      | 'require'
      | 'ignore') || undefined;

  await installSpacectl({
    version: versionSpec,
    githubToken: githubToken,
    systemBinary: systemBinary
  });

  await mount();
}

function verifyCacheVolume(): void {
  const localCachePath = process.env[utils.Env_CacheRoot];
  if (localCachePath) {
    core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);
    return;
  }

  let hint = `Please update your \x1b[1mruns-on\x1b[0m labels. E.g.:

\x1b[32mruns-on\x1b[34m:\x1b[0m
  - \x1b[34mnscloud-ubuntu-22.04-amd64-8x16-\x1b[1mwith-cache\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-size-50gb\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-tag-my-cache-key\x1b[0m

You can replace \x1b[1mmy-cache-key\x1b[0m with something that represents what you're storing in the cache.`;

  if (process.env.NSC_RUNNER_PROFILE_INFO) {
    hint = 'Please enable \x1b[1mCaching\x1b[0m in your runner profile.';
  }

  throw new Error(
    `nscloud-cache-action requires a cache volume to be configured.

${hint}

See also https://namespace.so/docs/solutions/github-actions/caching

Are you running in a container? Check out https://namespace.so/docs/reference/github-actions/runner-configuration#jobs-in-containers`
  );
}

async function mount() {
  const mount = await action.mount();

  if (mount.input.modes.length > 0) {
    core.info(`Cache modes used: ${mount.input.modes.join(', ')}.`);
  }

  const fullHit = mount.output.mounts.every(m => m.cache_hit);
  core.setOutput(action.Output_CacheHit, fullHit.toString());

  const pathLabel = mount.output.mounts.length === 1 ? 'path' : 'paths';
  core.info(`Mounted ${mount.output.mounts.length} cache ${pathLabel}.`);

  if (fullHit) {
    core.info('All cache paths found and restored.');
  } else {
    const cacheMisses = mount.output.mounts
      .filter(m => !m.cache_hit)
      .map(m => m.mount_path);

    core.info(`Some cache paths missing: ${cacheMisses.join(', ')}`);

    if (core.getBooleanInput(action.Input_FailOnCacheMiss)) {
      throw new Error(`Some cache paths missing: ${cacheMisses.join(', ')}`);
    }
  }

  action.exportAddEnvs(mount.output.add_envs);

  core.info(
    `Total available cache space is ${mount.output.disk_usage.total}, and ${mount.output.disk_usage.used} have been used.`
  );

  core.saveState(utils.StateMountKey, JSON.stringify(mount));
}
