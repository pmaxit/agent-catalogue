/**
 * Loads the mandatory writing style guide (data/style.md) that the Writer
 * must follow strictly and the Manager (critique agent) judges against.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const STYLE_GUIDE_PATH = resolve(process.cwd(), "data/style.md");

export function loadStyleGuide(path: string = STYLE_GUIDE_PATH): string {
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}
