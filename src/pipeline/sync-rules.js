import { LIST_NAME_PREFIX } from "./sync-lists.js";
import { enabledCategoryIds } from "../core/security-categories.js";

export const DNS_RULE_NAME = "WIWIE Filter Lists";
export const SECURITY_CATEGORY_RULE_NAME = "WIWIE Security Categories";
export const CONTENT_CATEGORY_RULE_NAME = "WIWIE Content Categories";
const LEGACY_SNI_RULE_NAME = "CGPS Filter Lists - SNI Based Filtering";
// Tên cũ (trước khi đổi CGPS → WIWIE): tự nhận lại và đổi tên tại chỗ ở lần sync đầu.
const LEGACY_RULE_NAMES = {
  [DNS_RULE_NAME]: "CGPS Filter Lists",
  [SECURITY_CATEGORY_RULE_NAME]: "CGPS Security Categories",
  [CONTENT_CATEGORY_RULE_NAME]: "CGPS Content Categories",
};
const findRule = (rules, name) =>
  rules.find((r) => r.name === name) ?? rules.find((r) => r.name === LEGACY_RULE_NAMES[name]);

/**
 * Builds a Wirefilter expression matching DNS queries against every managed
 * list, then creates or updates the Gateway rule.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {{ id: string, name: string }[]} lists
 */
export const upsertRule = async (client, lists) => {
  const managed = lists.filter((l) => l.name.startsWith(LIST_NAME_PREFIX));
  const expression = managed.map(({ id }) => `any(dns.domains[*] in $${id})`).join(" or ");
  const name = DNS_RULE_NAME;
  const filters = ["dns"];

  const { result: existingRules } = await client.listRules();
  const existing = findRule(existingRules, name);

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
  const existing = findRule(existingRules, SECURITY_CATEGORY_RULE_NAME);

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
 * Chặn theo Content Categories của Cloudflare (vd. "Advertisements") — không
 * tốn slot domain nào. Chỉ chạy khi BLOCK_CONTENT_CATEGORY_IDS được đặt; nếu
 * trống thì rule cũ (nếu có) bị xoá. Lấy ID bằng
 * GET /accounts/{id}/gateway/categories.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {number[]} ids
 */
export const upsertContentCategoryRule = async (client, ids) => {
  const { result: existingRules } = await client.listRules();
  const existing = findRule(existingRules, CONTENT_CATEGORY_RULE_NAME);

  if (ids.length === 0) {
    if (existing) {
      console.log(`No content categories configured — deleting rule "${CONTENT_CATEGORY_RULE_NAME}"...`);
      await client.deleteRule(existing.id);
    }
    return null;
  }

  const expression = `any(dns.content_category[*] in {${ids.join(" ")}})`;
  const ruleBody = {
    name: CONTENT_CATEGORY_RULE_NAME,
    expression,
    filters: ["dns"],
    blockPageEnabled: process.env.BLOCK_PAGE_ENABLED === "1",
  };
  console.log(`${existing ? "Updating" : "Creating"} rule "${CONTENT_CATEGORY_RULE_NAME}" (${ids.length} categories)...`);
  return existing ? client.updateRule(existing.id, ruleBody) : client.createRule(ruleBody);
};

/**
 * Xoá rule SNI cũ (tính năng đã bị loại bỏ) nếu còn sót trên Cloudflare.
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 */
export const removeLegacySniRule = async (client) => {
  const { result: existingRules } = await client.listRules();
  const legacy = existingRules.find((r) => r.name === LEGACY_SNI_RULE_NAME);
  if (!legacy) return false;
  console.log(`Removing legacy rule "${LEGACY_SNI_RULE_NAME}"...`);
  await client.deleteRule(legacy.id);
  return true;
};

/**
 * Deletes all managed rules. Used by the delete/teardown CLI.
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 */
export const deleteAllManagedRules = async (client) => {
  const { result: rules } = await client.listRules();
  const managed = rules.filter(
    (r) => r.name.startsWith("WIWIE Filter Lists") ||
      r.name.startsWith("CGPS ") ||
      r.name === SECURITY_CATEGORY_RULE_NAME ||
      r.name === CONTENT_CATEGORY_RULE_NAME
  );
  for (const rule of managed) {
    console.log(`Deleting rule "${rule.name}"...`);
    await client.deleteRule(rule.id);
  }
  return managed.length;
};
