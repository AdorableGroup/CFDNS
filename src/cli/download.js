import { resolve } from "node:path";
import { config } from "../config.js";
import { downloadSources } from "../pipeline/fetch-sources.js";
import { runCommand } from "./shared.js";

const target = process.argv[2]; // "allowlist" | "blocklist" | undefined (both)

const jobs = {
  allowlist: () => download(config.files.allowlist, config.allowlistUrls),
  blocklist: () => download(config.files.blocklist, config.blocklistUrls),
};

if (target && !jobs[target]) {
  console.error(`Invalid target "${target}". Expected "allowlist", "blocklist", or omit for both.`);
  process.exit(1);
}

async function download(filename, urls) {
  const filePath = resolve(process.cwd(), filename);
  console.log(`Downloading ${filename} (${urls.length} source(s))...`);
  try {
    await downloadSources(filePath, urls);
    return { filename, sources: urls.length };
  } catch (err) {
    console.error(`Failed to download ${filename}:`, err);
    throw err;
  }
}

await runCommand("download", async () => {
  const startedAt = Date.now();
  const results = target
    ? [await jobs[target]()]
    : [await jobs.allowlist(), await jobs.blocklist()];
  return { files: results, elapsedSeconds: ((Date.now() - startedAt) / 1000).toFixed(1) };
});
