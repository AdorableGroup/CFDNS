import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadSources } from "../src/pipeline/fetch-sources.js";

const GOOD = Array.from({ length: 40 }, (_, i) => `ads${i}.example.com`).join("\n");

describe("downloadSources", () => {
  let server;
  let base;
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/good") return res.end(GOOD);
      if (req.url === "/html") return res.end("<!DOCTYPE html><html><body>" + "x".repeat(400) + "</body></html>");
      if (req.url === "/tiny") return res.end("a.com");
      res.statusCode = 404;
      res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  test("concatenates sources and overwrites (never appends to) an existing file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "dl-")), "out.txt");
    writeFileSync(file, "stale.example.com\n");
    await downloadSources(file, [`${base}/good`, `${base}/good`]);
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("stale.example.com"));
    assert.equal(text.split("\n").filter((l) => l === "ads0.example.com").length, 2);
  });

  test("rejects HTML error pages and near-empty bodies", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "dl-")), "out.txt");
    await assert.rejects(downloadSources(file, [`${base}/html`]), /empty or invalid/);
    await assert.rejects(downloadSources(file, [`${base}/tiny`]), /empty or invalid/);
  });

  test("fails fast on permanent 4xx", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "dl-")), "out.txt");
    await assert.rejects(downloadSources(file, [`${base}/missing`]), /404/);
  });
});
