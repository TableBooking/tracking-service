# TableBooking tracking service

NestJS 12 / Node 24 / TypeScript ESM, PostgreSQL trên Supabase, RabbitMQ lifecycle consumer.

## Bắt đầu

1. npm ci
2. Copy .env.example thành .env; điền URL/password, CA và JWT public key (xem docs/external-services.md).
3. npm run build && npm run migrate
4. npm run dev hoặc npm start

Cổng mặc định 3004; /health/live và /health/ready là probe nội bộ, không được gateway proxy. Runtime role riêng, migration riêng; không JOIN/FK xuyên service. Node đọc .env khi file tồn tại.

## API

GET /api/tracking/bookings/:id/timeline
GET /api/tracking/bookings/:id/status

Mọi API cần Bearer RS256. CUSTOMER chỉ đọc booking của mình; Notification mọi role chỉ thao tác thông báo của chính sub. Pagination 1/20, max 100. Field nullable tùy chọn bị bỏ khỏi response để bám OpenAPI hiện có. Status Tracking dùng version, entry timeline dùng aggregateVersion.

## Kiểm tra

- npm run check ; npm test ; npm run build
- npm run test:integration: PostgreSQL nhúng PGlite, migration và HTTP thật; không cần Docker/cloud.
- npm run test:gateway: cần Api-gateway nằm cạnh repo và đã npm ci + npm run build; chạy gateway thật qua HTTP tới backend với DB nhúng và RSA test key.
- npm run diagnostics -- db hoặc broker: kiểm tra cấu hình cloud đã điền.

Test HTTP và SQL nhúng không thay thế RabbitMQ/SMTP/cloud E2E, multi-process race hoặc network outage. Cần chạy các ca này khi Docker/cloud sẵn sàng. Không dùng test key cho hệ thống thật.

## Docker

Copy .env.docker.example thành .env, điền cấu hình và mount keys/certs. docker compose up --build. Production: SERVICE_IMAGE=tag/digest rồi docker compose -f compose.prod.yaml up -d; network tablebooking-platform phải tồn tại. Migration one-shot: docker compose run --rm tracking node dist/migrate.js. Không public DB/AMQP.

## Delivery và event

Chỉ consume booking.state-changed.v1 qua tracking.lifecycle.q. ACK sau transaction commit; duplicate eventId ACK không lặp hiệu ứng; retry hữu hạn rồi DLQ. Không publish domain event mới.
History append-only, version xung đột rollback; projection chỉ tăng; nhận bù sẽ tính lại gap.

## Chưa cấu hình

Bạn cần điền Supabase, RabbitMQ, SMTP và key Auth. Chưa deploy cloud hoặc publish image. Xem docs/external-services.md để lấy từng biến.

Bootstrap tiện dụng: copy .env.bootstrap.example thành .env.bootstrap rồi chạy node --env-file=.env.bootstrap scripts/bootstrap.mjs. Chạy npm run provision:broker một lần để tạo cả hai lifecycle queue trước producer. Hai file Compose tích hợp/test ở workspace root có bản được commit trong Tracking deploy/.

Broker thật: đặt BROKER_TEST_URL (dev), rồi npm run test:broker. Suite tạo exchange/queue có prefix UUID riêng, kiểm tra duplicate và poison → retry → DLQ, rồi dọn đúng tài nguyên test. Chưa chạy suite này nếu chưa có Docker/broker URL.
