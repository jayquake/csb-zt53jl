/*
 * The hand-off from the studio to production.
 *
 * Everything in the app up to this point is a preview. This writes the actual
 * record — the same `Design` the bag stores — to a file that `tools/` (the
 * Python pipeline) turns into print files. One record, so the sock that gets
 * made is the sock that was designed rather than a re-interpretation of a
 * screenshot.
 *
 * The wrapper around it is deliberate. A bare design object gives whoever opens
 * the file six months from now no way to tell what it is or which shape of it
 * they are looking at; `kind` and `version` cost two lines and answer both.
 * The Python loader accepts either form.
 */

import type { Design } from './design';

export const DESIGN_FILE_KIND = 'smiley-socks-design';
export const DESIGN_FILE_VERSION = 1;

export interface DesignFile {
  kind: typeof DESIGN_FILE_KIND;
  version: number;
  exportedAt: string;
  design: Design;
}

export function designFile(design: Design): DesignFile {
  return {
    kind: DESIGN_FILE_KIND,
    version: DESIGN_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    design,
  };
}

/** A filename that says what it is, without saying anything a filesystem minds. */
export function designFilename(design: Design): string {
  const stem =
    design.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'design';
  return `${stem}-design.json`;
}

export function downloadDesign(design: Design): void {
  const blob = new Blob([`${JSON.stringify(designFile(design), null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = designFilename(design);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick later
  // is safely after it has started, and not leaking the object URL matters on a
  // page where someone exports a dozen designs in a row.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
