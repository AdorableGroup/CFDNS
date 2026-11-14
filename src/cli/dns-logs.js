import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { fetchDnsLogSummary } from "../pipeline/fetch-dns-logs.js";
import { createClient, runCommand } from "./shared.js";

await runCommand("dns-logs", async () => {
  const summary = await fetchDnsLogSummary(createClient(), {
    windowHours: config.dnsLogWindowHours,
  });

  const filePath = resolve(config.files.dnsLogs);
  writeFileSync(filePath, JSON.stringify(summary, null, 2));
  console.log(
    `Wrote ${config.files.dnsLogs}: ${summary.totals.block ?? 0} blocked, ` +
      `${summary.totals.allow ?? 0} allowed (last ${summary.windowHours}h).`
  );

  return {
    windowHours: summary.windowHours,
    totals: summary.totals,
    topBlockedCount: summary.topBlocked.length,
    topAllowedCount: summary.topAllowed.length,
    recentRows: summary.recent.length,
  };
});
