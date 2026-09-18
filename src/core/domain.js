/**
 * Pure domain-parsing helpers. No I/O, no side effects — easy to unit test.
 */

// Each label: alphanumerics, allowing internal hyphens (including runs of
// hyphens, e.g. Google's "r1---sn-xxx.googlevideo.com" edge servers) but
// never starting or ending a label with one.
const DOMAIN_RE = /^\b((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-+[a-z0-9]+)*\.)+[a-z]{2,63}\b$/;

const TWO_LEVEL_TLDS = new Set([
  "co.uk", "co.nz", "co.za", "co.jp", "co.in", "co.id", "co.kr", "co.il",
  "com.au", "com.br", "com.cn", "com.mx", "com.ar", "com.vn", "com.sg", "com.ph", "com.hk", "com.my",
  "net.vn", "net.au", "net.br", "net.sg", "org.uk", "org.au", "org.vn", "org.nz",
  "gov.uk", "gov.au", "gov.vn", "gov.sg", "edu.vn", "edu.au", "edu.sg", "ac.uk", "ac.nz",
  "ne.jp", "or.jp", "ad.jp", "gr.jp",
]);

/** @param {string} value */
export const isValidDomain = (value) => DOMAIN_RE.test(value);

/**
 * Registrable root domain (eTLD+1). "ads.sub.example.co.uk" → "example.co.uk"
 * @param {string} domain
 * @returns {string}
 */
export const getRootDomain = (domain) => {
  const parts = domain.split(".");
  if (parts.length >= 3) {
    const candidate = `${parts.at(-2)}.${parts.at(-1)}`;
    if (TWO_LEVEL_TLDS.has(candidate)) return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
};

/** @param {string} value */
const isComment = (value) =>
  value.startsWith("#") || value.startsWith("//") || value.startsWith("!") ||
  value.startsWith("/*") || value.startsWith("*/");

/**
 * Normalizes a raw blocklist/allowlist line into a clean domain, or null if
 * the line is a comment / invalid. Supports hosts-file, AdBlock (||domain^),
 * wildcard (*.domain), and plain-domain formats.
 * @param {string} raw
 * @returns {string|null}
 */
export const normalizeLine = (raw) => {
  let line = raw.trim().toLowerCase();

  const commentIdx = line.indexOf(" #");
  if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();
  if (!line || isComment(line)) return null;

  if (line.startsWith("||")) {
    line = line.slice(2).split("^")[0].split("/")[0];
    if (line.startsWith("*.")) line = line.slice(2);
    return isValidDomain(line) ? line : null;
  }

  const hostsMatch = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
  if (hostsMatch) {
    const candidate = hostsMatch[1];
    if (candidate === "0.0.0.0" || candidate === "localhost" || candidate === "broadcasthost") return null;
    return isValidDomain(candidate) ? candidate : null;
  }

  if (line.startsWith("*.")) line = line.slice(2);
  return isValidDomain(line) ? line : null;
};
