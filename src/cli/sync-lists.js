import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { loadAllowSet, buildDomainSet } from "../pipeline/build-domain-set.js";
import { syncLists } from "../pipeline/sync-lists.js";
import { createClient, runCommand } from "./shared.js";

await runCommand("sync-lists", async () => {
  const allowlistPath = resolve(config.files.allowlist);
  const blocklistPath = resolve(config.files.blocklist);

  for (const [label, path] of [["allowlist", allowlistPath], ["blocklist", blocklistPath]]) {
    if (!existsSync(path)) {
      throw new Error(`${label} file not found at ${path}. Run "npm run download" first.`);
    }
  }

  console.log(`Loading ${config.files.allowlist}...`);
  const allowSet = await loadAllowSet(allowlistPath);
  console.log(`Loaded ${allowSet.size} allowlisted domains.`);

  console.log(`Processing ${config.files.blocklist}...`);
  const { domains, stats } = await buildDomainSet(blocklistPath, allowSet, config.listItemLimit);

  console.log(`\nProcessed: ${stats.processed}`);
  console.log(`Invalid/comment lines skipped: ${stats.invalid}`);
  console.log(`Allowlisted/redundant skipped: ${stats.skipped}`);
  console.log(`Unique domains after smart dedup: ${domains.length}`);
  if (stats.limitReached) console.log(`Reached the ${config.listItemLimit} domain limit — remaining lines were not processed.`);
  console.log("");

  if (config.dryRun) {
    console.log("DRY_RUN is set — no changes made to Cloudflare.");
    return { dryRun: true, domainCount: domains.length, ...stats };
  }

  const result = await syncLists(createClient(), domains);
  return { domainCount: domains.length, ...stats, ...result };
});
