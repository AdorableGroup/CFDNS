import { diffLists } from "../core/list-diff.js";

const LIST_NAME_PREFIX = "CGPS List";
const CHUNK_NAME = (n) => `${LIST_NAME_PREFIX} - Chunk ${n}`;
const CHUNK_SIZE = 1000;

/**
 * Reconciles Cloudflare Gateway Zero Trust lists with a desired set of domains.
 * Fetches current lists sequentially (rate-limit friendly), computes the
 * minimal diff, applies patches, and creates new chunk lists for overflow.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {string[]} desiredDomains
 * @returns {Promise<{ listsUpdated: number, listsCreated: number, added: number, removed: number, totalDomains: number }>}
 */
export const syncLists = async (client, desiredDomains) => {
  console.log("Checking existing lists...");
  const { result: allLists } = await client.listLists();
  const managedLists = allLists?.filter((l) => l.name.startsWith(LIST_NAME_PREFIX)) ?? [];
  console.log(`Found ${managedLists.length} existing managed lists. Fetching items...`);

  const currentLists = [];
  for (const list of managedLists) {
    const { result: items, result_info } = await client.listItems(list.id);
    if (result_info.total_count > CHUNK_SIZE) {
      console.log(
        `List "${list.name}" has more than ${CHUNK_SIZE} entries — only reading the first ${CHUNK_SIZE}. Consider running a defragment.`
      );
    }
    currentLists.push({ id: list.id, name: list.name, domains: items?.map((i) => i.value) ?? [] });
  }

  const nowIso = new Date().toISOString();
  const { patches, newListChunks } = diffLists(currentLists, desiredDomains, CHUNK_SIZE, nowIso);

  let added = 0;
  let removed = 0;

  for (const [listId, patch] of patches) {
    const list = managedLists.find((l) => l.id === listId);
    added += patch.append?.length ?? 0;
    removed += patch.remove?.length ?? 0;
    console.log(
      `Updating "${list.name}"` +
        (patch.append?.length ? `, +${patch.append.length}` : "") +
        (patch.remove?.length ? `, -${patch.remove.length}` : "")
    );
    await client.patchList(listId, patch);
  }

  let listsCreated = 0;
  if (newListChunks.length) {
    const nextNumber =
      Math.max(
        0,
        ...managedLists
          .map((l) => parseInt(l.name.replace(`${LIST_NAME_PREFIX} - Chunk `, ""), 10))
          .filter(Number.isInteger)
      ) + 1;

    for (const [i, chunk] of newListChunks.entries()) {
      const name = CHUNK_NAME(nextNumber + i);
      const items = chunk.map((value) => ({ value, description: nowIso }));
      await client.createList(name, items);
      added += chunk.length;
      listsCreated++;
      console.log(`Created "${name}" (${chunk.length} domains)`);
    }
  }

  return {
    listsUpdated: patches.size,
    listsCreated,
    added,
    removed,
    totalDomains: desiredDomains.length,
  };
};

/**
 * Deletes all managed lists. Used by the delete/teardown CLI.
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 */
export const deleteAllManagedLists = async (client) => {
  const { result: allLists } = await client.listLists();
  const managedLists = allLists?.filter((l) => l.name.startsWith(LIST_NAME_PREFIX)) ?? [];
  for (const list of managedLists) {
    console.log(`Deleting "${list.name}"...`);
    await client.deleteList(list.id);
  }
  return managedLists.length;
};

export { LIST_NAME_PREFIX };
