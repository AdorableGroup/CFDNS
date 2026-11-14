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
