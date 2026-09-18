import { resolve } from "node:path";
import { config } from "../config.js";
import { downloadSources } from "../pipeline/fetch-sources.js";
import { runCommand } from "./shared.js";

const DOWNLOAD_TIMEOUT_MS = 30_000;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    await downloadSources(filePath, urls, { signal: controller.signal });
    console.log(`Downloaded ${filename} from ${urls.length} source(s).`);
    return { filename, sources: urls.length };
  } catch (err) {
    console.error(`Failed to download ${filename}:`, err);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

await runCommand("download", async () => {
  const startedAt = Date.now();
  const results = target
    ? [await jobs[target]()]
    : await Promise.all([jobs.allowlist(), jobs.blocklist()]);
  return { files: results, elapsedSeconds: ((Date.now() - startedAt) / 1000).toFixed(1) };
});
