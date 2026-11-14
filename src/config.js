import dotenv from "dotenv";

dotenv.config();

if (process.env.CLOUDFLARE_API_KEY) {
  console.warn(
    "Using a Global API Key is risky. An API Token with scoped permissions is strongly recommended instead."
  );
}

// ─── Default sources ────────────────────────────────────────────────────
// Allowlist: chỉ giữ những gì thực sự cần để không làm hỏng ngân hàng, bản cập
// nhật OS/trình duyệt và Discord. (Đã bỏ danh sách tracker torrent và danh sách
// rút gọn link — chúng đưa domain tracker/redirect vào allowlist, làm yếu việc chặn.)
const DEFAULT_ALLOWLIST_URLS = [
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/banks.txt",
  "https://raw.githubusercontent.com/Dogino/Discord-Phishing-URLs/main/official-domains.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/mac.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/windows.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/firefox.txt",
  "https://raw.githubusercontent.com/AdguardTeam/HttpsExclusions/master/exclusions/android.txt",
  "https://raw.githubusercontent.com/TogoFire-Home/AD-Settings/main/Filters/whitelist.txt",
  "https://raw.githubusercontent.com/DandelionSprout/AdGuard-Home-Whitelist/master/whitelist.txt",
];

// Blocklist theo thứ tự ưu tiên. Gói Free giới hạn 300k domain; nếu vượt, phần
// CUỐI danh sách bị cắt trước → để nguồn quan trọng/nhỏ lên đầu.
//  1. YouTube/video ads        — nhỏ, chọn lọc, luôn được giữ
//  2. OISD Big                 — quảng cáo + tracker + malware, ít false positive
//  3. HaGeZi Multi PRO         — bổ sung tracker/telemetry mà OISD bỏ sót
//                                (trùng nhiều với OISD → dedup chỉ giữ phần mới)
//  4. HaGeZi Threat Intel mini — malware/phishing/C2 đang hoạt động
// Dùng jsDelivr (CDN) thay vì raw.githubusercontent để tải nhanh/ổn định hơn.
const DEFAULT_BLOCKLIST_URLS = [
  "https://raw.githubusercontent.com/kboghdady/youTube_ads_4_pi-hole/master/youtubelist.txt",
  "https://big.oisd.nl/domainswild",
  "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/pro-onlydomains.txt",
  "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/tif.mini-onlydomains.txt",
];

/** Tách biến môi trường nhiều dòng/dấu phẩy thành mảng URL sạch. */
const parseUrlList = (value) =>
  value
    ? value
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

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
  // Chặn sync nếu số domain thấp bất thường (nguồn lỗi/cắt cụt) để không xoá nhầm danh sách.
  minDomains: Number.isNaN(parseInt(process.env.MIN_DOMAINS, 10)) ? 50_000 : parseInt(process.env.MIN_DOMAINS, 10),
  dryRun: process.env.DRY_RUN === "1",
  deletionEnabled: (process.env.WIWIE_DELETION_ENABLED ?? process.env.CGPS_DELETION_ENABLED) === "true",
  blockPageEnabled: process.env.BLOCK_PAGE_ENABLED === "1",
  files: {
    allowlist: "allowlist.txt",
    blocklist: "blocklist.txt",
    report: "report.json",
    dnsLogs: "dns-logs.json",
  },
  dnsLogWindowHours: Number.isNaN(parseInt(process.env.DNS_LOG_WINDOW_HOURS, 10))
    ? 24
    : parseInt(process.env.DNS_LOG_WINDOW_HOURS, 10),
  allowlistUrls: parseUrlList(process.env.ALLOWLIST_URLS) ?? DEFAULT_ALLOWLIST_URLS,
  blocklistUrls: parseUrlList(process.env.BLOCKLIST_URLS) ?? DEFAULT_BLOCKLIST_URLS,
  contentCategoryIds: (process.env.BLOCK_CONTENT_CATEGORY_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter(Number.isInteger),
};
