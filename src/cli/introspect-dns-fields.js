import { createClient, runCommand } from "./shared.js";

// Chạy 1 lần để xem CHÍNH XÁC field nào khả dụng trên tài khoản Cloudflare
// của bạn cho gatewayResolverQueriesAdaptiveGroups (ASN, IP nguồn, quốc
// gia, thiết bị, DNSSEC...). Dùng: npm run introspect-dns-fields
// Kết quả in ra console — không ghi gì vào dns-logs.json hay report.json.
await runCommand("introspect-dns-fields", async () => {
  const client = createClient();
  const fields = await client.introspectDnsLogDimensions();
  console.log(`\nCác dimension khả dụng trên gatewayResolverQueriesAdaptiveGroups (${fields.length}):\n`);
  for (const f of fields) {
    console.log(`  ${f.name}${f.description ? ` — ${f.description}` : ""}`);
  }
  console.log("\nDùng đúng tên field ở trên khi bổ sung vào queryDnsLogs() trong gateway-client.js.");
  return { fieldCount: fields.length };
});
