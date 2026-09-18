import dotenv from "dotenv";

dotenv.config();

if (process.env.CLOUDFLARE_API_KEY) {
  console.warn(
    "Using a Global API Key is risky. An API Token with scoped permissions is strongly recommended instead."
  );
}

// ─── Default sources ────────────────────────────────────────────────────
// Allowlist: protects banks, CDNs, OS/browser update endpoints, Discord,
// URL shorteners, and known false-positive domains from being blocked.
const DEFAULT_ALLOWLIST_URLS = [
  "https://raw.githubusercontent.com/sakib-m/Pi-hole-Torrent-Blocklist/main/all-torrent-trackers.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/banks.txt",
  "https://raw.githubusercontent.com/Dogino/Discord-Phishing-URLs/main/official-domains.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/mac.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/windows.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/firefox.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/android.txt",
  "https://raw.githubusercontent.com/boutetnico/url-shorteners/master/list.txt",
  "https://raw.githubusercontent.com/TogoFire-Home/AD-Settings/main/Filters/whitelist.txt",
  "https://raw.githubusercontent.com/DandelionSprout/AdGuard-Home-Whitelist/master/whitelist.txt",
  "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/exclusions.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/issues.txt",
];

// Blocklist priority order (first = kept first if the 300k slot limit is hit):
// 1. OISD Big — broadest coverage, near-zero false positives, official source
// 2. YouTube/video ads (auto-playing video ads, pre-roll) — small, curated
const DEFAULT_BLOCKLIST_URLS = [
  "https://big.oisd.nl/domainswild",
  "https://raw.githubusercontent.com/kboghdady/youTube_ads_4_pi-hole/master/youtubelist.txt",
];

export const config = {
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    apiKey: process.env.CLOUDFLARE_API_KEY,
    accountEmail: process.env.CLOUDFLARE_ACCOUNT_EMAIL,
  },
  listItemLimit: Number.isNaN(parseInt(process.env.CLOUDFLARE_LIST_ITEM_LIMIT, 10))
    ? 300_000
    : parseInt(process.env.CLOUDFLARE_LIST_ITEM_LIMIT, 10),
  dryRun: process.env.DRY_RUN === "1",
  deletionEnabled: process.env.CGPS_DELETION_ENABLED === "true",
  blockPageEnabled: process.env.BLOCK_PAGE_ENABLED === "1",
  blockBasedOnSni: process.env.BLOCK_BASED_ON_SNI === "1",
  files: {
    allowlist: "allowlist.txt",
    blocklist: "blocklist.txt",
    report: "report.json",
    dnsLogs: "dns-logs.json",
  },
  dnsLogWindowHours: Number.isNaN(parseInt(process.env.DNS_LOG_WINDOW_HOURS, 10))
    ? 24
    : parseInt(process.env.DNS_LOG_WINDOW_HOURS, 10),
  allowlistUrls: process.env.ALLOWLIST_URLS
    ? process.env.ALLOWLIST_URLS.split("\n").filter(Boolean)
    : DEFAULT_ALLOWLIST_URLS,
  blocklistUrls: process.env.BLOCKLIST_URLS
    ? process.env.BLOCKLIST_URLS.split("\n").filter(Boolean)
    : DEFAULT_BLOCKLIST_URLS,
};
