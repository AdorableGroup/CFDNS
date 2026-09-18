import { config } from "../config.js";
import { defragment } from "../pipeline/defragment.js";
import { createClient, runCommand } from "./shared.js";

await runCommand("defragment", () =>
  defragment(createClient(), { blockBasedOnSni: config.blockBasedOnSni })
);
