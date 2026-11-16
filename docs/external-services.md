# Kết nối Supabase, RabbitMQ và SMTP

## Supabase

1. Tạo project riêng cho tracking, lưu password quản trị trong secret store. Database trong URL vẫn là postgres.
2. Connect → Session pooler, copy hostname và port 5432 (IPv4). Dùng đúng project ref; password phải URL-encode.
3. Tắt Data API trên project chuyên dùng backend. Không dùng Supabase Auth/API keys cho service này.
4. Tải CA certificate từ Database SSL settings vào certs/supabase-ca.crt; không commit certificate/key/credentials.
5. Bootstrap yêu cầu BOOTSTRAP_DATABASE_URL, APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD, DB_SSL_ENABLED=true và DB_SSL_CA_PATH. Chạy npm run bootstrap với biến môi trường được cung cấp qua terminal/secret store. Script chỉ tạo role nếu chưa có, không âm thầm đổi password hiện hữu.
6. Điền DATABASE_URL với role tracking_app.PROJECT_REF; MIGRATION_DATABASE_URL dùng tracking_migrator.PROJECT_REF. Schema: tracking.
7. npm run build rồi npm run migrate. Migration có checksum và transaction lock; không sửa file migration đã chạy.
8. Bỏ MIGRATION_DATABASE_URL khỏi runtime container nếu không cần. npm start đọc .env trong working directory.

Runtime không dùng postgres/admin hoặc service_role key. SSL được cấu hình qua object pg, nên URL không chứa sslmode/sslrootcert/sslcert/sslkey để tránh ghi đè CA. Free project có thể pause; kiểm tra trạng thái trước demo. Không có auto-upgrade dữ liệu V1.

Nguồn: https://supabase.com/docs/guides/database/connecting-to-postgres ; https://node-postgres.com/features/ssl

## RabbitMQ

Dùng cùng broker/vhost với Booking và Operations. CloudAMQP: chọn RabbitMQ, copy AMQPS URL, không lấy Management HTTPS URL thay thế. Node consumer dùng TLS system trust; không tắt certificate verification.
Trước producer chạy npm run provision:broker để tạo cả hai queue ngay cả khi Notification chưa chạy. Script dùng topology chuẩn; nếu đổi tên qua env thì cần cập nhật manifest provisioning tương ứng. Consumer khai báo idempotent restaurant.events (topic), restaurant.retry/restaurant.dlx (direct), queue riêng và retry 5/30/120 giây. Khởi động cả hai consumer trước producer; sau đó có thể tắt Notification mà queue vẫn nhận backlog. Retry quay về queue gốc qua default exchange, tránh phát lại cho tất cả consumers. Không reset broker chung.
Các tên exchange, queue, routing key và prefetch có thể cấu hình; delay retry mặc định 5/30/120 giây, cấu hình MQ_RETRY_DELAYS_MS và MQ_MAX_RETRIES (mặc định 3 lần sau lần đầu). Topology phải khớp producer/nhóm; không declare khác loại trên exchange có sẵn. Diagnostics: npm run diagnostics -- broker. Fixture: npm run publish:fixture -- path/to/event.json (development only).

## SMTP

Notification: dev dùng Mailpit localhost:1025, deploy ví dụ Brevo smtp-relay.brevo.com:587, SMTP_SECURE=false, SMTP_REQUIRE_TLS=true. SMTP_USER là SMTP login; SMTP_PASSWORD là SMTP key, không phải API key. Xác thực sender/domain trước gửi.
Worker chỉ bật khi DELIVERY_WORKER_ENABLED=true; production cần credentials. SMTP lỗi lưu lỗi chung để không lộ recipient trong log/DB. SMTP có giới hạn at-least-once, Message-ID ổn định không đảm bảo nhà cung cấp dedup.
Retry DB: mặc định 5 lần tổng cộng, 30/120/600/1800 giây; poll 1 giây; tối đa DELIVERY_BATCH_SIZE jobs mỗi tick. DELIVERY_MAX_ATTEMPTS, DELIVERY_POLL_INTERVAL_MS, DELIVERY_LEASE_MS có thể đổi; lease tối thiểu 60 giây. DELIVERY_BATCH_SIZE và DELIVERY_BACKOFF_MS cấu hình được.

## JWT và gateway

Lấy public key thật từ Auth owner; iss=restaurant-auth, aud=restaurant-api. Không tạo key riêng cho từng service. Không dùng Supabase JWT thay token Auth hiện tại. Backend kiểm tra JWT/ownership ngay cả khi bypass gateway.

## Kiểm tra cloud

Chạy diagnostics db/broker rồi migration và smoke HTTP. Không chạy test fault trên broker/DB dùng chung. Unit và PGlite tests không chứng minh kết nối Supabase/RabbitMQ/SMTP cloud.
