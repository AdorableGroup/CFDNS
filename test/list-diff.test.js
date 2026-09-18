import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diffLists } from "../src/core/list-diff.js";

const NOW = "2026-08-12T00:00:00.000Z";

describe("diffLists", () => {
  test("no changes when desired matches current exactly", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: ["a.com", "b.com"] }];
    const { patches, newListChunks } = diffLists(current, ["a.com", "b.com"], 1000, NOW);
    assert.equal(patches.size, 0);
    assert.equal(newListChunks.length, 0);
  });

  test("removals only", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: ["a.com", "b.com"] }];
    const { patches } = diffLists(current, ["a.com"], 1000, NOW);
    assert.equal(patches.get("l1").remove.length, 1);
    assert.equal(patches.get("l1").remove[0], "b.com");
  });

  test("fills gaps left by removals with new additions before creating new lists", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: ["a.com"] }];
    const { patches, newListChunks } = diffLists(current, ["c.com"], 1, NOW);
    assert.equal(patches.get("l1").remove[0], "a.com");
    assert.equal(patches.get("l1").append[0].value, "c.com");
    assert.equal(newListChunks.length, 0);
  });

  test("uses spare capacity in untouched lists", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: ["a.com"] }];
    const { patches } = diffLists(current, ["a.com", "b.com"], 2, NOW);
    assert.equal(patches.get("l1").append[0].value, "b.com");
  });

  test("overflow spills into newListChunks", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: [] }];
    const { newListChunks } = diffLists(current, ["a.com", "b.com", "c.com"], 2, NOW);
    // l1 has 2 slots free, takes a.com + b.com; c.com overflows to new chunk
    assert.equal(newListChunks.length, 1);
    assert.deepEqual(newListChunks[0], ["c.com"]);
  });

  test("chunks overflow into multiple new lists respecting chunkSize", () => {
    const current = [];
    const desired = ["a.com", "b.com", "c.com", "d.com", "e.com"];
    const { newListChunks } = diffLists(current, desired, 2, NOW);
    assert.equal(newListChunks.length, 3);
    assert.deepEqual(newListChunks[0], ["a.com", "b.com"]);
    assert.deepEqual(newListChunks[1], ["c.com", "d.com"]);
    assert.deepEqual(newListChunks[2], ["e.com"]);
  });

  test("stamps new appends with the provided timestamp", () => {
    const current = [{ id: "l1", name: "Chunk 1", domains: [] }];
    const { patches } = diffLists(current, ["a.com"], 5, NOW);
    assert.equal(patches.get("l1").append[0].description, NOW);
  });
});
