import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  unreverseDomain,
  decisionLabel,
  isBlockedDecision,
  summarizeDnsLogs,
  rootDomain,
  gafamOwner,
  summarizeRootDomains,
} from "../src/core/dns-logs.js";

describe("unreverseDomain", () => {
  test("reverses label order back to normal", () => {
    assert.equal(unreverseDomain("com.example.www"), "www.example.com");
    assert.equal(unreverseDomain("com.example"), "example.com");
  });
  test("handles empty/null input without throwing", () => {
    assert.equal(unreverseDomain(""), "");
    assert.equal(unreverseDomain(null), null);
  });
});

describe("decisionLabel", () => {
  test("maps known decisions to Vietnamese labels", () => {
    assert.equal(decisionLabel("block"), "Bị chặn");
    assert.equal(decisionLabel("allow"), "Cho phép");
  });
  test("passes through unknown decisions unchanged", () => {
    assert.equal(decisionLabel("some_new_decision"), "some_new_decision");
  });
});

describe("isBlockedDecision", () => {
  test("only 'block' counts as blocked", () => {
    assert.equal(isBlockedDecision("block"), true);
    assert.equal(isBlockedDecision("allow"), false);
    assert.equal(isBlockedDecision("override"), false);
  });
});

describe("summarizeDnsLogs", () => {
  const rows = [
    { count: 100, queryNameReversed: "com.ads.example", resolverDecision: "block", datetimeHour: "2026-08-12T00:00:00Z" },
    { count: 50, queryNameReversed: "com.ads.example", resolverDecision: "block", datetimeHour: "2026-08-12T01:00:00Z" },
    { count: 30, queryNameReversed: "com.tracker.example", resolverDecision: "block", datetimeHour: "2026-08-12T00:00:00Z" },
    { count: 200, queryNameReversed: "com.google.www", resolverDecision: "allow", datetimeHour: "2026-08-12T00:00:00Z" },
  ];

  test("aggregates top blocked domains across hours, un-reversed and sorted", () => {
    const { topBlocked } = summarizeDnsLogs(rows, 10);
    assert.equal(topBlocked[0].domain, "example.ads.com");
    assert.equal(topBlocked[0].count, 150);
    assert.equal(topBlocked[1].domain, "example.tracker.com");
    assert.equal(topBlocked[1].count, 30);
  });

  test("aggregates top allowed domains separately from blocked", () => {
    const { topAllowed } = summarizeDnsLogs(rows, 10);
    assert.equal(topAllowed.length, 1);
    assert.equal(topAllowed[0].domain, "www.google.com");
    assert.equal(topAllowed[0].count, 200);
  });

  test("respects topN limit", () => {
    const { topBlocked } = summarizeDnsLogs(rows, 1);
    assert.equal(topBlocked.length, 1);
  });

  test("computes overall totals by decision", () => {
    const { totals } = summarizeDnsLogs(rows);
    assert.equal(totals.block, 180);
    assert.equal(totals.allow, 200);
    assert.equal(totals.other, 0);
  });

  test("buckets unknown decisions into 'other'", () => {
    const withOther = [...rows, { count: 5, queryNameReversed: "com.foo", resolverDecision: "isolate", datetimeHour: "2026-08-12T00:00:00Z" }];
    const { totals } = summarizeDnsLogs(withOther);
    assert.equal(totals.other, 5);
  });

  test("builds hourly buckets sorted chronologically", () => {
    const { hourly } = summarizeDnsLogs(rows);
    assert.equal(hourly.length, 2);
    assert.equal(hourly[0].hour, "2026-08-12T00:00:00Z");
    assert.equal(hourly[0].block, 130);
    assert.equal(hourly[0].allow, 200);
    assert.equal(hourly[1].hour, "2026-08-12T01:00:00Z");
    assert.equal(hourly[1].block, 50);
  });

  test("empty input returns empty aggregates without throwing", () => {
    const result = summarizeDnsLogs([]);
    assert.deepEqual(result.topBlocked, []);
    assert.deepEqual(result.topAllowed, []);
    assert.deepEqual(result.hourly, []);
    assert.equal(result.totals.block, 0);
  });
});

describe("rootDomain", () => {
  test("keeps a bare two-label domain unchanged", () => {
    assert.equal(rootDomain("google.com"), "google.com");
  });
  test("strips subdomains down to the last two labels by default", () => {
    assert.equal(rootDomain("a.root-servers.net"), "root-servers.net");
    assert.equal(rootDomain("ads-platform.zalo.me"), "zalo.me");
  });
  test("keeps known multi-part public suffixes intact", () => {
    assert.equal(rootDomain("ns-global-dual.rtc.viettelttami.vn"), "viettelttami.vn");
    assert.equal(rootDomain("www.example.co.uk"), "example.co.uk");
  });
  test("handles empty/null input without throwing", () => {
    assert.equal(rootDomain(""), "");
    assert.equal(rootDomain(null), null);
  });
});

describe("gafamOwner", () => {
  test("matches known GAFAM root domains", () => {
    assert.equal(gafamOwner("google.com"), "Google");
    assert.equal(gafamOwner("googlevideo.com"), "Google");
    assert.equal(gafamOwner("facebook.com"), "Meta");
    assert.equal(gafamOwner("microsoft.com"), "Microsoft");
    assert.equal(gafamOwner("apple.com"), "Apple");
    assert.equal(gafamOwner("amazonaws.com"), "Amazon");
  });
  test("returns null for non-GAFAM domains", () => {
    assert.equal(gafamOwner("shopee.vn"), null);
    assert.equal(gafamOwner("zalo.me"), null);
  });
});

describe("summarizeRootDomains", () => {
  const domainCounts = [
    { domain: "www.google.com", count: 100 },
    { domain: "googleads.g.doubleclick.net", count: 50 },
    { domain: "ads-platform.zalo.me", count: 30 },
    { domain: "shopee.vn", count: 20 },
  ];

  test("rolls up subdomains into their root domain", () => {
    const { topRootDomains } = summarizeRootDomains(domainCounts, 10);
    const google = topRootDomains.find((d) => d.domain === "google.com");
    assert.equal(google.count, 100);
  });

  test("computes GAFAM percentage breakdown against grand total", () => {
    const { gafamBreakdown, grandTotal } = summarizeRootDomains(domainCounts, 10);
    assert.equal(grandTotal, 200);
    const google = gafamBreakdown.find((g) => g.owner === "Google");
    assert.equal(google.count, 150); // google.com + doubleclick.net
    assert.equal(google.percent, 75);
    const other = gafamBreakdown.find((g) => g.owner === "Khác");
    assert.equal(other.count, 50);
  });

  test("empty input returns empty aggregates without throwing", () => {
    const result = summarizeRootDomains([]);
    assert.deepEqual(result.topRootDomains, []);
    assert.deepEqual(result.gafamBreakdown, []);
    assert.equal(result.grandTotal, 0);
  });
});
