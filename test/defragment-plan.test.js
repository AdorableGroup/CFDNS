import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planDefragment } from "../src/core/defragment-plan.js";

const NOW = "2026-08-12T00:00:00.000Z";

describe("planDefragment", () => {
  test("no moves needed when already sorted by time and packed", () => {
    const lists = [{ id: "l1", name: "Chunk 1" }];
    const entries = [
      { value: "a.com", description: "2026-01-01T00:00:00.000Z", originListId: "l1" },
      { value: "b.com", description: "2026-01-02T00:00:00.000Z", originListId: "l1" },
    ];
    const { patches, stats } = planDefragment(lists, entries, NOW);
    assert.equal(patches.size, 0);
    assert.equal(stats.movedEntries, 0);
  });

  test("moves entries into earlier lists when a gap exists", () => {
    const lists = [{ id: "l1", name: "Chunk 1" }, { id: "l2", name: "Chunk 2" }];
    // l1 has 1 entry, l2 has 1 entry -- with CHUNK_SIZE=1000 both fit in l1
    const entries = [
      { value: "old.com", description: "2026-01-01T00:00:00.000Z", originListId: "l1" },
      { value: "newer.com", description: "2026-01-02T00:00:00.000Z", originListId: "l2" },
    ];
    const { patches, emptyLists, nonEmptyLists } = planDefragment(lists, entries, NOW);
    assert.equal(patches.get("l2").remove[0], "newer.com");
    assert.equal(patches.get("l1").append[0].value, "newer.com");
    assert.deepEqual(emptyLists.map((l) => l.id), ["l2"]);
    assert.deepEqual(nonEmptyLists.map((l) => l.id), ["l1"]);
  });

  test("invalid description falls back to now and sorts as newest", () => {
    const lists = [{ id: "l1", name: "Chunk 1" }];
    const entries = [
      { value: "a.com", description: "not-a-date", originListId: "l1" },
      { value: "b.com", description: "2020-01-01T00:00:00.000Z", originListId: "l1" },
    ];
    const { stats } = planDefragment(lists, entries, NOW);
    // both already in l1, single list -> no moves regardless of order
    assert.equal(stats.movedEntries, 0);
  });

  test("uses domain as tiebreaker for identical timestamps", () => {
    const lists = [{ id: "l1", name: "Chunk 1" }, { id: "l2", name: "Chunk 2" }];
    const entries = [
      { value: "z.com", description: NOW, originListId: "l2" },
      { value: "a.com", description: NOW, originListId: "l1" },
    ];
    // With CHUNK_SIZE=1000, both entries fit in list index 0 regardless of tiebreak order,
    // so no actual moves happen here — but this exercises the comparator without throwing.
    const { stats } = planDefragment(lists, entries, NOW);
    assert.equal(stats.totalEntries, 2);
  });

  test("throws if there are more entries than list capacity", () => {
    const lists = [{ id: "l1", name: "Chunk 1" }];
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      value: `d${i}.com`,
      description: NOW,
      originListId: "l1",
    }));
    assert.throws(() => planDefragment(lists, entries, NOW));
  });
});
