# Kiểm chứng Tracking — 17/11/2026

Cấu hình bàn giao: project Supabase Tracking riêng, dùng RabbitMQ Docker/network của Notification. Không có PostgreSQL local hay thư mục deploy.

- Build, TypeScript, ESLint, Prettier và 4 unit test đạt.
- Integration PostgreSQL nhúng đạt duplicate, gap/out-of-order, history/projection, ownership và rollback khi xung đột version.
- Gateway HTTP thật với JWT kiểm thử đạt cả status và timeline; kiểm tra token thiếu, audience sai và ownership.
- RabbitMQ thật đạt duplicate, retry hữu hạn và DLQ; tài nguyên test có prefix riêng, không reset broker.
- Supabase thật: bootstrap app/migrator/schema/quyền quản trị, 2 migration và TLS CA đạt. Runtime readiness HTTP 200, API thiếu token HTTP 401.
- Event gửi trùng qua broker local tạo một history row và projection REQUESTED v1 trong Supabase. Booking kiểm tra: b133be9d-4c7b-414f-9aba-e8966976ce84.
- Trong ca outage độc lập đã kiểm tra: Tracking tiếp tục xử lý khi Notification dừng, Notification nhận lại backlog khi bật.
- Image chạy uid 1000, không chứa env/key; cấu hình Compose map key/CA vào container.

Chưa chứng nhận login Auth thật, luồng đầy đủ với Booking/Operations/frontend, concurrency nhiều tiến trình, HA, CPU khác hoặc máy người nhận. Image ứng dụng được build local từ source, không phụ thuộc tài khoản hoặc kho image cá nhân.

Hướng dẫn cấu hình và chạy ở [README](../README.md).

Cấu hình Compose đã được kiểm tra: build image local, bootstrap qua profile setup, migration tự chạy và thoát code 0, hai container healthy trên cổng 3005/3004, network chung tablebooking-user3. Event gửi trùng tạo một job SENT, một history và email cleanup@example.test trong Mailpit. Không push.
