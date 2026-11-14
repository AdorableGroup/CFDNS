import { unreverseDomain, summarizeDnsLogs } from "../core/dns-logs.js";

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_TOP_N = 20;
const RECENT_ROWS_LIMIT = 50;

/**
 * Fetches Gateway DNS query analytics for the last `windowHours` and builds
 * a compact, dashboard-ready summary: recent rows (for the raw log table),
 * top blocked/allowed domains, and hourly allow/block counts.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {object} [options]
 * @param {number} [options.windowHours]
 * @param {number} [options.topN]
 */
export const fetchDnsLogSummary = async (client, { windowHours = DEFAULT_WINDOW_HOURS, topN = DEFAULT_TOP_N } = {}) => {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  console.log(`Fetching Gateway DNS query analytics since ${since}...`);
  const rows = await client.queryDnsLogs({ sinceIso: since });
  console.log(`Fetched ${rows.length} grouped rows.`);

  const summary = summarizeDnsLogs(rows, topN);

  // A compact "recent activity" table for the dashboard: the highest-count
  // groups overall, most recent hour first, domain names un-reversed.
  const recent = [...rows]
    .sort((a, b) => (a.datetimeHour < b.datetimeHour ? 1 : a.datetimeHour > b.datetimeHour ? -1 : b.count - a.count))
    .slice(0, RECENT_ROWS_LIMIT)
    .map((r) => ({
      domain: unreverseDomain(r.queryNameReversed),
      decision: r.resolverDecision,
      count: r.count,
      hour: r.datetimeHour,
    }));

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    totals: summary.totals,
    topBlocked: summary.topBlocked,
    topAllowed: summary.topAllowed,
    hourly: summary.hourly,
    recent,
  };
};
