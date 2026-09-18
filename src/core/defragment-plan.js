const CHUNK_SIZE = 1000;

/**
 * Plans a defragmentation: given all entries across the managed chunk lists
 * (each tagged with which list it currently lives in and when it was added),
 * sorts by add-time (oldest first, domain as tiebreaker) and reassigns them
 * to lists in that order. Older/more-stable domains end up in the earliest
 * lists, so future syncs only need to touch the last list or two.
 *
 * Pure — no network calls. Returns per-list patches plus which lists end up
 * empty (safe to delete) vs non-empty.
 *
 * @param {{ id: string, name: string }[]} chunkLists Sorted by chunk number ascending.
 * @param {{ value: string, description: string, originListId: string }[]} allEntries
 * @param {string} nowIso Fallback timestamp for entries with an invalid description.
 */
export const planDefragment = (chunkLists, allEntries, nowIso) => {
  const normalized = allEntries.map((entry) => ({
    ...entry,
    description: Number.isNaN(Date.parse(entry.description)) ? nowIso : entry.description,
  }));

  normalized.sort((a, b) => {
    const diff = Date.parse(a.description) - Date.parse(b.description);
    return diff !== 0 ? diff : a.value.localeCompare(b.value);
  });

  const assigned = normalized.map((entry, index) => {
    const listIndex = Math.floor(index / CHUNK_SIZE);
    const assignedListId = chunkLists[listIndex]?.id;
    if (!assignedListId) {
      throw new Error(`Cannot resolve target list for entry ${index}; only ${chunkLists.length} lists available.`);
    }
    return { ...entry, assignedListId };
  });

  const moves = assigned.filter((e) => e.originListId !== e.assignedListId);

  const patches = new Map();
  for (const { originListId, assignedListId, value, description } of moves) {
    if (!patches.has(originListId)) patches.set(originListId, { append: [], remove: [] });
    patches.get(originListId).remove.push(value);

    if (!patches.has(assignedListId)) patches.set(assignedListId, { append: [], remove: [] });
    patches.get(assignedListId).append.push({ value, description });
  }

  const usedListIds = new Set(assigned.map((e) => e.assignedListId));
  const emptyLists = chunkLists.filter((l) => !usedListIds.has(l.id));
  const nonEmptyLists = chunkLists.filter((l) => usedListIds.has(l.id));

  return {
    patches,
    emptyLists,
    nonEmptyLists,
    stats: {
      totalEntries: normalized.length,
      chunks: chunkLists.length,
      movedEntries: moves.length,
      patchedLists: patches.size,
      emptyLists: emptyLists.length,
      nonEmptyLists: nonEmptyLists.length,
    },
  };
};
