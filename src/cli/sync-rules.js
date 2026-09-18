import { config } from "../config.js";
import { upsertRule, upsertSecurityCategoryRule } from "../pipeline/sync-rules.js";
import { createClient, runCommand } from "./shared.js";

await runCommand("sync-rules", async () => {
  const client = createClient();
  const { result: lists } = await client.listLists();
  console.log(`Fetched ${lists?.length ?? 0} lists.`);

  const dnsRule = await upsertRule(client, lists, "dns");
  console.log(`DNS rule ready: ${dnsRule?.result?.id ?? "unknown id"}`);

  let sniRule;
  if (config.blockBasedOnSni) {
    sniRule = await upsertRule(client, lists, "sni");
    console.log(`SNI rule ready: ${sniRule?.result?.id ?? "unknown id"}`);
  } else {
    console.log("SNI blocking disabled, skipping.");
  }

  const categoryRule = await upsertSecurityCategoryRule(client);

  return {
    dnsRuleId: dnsRule?.result?.id,
    sniRuleId: sniRule?.result?.id,
    sniEnabled: config.blockBasedOnSni,
    securityCategoryRuleId: categoryRule?.result?.id ?? null,
  };
});
