import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isValidDomain, getRootDomain, normalizeLine } from "../src/core/domain.js";

describe("isValidDomain", () => {
  test("accepts plain domains", () => {
    assert.equal(isValidDomain("example.com"), true);
    assert.equal(isValidDomain("sub.example.co.uk"), true);
  });
  test("rejects garbage", () => {
    assert.equal(isValidDomain("not a domain"), false);
    assert.equal(isValidDomain(""), false);
    assert.equal(isValidDomain("*.example.com"), false);
  });
  test("accepts labels with runs of hyphens (e.g. Google edge hostnames)", () => {
    assert.equal(isValidDomain("r1---sn-n4v7knlz.googlevideo.com"), true);
    assert.equal(isValidDomain("r1---sn-uhvcpax0n5-no5s.googlevideo.com"), true);
  });
  test("still rejects labels starting or ending with a hyphen", () => {
    assert.equal(isValidDomain("-bad.com"), false);
    assert.equal(isValidDomain("bad-.com"), false);
  });
});

describe("getRootDomain", () => {
  test("strips subdomains for standard TLDs", () => {
    assert.equal(getRootDomain("ads.example.com"), "example.com");
  });
  test("handles two-level TLDs", () => {
    assert.equal(getRootDomain("ads.sub.example.co.uk"), "example.co.uk");
    assert.equal(getRootDomain("shop.example.com.vn"), "example.com.vn");
  });
  test("leaves bare domains alone", () => {
    assert.equal(getRootDomain("example.com"), "example.com");
  });
});

describe("normalizeLine", () => {
  test("plain domain", () => {
    assert.equal(normalizeLine("example.com"), "example.com");
  });
  test("hosts-file format", () => {
    assert.equal(normalizeLine("0.0.0.0 ads.example.com"), "ads.example.com");
    assert.equal(normalizeLine("127.0.0.1 ads.example.com"), "ads.example.com");
    assert.equal(normalizeLine("0.0.0.0 localhost"), null);
  });
  test("adblock format", () => {
    assert.equal(normalizeLine("||ads.example.com^"), "ads.example.com");
    assert.equal(normalizeLine("||*.ads.example.com^$important"), "ads.example.com");
  });
  test("wildcard format", () => {
    assert.equal(normalizeLine("*.ads.example.com"), "ads.example.com");
  });
  test("comments and blanks return null", () => {
    assert.equal(normalizeLine("# a comment"), null);
    assert.equal(normalizeLine("! adblock comment"), null);
    assert.equal(normalizeLine(""), null);
    assert.equal(normalizeLine("   "), null);
  });
  test("strips inline comments", () => {
    assert.equal(normalizeLine("example.com # note"), "example.com");
  });
  test("invalid domains return null", () => {
    assert.equal(normalizeLine("not a domain"), null);
  });
});
