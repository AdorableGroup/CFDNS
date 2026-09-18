import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSmartBlockSet } from "../src/core/blockset.js";

describe("createSmartBlockSet", () => {
  test("adds unique domains", () => {
    const set = createSmartBlockSet();
    assert.equal(set.add("example.com"), true);
    assert.equal(set.add("other.com"), true);
    assert.equal(set.size(), 2);
  });

  test("rejects exact duplicates", () => {
    const set = createSmartBlockSet();
    set.add("example.com");
    assert.equal(set.add("example.com"), false);
    assert.equal(set.size(), 1);
  });

  test("skips subdomain when parent already blocked", () => {
    const set = createSmartBlockSet();
    set.add("example.com");
    assert.equal(set.add("ads.example.com"), false);
    assert.equal(set.size(), 1);
    assert.deepEqual(set.getAll(), ["example.com"]);
  });

  test("prunes existing subdomains when a broader parent is added later", () => {
    const set = createSmartBlockSet();
    set.add("ads.example.com");
    set.add("tracker.example.com");
    assert.equal(set.size(), 2);
    set.add("example.com");
    assert.equal(set.size(), 1);
    assert.deepEqual(set.getAll(), ["example.com"]);
  });

  test("respects allowlist for exact domain", () => {
    const set = createSmartBlockSet(new Set(["safe.com"]));
    assert.equal(set.add("safe.com"), false);
    assert.equal(set.size(), 0);
  });

  test("respects allowlist for subdomains of an allowed parent", () => {
    const set = createSmartBlockSet(new Set(["safe.com"]));
    assert.equal(set.add("cdn.safe.com"), false);
  });

  test("unrelated domains are unaffected by pruning", () => {
    const set = createSmartBlockSet();
    set.add("ads.example.com");
    set.add("other.com");
    set.add("example.com");
    assert.deepEqual(set.getAll().sort(), ["example.com", "other.com"]);
  });
});
