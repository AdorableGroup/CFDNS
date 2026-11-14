import { GatewayClient } from "../cloudflare/gateway-client.js";
import { config } from "../config.js";
import { appendReport } from "../pipeline/report.js";
import { notify } from "../pipeline/notify.js";

/** Builds a GatewayClient wired to notify the webhook when retries are exhausted. */
export const createClient = () =>
  new GatewayClient({ ...config.cloudflare, onGiveUp: notify });

/**
 * Runs a CLI command, reporting success/failure to report.json and the
 * webhook, and setting a non-zero exit code on failure.
 * @param {string} command
 * @param {() => Promise<object|void>} fn Returns stats to record on success.
 */
export const runCommand = async (command, fn) => {
  try {
    const stats = (await fn()) ?? {};
    appendReport(config.files.report, { status: "success", command, stats });
    await notify(`${command} finished successfully.`);
    console.log("Done.");
  } catch (error) {
    console.error(`Fatal error during "${command}":`, error);
    appendReport(config.files.report, { status: "error", command, error: String(error) });
    await notify(`${command} FAILED: ${error}`);
    process.exitCode = 1;
  }
};
