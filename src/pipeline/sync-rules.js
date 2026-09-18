import { LIST_NAME_PREFIX } from "./sync-lists.js";
import { enabledCategoryIds } from "../core/security-categories.js";

export const DNS_RULE_NAME = "CGPS Filter Lists";
export const SNI_RULE_NAME = "CGPS Filter Lists - SNI Based Filtering";
export const SECURITY_CATEGORY_RULE_NAME = "CGPS Security Categories";

/**
 * Builds a Wirefilter expression matching DNS/SNI queries against every
 * managed list, then creates or updates the corresponding Gateway rule.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {{ id: string, name: string }[]} lists
 * @param {"dns" | "sni"} kind
 */
export const upsertRule = async (client, lists, kind) => {
  const managed = lists.filter((l) => l.name.startsWith(LIST_NAME_PREFIX));
  const field = kind === "dns" ? "dns.domains" : "net.sni.domains";
  const expression = managed.map(({ id }) => `any(${field}[*] in $${id})`).join(" or ");
  const name = kind === "dns" ? DNS_RULE_NAME : SNI_RULE_NAME;
  const filters = kind === "dns" ? ["dns"] : ["l4"];

  const { result: existingRules } = await client.listRules();
  const existing = existingRules.find((r) => r.name === name);

  const blockPageEnabled = process.env.BLOCK_PAGE_ENABLED === "1";
  const ruleBody = { name, expression, filters, blockPageEnabled };

  if (existing) {
    console.log(`Updating rule "${name}"...`);
    return client.updateRule(existing.id, ruleBody);
  }
  console.log(`Creating rule "${name}"...`);
  return client.createRule(ruleBody);
};

/**
 * Đồng bộ rule chặn theo Cloudflare Security Categories — tương đương các
 * toggle "Threat Protection" của NextDNS (Malware, Phishing, DGA, DNS
 * Rebinding, Typosquatting, v.v.), xem src/core/security-categories.js.
 *
 * Nếu không có category nào được bật (mọi BLOCK_* = "0"), rule cũ (nếu có)
 * sẽ bị xoá thay vì để lại một rule rỗng.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 */
export const upsertSecurityCategoryRule = async (client) => {
  const ids = enabledCategoryIds();
  const { result: existingRules } = await client.listRules();
  const existing = existingRules.find((r) => r.name === SECURITY_CATEGORY_RULE_NAME);

  if (ids.length === 0) {
    if (existing) {
      console.log(`No security categories enabled — deleting rule "${SECURITY_CATEGORY_RULE_NAME}"...`);
      await client.deleteRule(existing.id);
    } else {
      console.log("No security categories enabled — skipping.");
    }
    return null;
  }

  const expression = `any(dns.security_category[*] in {${ids.join(" ")}})`;
  const blockPageEnabled = process.env.BLOCK_PAGE_ENABLED === "1";
  const ruleBody = { name: SECURITY_CATEGORY_RULE_NAME, expression, filters: ["dns"], blockPageEnabled };

  if (existing) {
    console.log(`Updating rule "${SECURITY_CATEGORY_RULE_NAME}" (${ids.length} categories)...`);
    return client.updateRule(existing.id, ruleBody);
  }
  console.log(`Creating rule "${SECURITY_CATEGORY_RULE_NAME}" (${ids.length} categories)...`);
  return client.createRule(ruleBody);
};

/**
 * Deletes all managed rules. Used by the delete/teardown CLI.
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 */
export const deleteAllManagedRules = async (client) => {
  const { result: rules } = await client.listRules();
  const managed = rules.filter(
    (r) => r.name.startsWith("CGPS Filter Lists") || r.name === SECURITY_CATEGORY_RULE_NAME
  );
  for (const rule of managed) {
    console.log(`Deleting rule "${rule.name}"...`);
    await client.deleteRule(rule.id);
  }
  return managed.length;
};
