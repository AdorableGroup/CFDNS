/**
 * Pure helpers for turning raw Gateway DNS analytics rows into display-ready
 * aggregates. No network calls — easy to unit test.
 */

/**
 * Cloudflare returns domains reversed and dot-joined, e.g. "com.example.www"
 * for "www.example.com". Reverses the label order back to normal.
 * @param {string} reversed
 * @returns {string}
 */
export const unreverseDomain = (reversed) => {
  if (!reversed) return reversed;
  return reversed.split(".").reverse().join(".");
};

/** Known resolverDecision values mapped to a short Vietnamese label. Unknown
 * values pass through unchanged so nothing is silently hidden. */
const DECISION_LABELS = {
  allow: "Cho phép",
  block: "Bị chặn",
  override: "Ghi đè",
  isolate: "Cách ly",
};

/** @param {string} decision */
export const decisionLabel = (decision) => DECISION_LABELS[decision] ?? decision ?? "Không rõ";

/** @param {string} decision */
export const isBlockedDecision = (decision) => decision === "block";

// GAFAM + phổ biến: map hậu tố domain gốc -> tên hãng hiển thị. Khớp theo
// "endsWith" trên domain gốc (registrable domain), không phải substring tuỳ
// tiện, để tránh nhận nhầm domain lạ chứa chuỗi con trùng tên hãng.
const GAFAM_OWNERS = [
  { suffix: "google.com", owner: "Google" },
  { suffix: "googleapis.com", owner: "Google" },
  { suffix: "googlevideo.com", owner: "Google" },
  { suffix: "gstatic.com", owner: "Google" },
  { suffix: "youtube.com", owner: "Google" },
  { suffix: "doubleclick.net", owner: "Google" },
  { suffix: "facebook.com", owner: "Meta" },
  { suffix: "fbcdn.net", owner: "Meta" },
  { suffix: "instagram.com", owner: "Meta" },
  { suffix: "whatsapp.com", owner: "Meta" },
  { suffix: "whatsapp.net", owner: "Meta" },
  { suffix: "microsoft.com", owner: "Microsoft" },
  { suffix: "windows.net", owner: "Microsoft" },
  { suffix: "live.com", owner: "Microsoft" },
  { suffix: "office.com", owner: "Microsoft" },
  { suffix: "office365.com", owner: "Microsoft" },
  { suffix: "xbox.com", owner: "Microsoft" },
  { suffix: "apple.com", owner: "Apple" },
  { suffix: "icloud.com", owner: "Apple" },
  { suffix: "amazon.com", owner: "Amazon" },
  { suffix: "amazonaws.com", owner: "Amazon" },
  { suffix: "amazon-adsystem.com", owner: "Amazon" },
];

/**
 * A minimal list of common multi-part public suffixes (co.uk-style) so the
 * root-domain rollup doesn't cut "co.uk" or "com.vn" in half. Not
 * exhaustive — good enough for a dashboard rollup, not a security boundary.
 */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "co.jp", "co.kr", "co.in", "co.id", "co.th",
  "com.vn", "com.au", "com.br", "com.cn", "com.sg", "com.tw", "com.hk",
  "net.vn", "org.vn", "edu.vn", "gov.vn",
]);

/**
 * Derives the registrable "root domain" from a full hostname, e.g.
 * "ads-platform.zalo.me" -> "zalo.me", "a.root-servers.net" -> "root-servers.net".
 * Handles a short list of known two-part public suffixes (co.uk, com.vn...);
 * anything else falls back to "last two labels".
 * @param {string} domain
 * @returns {string}
 */
export const rootDomain = (domain) => {
  if (!domain) return domain;
  const labels = domain.split(".");
  if (labels.length <= 2) return domain;
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return lastThree;
  return lastTwo;
};

/**
 * Looks up which GAFAM company owns a root domain, if any.
 * @param {string} root
 * @returns {string | null}
 */
export const gafamOwner = (root) => {
  const match = GAFAM_OWNERS.find((g) => root === g.suffix || root.endsWith(`.${g.suffix}`));
  return match?.owner ?? null;
};

/**
 * Rolls up per-domain counts into per-root-domain counts and computes the
 * "GAFAM dominance" breakdown (% of total queries per owner + "Khác").
 * @param {{ domain: string, count: number }[]} domainCounts Any decision — usually all resolved queries.
 * @param {number} topN
 */
export const summarizeRootDomains = (domainCounts, topN = 20) => {
  const rootTotals = new Map();
  const ownerTotals = new Map();
  let grandTotal = 0;

  for (const { domain, count } of domainCounts) {
    const root = rootDomain(domain);
    rootTotals.set(root, (rootTotals.get(root) ?? 0) + count);

    const owner = gafamOwner(root) ?? "Khác";
    ownerTotals.set(owner, (ownerTotals.get(owner) ?? 0) + count);
    grandTotal += count;
  }

  const topRootDomains = Array.from(rootTotals.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const gafamBreakdown = Array.from(ownerTotals.entries())
    .map(([owner, count]) => ({
      owner,
      count,
      percent: grandTotal > 0 ? Math.round((count / grandTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { topRootDomains, gafamBreakdown, grandTotal };
};

/**
 * Aggregates raw per-hour/per-domain/per-decision rows into:
 *  - topBlocked: top N blocked domains by total query count
 *  - topAllowed: top N allowed domains by total query count
 *  - hourly: query counts per hour, split by allow/block
 *  - totals: overall allow/block/other counts
 *
 * @param {{ count: number, queryNameReversed: string, resolverDecision: string, datetimeHour: string }[]} rows
 * @param {number} topN
 */
export const summarizeDnsLogs = (rows, topN = 20) => {
  const domainTotals = new Map(); // "domain|decision" -> count
  const hourlyTotals = new Map(); // hour -> { allow, block, other }
  const totals = { allow: 0, block: 0, other: 0 };

  for (const row of rows) {
    const domain = unreverseDomain(row.queryNameReversed);
    const decision = row.resolverDecision;
    const key = `${domain}|${decision}`;
    domainTotals.set(key, (domainTotals.get(key) ?? 0) + row.count);

    const bucket = "other" in totals && decision !== "allow" && decision !== "block" ? "other" : decision;
    totals[bucket] = (totals[bucket] ?? 0) + row.count;

    if (!hourlyTotals.has(row.datetimeHour)) {
      hourlyTotals.set(row.datetimeHour, { allow: 0, block: 0, other: 0 });
    }
    const hourBucket = hourlyTotals.get(row.datetimeHour);
    hourBucket[bucket] = (hourBucket[bucket] ?? 0) + row.count;
  }

  const byDecision = (wanted) =>
    Array.from(domainTotals.entries())
      .filter(([key]) => key.endsWith(`|${wanted}`))
      .map(([key, count]) => ({ domain: key.slice(0, -(wanted.length + 1)), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

  const hourly = Array.from(hourlyTotals.entries())
    .map(([hour, counts]) => ({ hour, ...counts }))
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  return {
    topBlocked: byDecision("block"),
    topAllowed: byDecision("allow"),
    hourly,
    totals,
  };
};
