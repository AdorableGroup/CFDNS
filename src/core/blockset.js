import { getRootDomain } from "./domain.js";

/**
 * Smart deduplication set with parent-domain pruning.
 *
 * Rules:
 *  - Skip a domain if it (or a parent of it) is allowlisted.
 *  - Skip a domain if a parent of it is already blocked (redundant — already covered).
 *  - When a broader parent domain is added, prune any narrower subdomains
 *    already stored, since the parent now covers them.
 *
 * This yields the minimal domain set covering the same block surface,
 * maximizing use of Cloudflare's list-item slot limit.
 *
 * @param {Set<string>} allowSet Exact allowlisted domains (their subtrees are protected too).
 */
export const createSmartBlockSet = (allowSet = new Set()) => {
  const blocked = new Set();
  // rootDomain -> Set of subdomains currently stored under it (for pruning)
  const subIndex = new Map();

  /** @param {string} domain */
  const checkDomain = (domain) => {
    if (allowSet.has(domain)) return { allowed: true, redundant: false };
    const parts = domain.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(i).join(".");
      if (allowSet.has(parent)) return { allowed: true, redundant: false };
      if (blocked.has(parent)) return { allowed: false, redundant: true };
    }
    return { allowed: false, redundant: false };
  };

  /** @param {string} domain */
  const indexSubdomain = (domain) => {
    const root = getRootDomain(domain);
    if (!subIndex.has(root)) subIndex.set(root, new Set());
    subIndex.get(root).add(domain);
  };

  /** @param {string} domain */
  const pruneSubdomains = (domain) => {
    const root = getRootDomain(domain);
    const subs = subIndex.get(root);
    if (!subs) return;
    for (const sub of subs) {
      if (sub !== domain && sub.endsWith(`.${domain}`)) {
        blocked.delete(sub);
        subs.delete(sub);
      }
    }
  };

  return {
    /**
     * @param {string} domain
     * @returns {boolean} true if added, false if skipped (allowed or redundant).
     */
    add(domain) {
      if (!domain || blocked.has(domain)) return false;
      const { allowed, redundant } = checkDomain(domain);
      if (allowed || redundant) return false;
      pruneSubdomains(domain);
      blocked.add(domain);
      indexSubdomain(domain);
      return true;
    },
    getAll: () => Array.from(blocked),
    size: () => blocked.size,
  };
};
