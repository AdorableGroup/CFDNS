/**
 * Pure diffing logic for reconciling a desired domain set against the
 * current state of Cloudflare Gateway lists, chunked at `chunkSize` items each.
 *
 * Given the current lists (id + domain values) and the desired domain set,
 * produces per-list PATCH bodies ({ append, remove }) plus any leftover
 * domains that need brand-new lists created for them.
 *
 * No network calls here — this only computes *what* needs to change so the
 * caller can apply it and this logic stays trivially testable.
 *
 * @param {{ id: string, name: string, domains: string[] }[]} currentLists
 * @param {string[]} desiredDomains
 * @param {number} chunkSize Max items per list (Cloudflare list-item slot size).
 * @param {string} nowIso Timestamp used as the "added" marker for new items.
 */
export const diffLists = (currentLists, desiredDomains, chunkSize, nowIso) => {
  const desiredSet = new Set(desiredDomains);

  // domain -> listId, for every domain currently present in any list
  const currentByDomain = new Map();
  for (const list of currentLists) {
    for (const domain of list.domains) currentByDomain.set(domain, list.id);
  }

  // Entries present now but not desired anymore -> remove, grouped by list
  const toRemoveByList = new Map();
  for (const [domain, listId] of currentByDomain) {
    if (!desiredSet.has(domain)) {
      if (!toRemoveByList.has(listId)) toRemoveByList.set(listId, []);
      toRemoveByList.get(listId).push(domain);
    }
  }

  // Entries desired but not currently present anywhere -> queue for appending
  const toAdd = desiredDomains.filter((d) => !currentByDomain.has(d));

  const listSizes = new Map(currentLists.map((l) => [l.id, l.domains.length]));
  const patches = new Map();

  const takeAppendChunk = (spaceInList) =>
    toAdd
      .splice(0, Math.max(0, spaceInList))
      .map((value) => ({ value, description: nowIso }));

  // First, fill the gaps opened up by removals
  for (const [listId, remove] of toRemoveByList) {
    const spaceInList = chunkSize - (listSizes.get(listId) - remove.length);
    const append = takeAppendChunk(spaceInList);
    patches.set(listId, { remove, append });
  }

  // Then use any remaining free space in untouched lists
  if (toAdd.length) {
    for (const list of currentLists) {
      if (patches.has(list.id)) continue;
      const spaceInList = chunkSize - listSizes.get(list.id);
      if (spaceInList <= 0) continue;
      const append = takeAppendChunk(spaceInList);
      if (append.length) patches.set(list.id, { append });
    }
  }

  // Whatever's left needs brand-new lists
  const newListChunks = [];
  for (let i = 0; i < toAdd.length; i += chunkSize) {
    newListChunks.push(toAdd.slice(i, i + chunkSize));
  }

  return { patches, newListChunks };
};
