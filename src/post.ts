import * as core from "@actions/core";
import * as utils from "./utils";
import * as fs from "node:fs";
import * as io from "@actions/io";

void main();

async function main() {
  const rawPaths = core.getState(utils.StatePathsKey);
  const cachePaths: utils.CachePath[] = JSON.parse(
    rawPaths
  ) as utils.CachePath[];
  const useSymlinks = utils.shouldUseSymlinks();

  let foundProblems = false;

  for (const p of cachePaths) {
    if (p.wipe) {
      await io.rmRF(p.pathInCache);
      continue;
    }

    if (!useSymlinks) {
      core.debug("Using bind mounts: no risk of finding them deleted.");
    } else {
      const st = fs.lstatSync(p.mountTarget, { throwIfNoEntry: false });

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
