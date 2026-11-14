import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MAX_HISTORY = 60;

/**
 * Appends a run's result to report.json (kept at the repo root so the static
 * dashboard can fetch it directly). Keeps only the most recent MAX_HISTORY
 * entries so the file doesn't grow unbounded.
 *
 * @param {string} filePath
 * @param {object} entry
 * @param {"success" | "error"} entry.status
 * @param {string} entry.command e.g. "sync", "defragment"
 * @param {object} [entry.stats] Free-form stats relevant to the command.
 * @param {string} [entry.error] Error message, if status is "error".
 */
export const appendReport = (filePath, entry) => {
  let history = [];
  if (existsSync(filePath)) {
    try {
      history = JSON.parse(readFileSync(filePath, "utf8"));
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }

  history.push({ timestamp: new Date().toISOString(), ...entry });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  writeFileSync(filePath, JSON.stringify(history, null, 2));
};
