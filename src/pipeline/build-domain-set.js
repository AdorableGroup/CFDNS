import { existsSync } from "node:fs";
import { normalizeLine } from "../core/domain.js";
import { createSmartBlockSet } from "../core/blockset.js";
import { forEachLine } from "./fetch-sources.js";

/**
 * Loads an allowlist file into a Set of normalized domains.
 * Missing file is treated as an empty allowlist (not an error).
 * @param {string} filePath
 * @returns {Promise<Set<string>>}
 */
export const loadAllowSet = async (filePath) => {
  const allowSet = new Set();
  if (!existsSync(filePath)) return allowSet;
  await forEachLine(filePath, (line) => {
    const domain = normalizeLine(line);
    if (domain) allowSet.add(domain);
  });
  return allowSet;
};

/**
 * Processes a blocklist file against an allowlist, applying smart dedup +
 * parent-domain pruning, capped at `limit` domains.
 *
 * @param {string} filePath
 * @param {Set<string>} allowSet
 * @param {number} limit
 * @returns {Promise<{ domains: string[], stats: { processed: number, invalid: number, skipped: number, limitReached: boolean } }>}
 */
export const buildDomainSet = async (filePath, allowSet, limit) => {
  const blockSet = createSmartBlockSet(allowSet);
  const stats = { processed: 0, invalid: 0, skipped: 0, limitReached: false };

  await forEachLine(filePath, (line, rl) => {
    if (stats.limitReached) return;
    const domain = normalizeLine(line);
    if (!domain) {
      stats.invalid++;
      return;
    }
    stats.processed++;
    if (!blockSet.add(domain)) stats.skipped++;
    if (blockSet.size() === limit) {
      stats.limitReached = true;
      rl.close();
    }
  });

  return { domains: blockSet.getAll(), stats };
};
