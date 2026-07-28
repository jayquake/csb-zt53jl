import * as path from 'path';
import * as fs from 'fs';

/**
 * Locates this project's `public` directory by walking up from a starting
 * directory until one containing `index.html` is found.
 *
 * A fixed relative path cannot work here, for two reasons that compound:
 *
 *  - `__dirname` differs between run modes: `src/` under ts-node but
 *    `dist/src/` after a build, so `../public` resolves to two places.
 *  - This project lives in a subdirectory of a larger repository that has its
 *    own `public/`. Guessing wrong doesn't fail loudly — it silently copies
 *    the wrong site.
 *
 * Requiring `index.html` to be present is what makes the match specific rather
 * than "the first directory called public".
 */
export function findPublicDir(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'public');
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  throw new Error(`could not locate a public/ directory with an index.html, starting from ${startDir}`);
}
