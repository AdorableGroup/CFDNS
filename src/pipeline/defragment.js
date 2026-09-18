import { planDefragment } from "../core/defragment-plan.js";
import { LIST_NAME_PREFIX } from "./sync-lists.js";
import { upsertRule } from "./sync-rules.js";

const CHUNK_PREFIX = `${LIST_NAME_PREFIX} - Chunk `;

/**
 * Compacts managed chunk lists: consolidates churn into the fewest lists
 * possible, then deletes any lists left empty and rewrites the DNS/SNI
 * rules to reference only the surviving lists.
 *
 * @param {import("../cloudflare/gateway-client.js").GatewayClient} client
 * @param {{ blockBasedOnSni: boolean }} options
 */
export const defragment = async (client, { blockBasedOnSni }) => {
  console.log("Checking existing lists...");
  const { result: allLists } = await client.listLists();
  const chunkLists = (allLists ?? [])
    .filter((l) => l.name.startsWith(CHUNK_PREFIX))
    .sort((a, b) => parseInt(a.name.replace(CHUNK_PREFIX, ""), 10) - parseInt(b.name.replace(CHUNK_PREFIX, ""), 10));

  console.log(`Found ${chunkLists.length} chunk lists. Downloading entries...`);
  const allEntries = [];
  for (const list of chunkLists) {
    const { result: items } = await client.listItems(list.id);
    for (const item of items ?? []) {
      allEntries.push({ ...item, originListId: list.id });
    }
  }
  console.log(`Found ${allEntries.length} entries across ${chunkLists.length} lists.`);

  const { patches, emptyLists, nonEmptyLists, stats } = planDefragment(
    chunkLists,
    allEntries,
    new Date().toISOString()
  );

  console.log(`Planned ${patches.size} list patches, moving ${stats.movedEntries} entries.`);
  for (const [listId, patch] of patches) {
    const list = chunkLists.find((l) => l.id === listId);
    console.log(
      `Updating "${list.name}"` +
        (patch.append.length ? `, +${patch.append.length}` : "") +
        (patch.remove.length ? `, -${patch.remove.length}` : "")
    );
    await client.patchList(listId, patch);
  }

  if (emptyLists.length > 0) {
    console.log("Rewriting rules to reference the surviving lists...");
    await upsertRule(client, nonEmptyLists, "dns");
    if (blockBasedOnSni) await upsertRule(client, nonEmptyLists, "sni");

    console.log(`Deleting ${emptyLists.length} now-empty list(s)...`);
    for (const list of emptyLists) {
      console.log(`Deleting "${list.name}"...`);
      await client.deleteList(list.id);
    }
  } else {
    console.log("No lists were emptied — nothing to delete, rules unchanged.");
  }

  return stats;
};
