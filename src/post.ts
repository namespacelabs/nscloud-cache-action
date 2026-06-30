import * as core from '@actions/core';
import * as action from './action';
import * as utils from './utils';
import * as fs from 'node:fs';

void main();

async function main() {
  const rawMount = core.getState(utils.StateMountKey);
  if (!rawMount) {
    core.warning('No mount state found. Was the cache mounted?');
    return;
  }

  const mount = JSON.parse(rawMount) as action.MountResponse;

  const usesLinkMount = utils.usesLinkMount();
  if (!usesLinkMount) {
    core.debug('Using bind mounts: no risk of finding them deleted.');
  }

  let foundProblems = false;

  for (const m of mount.output.mounts ?? []) {
    if (usesLinkMount) {
      const expandedPath = utils.resolveHome(m.mount_path);
      const st = fs.lstatSync(expandedPath, {throwIfNoEntry: false});

      if (st == null) {
        core.warning(
          `${m.mount_path}: was linked to the cache volume, but does not exist any more. Did another action (e.g. checkout) delete it?`
        );
        foundProblems = true;
        continue;
      }

      // isSymbolicLink() is true for both macOS symlinks and Windows junctions.
      if (!st.isSymbolicLink()) {
        core.warning(
          `${m.mount_path}: was linked to the cache volume, but is not a link anymore. Did another action (e.g. checkout) overwrite it?`
        );
        foundProblems = true;
        continue;
      }
    }

    core.info(`${m.mount_path}: cached`);
  }

  if (foundProblems) {
    core.info(
      `See https://namespace.so/docs/reference/github-actions/nscloud-cache-action for more info.`
    );
  }
}
