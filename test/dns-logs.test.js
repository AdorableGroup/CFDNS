import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  unreverseDomain,
  decisionLabel,
  isBlockedDecision,
  summarizeDnsLogs,
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
