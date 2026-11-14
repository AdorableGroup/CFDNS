import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { createFetchWithRetry } from "../cloudflare/http.js";

const REQUEST_TIMEOUT_MS = 60_000;
const fetchRetry = createFetchWithRetry(undefined, { timeoutMs: REQUEST_TIMEOUT_MS });
const MIN_PLAUSIBLE_BYTES = 200;

/**
 * Downloads source URLs sequentially (không dồn dập server) và nối vào một file.
 * - Ghi đè file cũ (không append) để chạy lại không bị trùng lặp.
 * - Mỗi request có timeout riêng.
 * - Từ chối nguồn rỗng / trang HTML lỗi: nếu không, một nguồn hỏng sẽ lặng lẽ
 *   khiến sync XOÁ hàng nghìn domain khỏi Cloudflare.
 * @param {string} filePath
 * @param {string[]} urls
 * @returns {Promise<{ url: string, bytes: number }[]>}
 */
export const downloadSources = async (filePath, urls) => {
  const writeStream = createWriteStream(filePath, { flags: "w" });
  writeStream.setMaxListeners(urls.length + 5);
  const summary = [];
  try {
    for (const url of urls) {
      const response = await fetchRetry(url);
      const body = Buffer.from(await response.arrayBuffer());
      const head = body.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
      if (body.length < MIN_PLAUSIBLE_BYTES || head.startsWith("<!doctype") || head.startsWith("<html")) {
        throw new Error(`Source looks empty or invalid (${body.length} bytes): ${url}`);
      }
      writeStream.write(body);
      writeStream.write("\n");
      summary.push({ url, bytes: body.length });
      console.log(`  ✓ ${url} (${(body.length / 1024).toFixed(0)} KB)`);
    }
  } finally {
    writeStream.end();
    await once(writeStream, "close");
  }
  return summary;
};

/**
 * Reads a file line by line, invoking `onLine(line, rl)` for each.
 * Call `rl.close()` from the callback to stop early.
 * @param {string} filePath
 * @param {(line: string, rl: ReturnType<typeof createInterface>) => void} onLine
 */
export const forEachLine = async (filePath, onLine) => {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  rl.on("line", (line) => onLine(line, rl));
  await once(rl, "close");
};
