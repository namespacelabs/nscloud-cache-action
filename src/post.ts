import * as core from "@actions/core";
import * as utils from "./utils";
import * as fs from "node:fs";

void main();

async function main() {
  const rawPaths = core.getState(utils.StatePathsKey);
  const cachePaths: utils.CachePath[] = JSON.parse(
    rawPaths
  ) as utils.CachePath[];
  const useSymlinks = utils.shouldUseSymlinks();

  if (!useSymlinks) {
    core.debug("Using bind mounts: no risk of finding them deleted.");
  }

  let foundProblems = false;

  for (const p of cachePaths) {
    if (useSymlinks) {
      const expandedFilePath = utils.resolveHome(p.mountTarget);
      const st = fs.lstatSync(expandedFilePath, { throwIfNoEntry: false });

      if (st == null) {
        core.warning(
          `${p.mountTarget}: was linked to the cache volume, but does not exist any more. Did another action (e.g. checkout) delete it?`
        );
        foundProblems = true;
        continue;
      }

      if (!st.isSymbolicLink()) {
        core.warning(
          `${p.mountTarget}: was linked to the cache volume, but is not a symlink anymore. Did another action (e.g. checkout) overwrite it?`
        );
        foundProblems = true;
        continue;
      }
    }

    core.info(`${p.mountTarget}: cached`);
  }

  if (foundProblems) {
    core.info(
      `See https://namespace.so/docs/actions/nscloud-cache-action for more info.`
    );
  }
}
