import { config } from "../config.js";
import {
  upsertRule,
  upsertSecurityCategoryRule,
  upsertContentCategoryRule,
  removeLegacySniRule,
} from "../pipeline/sync-rules.js";
import { createClient, runCommand } from "./shared.js";

await runCommand("sync-rules", async () => {
  const client = createClient();
  const { result: lists } = await client.listLists();
  console.log(`Fetched ${lists?.length ?? 0} lists.`);

  const dnsRule = await upsertRule(client, lists);
  console.log(`DNS rule ready: ${dnsRule?.result?.id ?? "unknown id"}`);

  const categoryRule = await upsertSecurityCategoryRule(client);
  const contentRule = await upsertContentCategoryRule(client, config.contentCategoryIds);
  await removeLegacySniRule(client);

  return {
    dnsRuleId: dnsRule?.result?.id,
    securityCategoryRuleId: categoryRule?.result?.id ?? null,
    contentCategoryRuleId: contentRule?.result?.id ?? null,
  };
});
