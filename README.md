# DNS Sync Gateway

Đồng bộ danh sách chặn DNS (quảng cáo, tracker, malware) lên Cloudflare Gateway (Zero Trust), kèm dashboard theo dõi trạng thái mỗi lần chạy. Viết lại từ đầu theo kiến trúc layered, tách bạch pure logic khỏi I/O để dễ test và bảo trì.

## Kiến trúc

```
src/
  core/           Logic thuần (không I/O) — dễ unit test
    domain.js           chuẩn hoá/validate domain
    blockset.js          dedup + parent-domain pruning
    list-diff.js          tính diff giữa state hiện tại và mong muốn
    defragment-plan.js    lập kế hoạch dồn nén danh sách
    dns-logs.js            un-reverse domain + tổng hợp log DNS (top domain, theo giờ)

  cloudflare/     Tầng gọi API Cloudflare
    http.js              fetch với retry/backoff
    gateway-client.js     client bọc các endpoint lists/rules + GraphQL Analytics (log DNS)

  pipeline/       Orchestration — nối core + cloudflare lại với nhau
    fetch-sources.js      tải & đọc file nguồn
    build-domain-set.js   dựng tập domain cuối cùng
    sync-lists.js         đồng bộ danh sách lên Cloudflare
    sync-rules.js         đồng bộ luật DNS + Security/Content Categories
    defragment.js          dồn nén danh sách
    fetch-dns-logs.js      lấy + tổng hợp log truy vấn DNS từ Cloudflare
    report.js             ghi report.json cho dashboard
    notify.js             gửi webhook Discord

  cli/            Entrypoint mỏng, chỉ gọi pipeline
    download.js, sync-lists.js, sync-rules.js, defragment.js, dns-logs.js, teardown.js

dashboard/
  index.html      Trang tĩnh đọc report.json + dns-logs.json, không cần backend

test/             Unit test cho toàn bộ src/core/
```

**Nguyên tắc:** `core/` không được import `cloudflare/` hay chạm vào filesystem/network — nhờ vậy toàn bộ logic dedup, diff, defragment đều test được bằng `node --test` mà không cần mock API.

## Cài đặt

```bash
npm install
cp .env.example .env   # điền CLOUDFLARE_ACCOUNT_ID và CLOUDFLARE_API_TOKEN
```

## Chạy

```bash
npm start              # tải nguồn + đồng bộ danh sách + đồng bộ luật
npm run dry            # như trên nhưng không ghi thay đổi (DRY_RUN)
npm run defragment     # dồn nén các danh sách bị phân mảnh sau nhiều lần sync
npm run dns-logs       # lấy log truy vấn DNS từ Cloudflare, ghi ra dns-logs.json
npm test               # chạy toàn bộ unit test
```

Mỗi lần chạy bất kỳ lệnh nào ghi một dòng vào `report.json` ở gốc repo — dashboard đọc file này để hiển thị trạng thái.

## Log truy vấn DNS

`npm run dns-logs` gọi Cloudflare GraphQL Analytics API (dataset `gatewayResolverQueriesAdaptiveGroups`) để lấy số liệu truy vấn DNS qua Gateway trong `DNS_LOG_WINDOW_HOURS` giờ gần nhất (mặc định 24), rồi ghi ra `dns-logs.json`: tổng số cho phép/bị chặn, top domain theo từng loại, phân bố theo giờ, và một bảng log gần nhất.

**Quan trọng — quyền token:** API Token hiện có (dùng để đồng bộ list/rule) cần được cấp thêm quyền **Account → Account Analytics → Read** thì lệnh này mới chạy được. Không có quyền này, bước lấy log DNS trong workflow sẽ lỗi nhưng không làm hỏng phần đồng bộ chính (`continue-on-error: true`).

Dữ liệu chỉ gồm **số lượt truy vấn theo domain**, không có IP hay danh tính người dùng — an toàn để publish công khai lên GitHub Pages. `dns-logs.json` được publish y hệt cách `report.json` hoạt động: file tĩnh, dashboard tự `fetch()` và render.

## Dashboard

Mở `dashboard/index.html` qua HTTP (không phải `file://`, vì trình duyệt chặn `fetch` trên `file://`):

```bash
npx http-server .
# rồi mở http://localhost:8080/dashboard/index.html
```

Workflow `.github/workflows/pages.yml` tự động publish dashboard lên GitHub Pages mỗi khi `report.json`, `dns-logs.json`, hoặc `dashboard/` thay đổi.

## GitHub Actions

`.github/workflows/sync.yml` chạy `npm start` mỗi ngày lúc 00:00 giờ Việt Nam (chạy test trước), sau đó lấy log DNS và commit `report.json` + `dns-logs.json`. Cần các secret:

- `CLOUDFLARE_API_TOKEN` (có quyền Gateway + Account Analytics: Read), `CLOUDFLARE_ACCOUNT_ID` (bắt buộc)
- `DISCORD_WEBHOOK_URL` (tuỳ chọn)
- Repository variables `ALLOWLIST_URLS` / `BLOCKLIST_URLS` / `BLOCK_CONTENT_CATEGORY_IDS` (tuỳ chọn)

## Nguồn chặn mặc định (v5)

Thứ tự = độ ưu tiên (gói Free giới hạn 300k domain, phần cuối bị cắt trước):

1. YouTube/video ads (nhỏ)
2. OISD Big — quảng cáo + tracker + malware
3. HaGeZi Multi PRO — bổ sung tracker/telemetry mà OISD bỏ sót
4. HaGeZi Threat Intelligence (mini) — malware/phishing/C2 đang hoạt động

Dedup + parent-domain pruning loại phần trùng giữa các nguồn. Chạy `npm run dry` để xem số domain thực tế trước khi đẩy lên. Nếu vượt 300k, bỏ nguồn số 4 hoặc đổi sang `pro.mini-onlydomains.txt` qua `BLOCKLIST_URLS`.

## Thay đổi ở v5

**Tăng cường chặn:** thêm HaGeZi Pro + TIF mini; allowlist gọn lại (bỏ danh sách tracker torrent, danh sách rút gọn link, exclusions của AdGuard DNS — những thứ này đưa domain tracker/redirect vào allowlist); rule Content Categories tuỳ chọn (không tốn slot); tải nguồn có timeout từng lần thử, ghi đè thay vì append (trước đây chạy lại sẽ nhân đôi dữ liệu), từ chối nguồn rỗng/HTML lỗi, và `MIN_DOMAINS` chặn sync khi nguồn bị cắt cụt (tránh xoá nhầm danh sách trên Cloudflare).

**Loại bỏ:** SNI blocking (chỉ hiệu quả qua proxy; rule SNI cũ tự bị xoá ở lần sync tới), thống kê GAFAM/tên miền gốc, lệnh `introspect-dns-fields`, workflow `dns-logs.yml` (commit mỗi 15 phút), job dọn cache/workflow-run, các hằng số hiển thị không dùng.

## Những gì được giữ nguyên từ bản cũ

- Thuật toán smart dedup + parent-domain pruning (nếu `example.com` bị chặn, mọi subdomain tự động được coi là dư thừa)
- Thứ tự ưu tiên nguồn blocklist (OISD Big chính thức → danh sách chặn quảng cáo video tự chạy) khi vượt giới hạn 300k slot
- Cơ chế fail-fast cho lỗi 4xx vĩnh viễn, retry với backoff cho rate-limit (429)
- Logic defragment: dồn các domain "ổn định" (thêm lâu) vào danh sách đầu, giảm số lần cần patch ở các lần sync sau

## Điểm mới

- Tách pure logic (`core/`) khỏi I/O — có thể unit test toàn bộ nghiệp vụ mà không cần gọi API thật
- `report.json` + dashboard tĩnh để theo dõi lịch sử sync mà không cần thêm hạ tầng
- CLI mỏng, mỗi file chỉ orchestrate — dễ đọc, dễ thêm lệnh mới
