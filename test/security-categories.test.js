import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SECURITY_CATEGORIES,
  resolveEnabledCategories,
  enabledCategoryIds,
} from "../src/core/security-categories.js";

describe("resolveEnabledCategories", () => {
  test("defaults every category to enabled when env is empty", () => {
    const result = resolveEnabledCategories({});
    assert.equal(result.length, SECURITY_CATEGORIES.length);
    assert.ok(result.every((c) => c.enabled === true));
  });

  test("disables a category when its env var is '0'", () => {
    const result = resolveEnabledCategories({ BLOCK_MALWARE: "0" });
    const malware = result.find((c) => c.label.includes("Malware"));
    assert.equal(malware.enabled, false);
    assert.ok(result.filter((c) => c.enabled).length === SECURITY_CATEGORIES.length - 1);
  });

  test("any other value keeps the category enabled", () => {
    const result = resolveEnabledCategories({ BLOCK_PHISHING: "false" });
    const phishing = result.find((c) => c.label.includes("Phishing"));
    assert.equal(phishing.enabled, true);
  });
});

describe("enabledCategoryIds", () => {
  test("returns all category ids by default", () => {
    const ids = enabledCategoryIds({});
    assert.equal(ids.length, SECURITY_CATEGORIES.length);
  });

  test("excludes ids whose env var is '0'", () => {
    const ids = enabledCategoryIds({ BLOCK_DGA: "0", BLOCK_SPYWARE: "0" });
    assert.equal(ids.length, SECURITY_CATEGORIES.length - 2);
  });

  test("returns empty array when everything disabled", () => {
    const env = Object.fromEntries(SECURITY_CATEGORIES.map((c) => [c.envVar, "0"]));
    assert.deepEqual(enabledCategoryIds(env), []);
  });
});
