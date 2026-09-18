// Bảng map các tính năng bảo vệ kiểu NextDNS Threat Protection sang
// Cloudflare Gateway "Security Categories" (dns.security_category).
//
// Mỗi category dưới đây tương ứng với một ID category có sẵn của Cloudflare
// (KHÔNG cần tự sưu tầm domain — Cloudflare tự phân loại theo threat intel
// của họ, giống cách NextDNS tự phân loại theo threat intel của họ).
//
// Nguồn ID category: Cloudflare Gateway API `GET /accounts/{id}/gateway/categories`
// hoặc https://developers.cloudflare.com/cloudflare-one/policies/gateway/domain-categories/

/**
 * @typedef {object} SecurityCategoryDef
 * @property {number} id Cloudflare security category ID
 * @property {string} label Tên tiếng Việt hiển thị (khớp ảnh chụp NextDNS)
 * @property {string} envVar Biến env bật/tắt (mặc định bật nếu không set = "0")
 */

/** @type {SecurityCategoryDef[]} */
export const SECURITY_CATEGORIES = [
  { id: 80, label: "Nguồn tin về mối đe dọa (Malware)", envVar: "BLOCK_MALWARE" },
  { id: 83, label: "Phát hiện mối đe dọa bằng AI / lừa đảo (Phishing)", envVar: "BLOCK_PHISHING" },
  { id: 121, label: "Đào tiền mã hóa trái phép (CryptoJacking)", envVar: "BLOCK_CRYPTOJACKING" },
  { id: 151, label: "DNS rebinding", envVar: "BLOCK_DNS_REBINDING" },
  { id: 150, label: "Giả mạo IDN (IDN Homograph)", envVar: "BLOCK_IDN_HOMOGRAPH" },
  { id: 152, label: "Lỗi gõ tên miền (Typosquatting)", envVar: "BLOCK_TYPOSQUATTING" },
  { id: 146, label: "Thuật toán tạo tên miền (DGA)", envVar: "BLOCK_DGA" },
  { id: 153, label: "Tên miền mới đăng ký (Newly Registered Domains)", envVar: "BLOCK_NEWLY_REGISTERED" },
  { id: 129, label: "Điểm cuối đường hầm (DNS Tunneling)", envVar: "BLOCK_DNS_TUNNELING" },
  { id: 141, label: "Dịch vụ chia sẻ và thu thập dữ liệu (Spyware)", envVar: "BLOCK_SPYWARE" },
  { id: 128, label: "Cổng truy cập web phi tập trung (Anonymizer)", envVar: "BLOCK_ANONYMIZER" },
];

// Các category Cloudflare LUÔN chặn cứng, không tắt được qua policy
// (không cần rule riêng — liệt kê ở đây chỉ để hiển thị/ghi log cho rõ):
export const ALWAYS_ON_CATEGORIES = [
  { id: 127, label: "Nội dung xâm hại tình dục trẻ em (CSAM)" },
];

// Các toggle trong ảnh KHÔNG có category tương đương sẵn trên Cloudflare
// Gateway — cần tự đẩy domain list (giống cơ chế blocklist hiện tại của repo)
// thay vì bật qua security category:
export const UNMAPPED_TOGGLES = [
  "Tên miền lưu trữ web miễn phí",
  "Tên miền đỏ",
  "Tên miền cấp cao nhất (TLD) nguy hiểm",
  "Tên máy chủ DNS động",
];

/**
 * Đọc trạng thái bật/tắt từng category từ biến môi trường.
 * Mặc định TẤT CẢ đều bật (giống NextDNS mặc định bật hầu hết toggle),
 * trừ khi env var tương ứng được set = "0".
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ id: number, label: string, enabled: boolean }[]}
 */
export const resolveEnabledCategories = (env = process.env) =>
  SECURITY_CATEGORIES.map(({ id, label, envVar }) => ({
    id,
    label,
    enabled: env[envVar] !== "0",
  }));

/**
 * Trả về danh sách ID category đang bật, để build vào expression rule.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number[]}
 */
export const enabledCategoryIds = (env = process.env) =>
  resolveEnabledCategories(env)
    .filter((c) => c.enabled)
    .map((c) => c.id);
