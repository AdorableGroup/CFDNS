import { config } from "../config.js";
import { deleteAllManagedLists } from "../pipeline/sync-lists.js";
import { deleteAllManagedRules } from "../pipeline/sync-rules.js";
import { createClient, runCommand } from "./shared.js";

if (!config.deletionEnabled) {
  console.warn(
    'Deletion is disabled by default. Set CGPS_DELETION_ENABLED=true and re-run to delete all managed lists and rules. Exiting.'
  );
  process.exit(0);
}

await runCommand("teardown", async () => {
  const client = createClient();
  const rulesDeleted = await deleteAllManagedRules(client);
  const listsDeleted = await deleteAllManagedLists(client);
  return { rulesDeleted, listsDeleted };
});
