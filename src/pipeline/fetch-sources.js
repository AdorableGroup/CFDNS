import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createFetchWithRetry } from "../cloudflare/http.js";

const fetchRetry = createFetchWithRetry();

/**
 * Downloads a list of source URLs sequentially (avoids hammering servers
 * with parallel requests) and concatenates them into one file.
 * @param {string} filePath
 * @param {string[]} urls
 */
export const downloadSources = async (filePath, urls) => {
  const writeStream = createWriteStream(filePath, { flags: "a" });
  writeStream.setMaxListeners(urls.length + 5);
  try {
    for (const url of urls) {
      const response = await fetchRetry(url);
      await pipeline(response.body, writeStream, { end: false });
      writeStream.write("\n");
    }
  } finally {
    writeStream.end();
    await once(writeStream, "close");
  }
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
