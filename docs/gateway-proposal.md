# Gateway handoff

Gateway đã có đủ 8 routes, không cần sửa source. Cloud integration Compose đặt TRACKING_SERVICE_URL=http://tracking:3004 và NOTIFICATION_SERVICE_URL=http://notification:3005.

Nếu chạy Compose riêng gateway, patch đề xuất (chưa áp dụng) thêm services.gateway.networks=[platform] và networks.platform={external:true,name:tablebooking-platform}. Giữ nguyên /api. Auth/Booking/Operations URL vẫn phải được integration owner điền khi ghép toàn hệ thống.

Bản Compose gốc workspace không thuộc Git repository; bản có version nằm trong deploy/compose.integration.yaml của Tracking. Dùng docker compose -f tracking-service/deploy/compose.integration.yaml up --build từ workspace root, sau khi đã điền hai env và mount key/cert. Đặt PORT=3004/3005 và đường dẫn container trong env Docker.
