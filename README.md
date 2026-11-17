# Tracking service

Nhận `booking.state-changed.v1`, lưu history và projection để phục vụ status/timeline. Database riêng nằm trên **Supabase**. Tracking không gửi email và không cần SMTP env.

## Chuẩn bị Supabase và Auth

Chỉ cần Docker Desktop chạy Linux containers, Docker Compose v2.24+ và Git để lấy source; không cần cài Node nếu chạy bằng Docker.

1. Copy `.env.example` thành `.env` **chỉ khi chưa có file**. Không copy đè file đã điền.
2. Trong Supabase chọn **Connect → Session pooler**, dùng host được cung cấp, port `5432`, database `postgres`. Điền project ref và password đã URL-encode vào hai URL DB; không thêm `sslmode` vào URL.
3. Tải CA certificate của project vào `certs/supabase-ca.crt`.
4. Nhận public key RSA từ Auth và đặt tại `keys/auth-public.pem`. Không dùng private key, Supabase anon key hay service-role API key.
5. Nếu role/schema đã được bootstrap thì bỏ qua bước tạo DB dưới đây. Nếu là project mới, copy `.env.bootstrap.example` thành `.env.bootstrap`; điền URL quản trị và tự đặt hai mật khẩu app/migrator. Mật khẩu trong hai biến riêng là nguyên bản; mật khẩu trong URL phải URL-encode.

Bootstrap cấp quyền thành viên migrator cho tài khoản quản trị để gán schema owner trên Supabase. Script không tự đổi mật khẩu role đã tồn tại. Không commit hoặc chia sẻ `.env`/`.env.bootstrap` thật.

## Chạy từ source vừa clone/pull

Khởi động Compose của **notification-service trước** để có broker và network `tablebooking-user3`. Tracking dùng broker đó, không chạy thêm RabbitMQ hay PostgreSQL riêng.

Trong thư mục `tracking-service`:

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force keys, certs
```

Chỉ copy khi chưa có .env; điền cấu hình, CA và public key như trên. Hai biến broker dùng cùng username/password/vhost với Notification:

| Biến                | Dùng ở đâu                                   |
| ------------------- | -------------------------------------------- |
| RABBITMQ_URL        | Node trên máy, localhost:5675                |
| RABBITMQ_DOCKER_URL | Container, rabbitmq:5672 trong network chung |

Password broker khác password Supabase. Điền đúng password Notification đã dùng khi tạo broker. Queue Tracking là `tracking.lifecycle.q`, không dùng chung queue của Notification.

Nếu là project Supabase mới:

```powershell
Copy-Item .env.bootstrap.example .env.bootstrap
# Dien file bootstrap truoc khi chay:
docker compose --profile setup run --rm --build bootstrap
```

Build và chạy:

```powershell
docker compose build
docker compose up -d --no-build --wait
docker compose ps -a
```

Migration tự chạy trước ứng dụng; `migrate` thoát code 0 là bình thường. Không cần bootstrap lại DB đã tạo. Dừng bản Node đang chiếm cổng 3004 trước khi chạy container.

- Readiness: http://localhost:3004/health/ready
- Liveness: http://localhost:3004/health/live
- RabbitMQ Manager dùng chung: http://localhost:15675
- Khi thử cả hai service, Mailpit của Notification: http://localhost:8025

Nếu báo network không tồn tại, khởi động Compose Notification trước. Khi ghép Booking/Operations sau này, thống nhất exchange type, queue arguments và routing keys trước; hiện chưa chứng nhận E2E toàn nhóm.

## Chạy trên máy khác

Người nhận clone/pull source của repo này, tạo .env riêng, đặt CA/public key và chạy hai lệnh build/up ở trên. Docker tự build image `tablebooking-tracking-service:local` và tạo container trên máy người đó. Không cần tài khoản Docker Hub, docker login hay image đã publish. Khởi động Compose Notification trên cùng máy trước để có broker/network dùng chung.

Supabase vẫn là database bên ngoài: cần URL/password hợp lệ, role/schema đã bootstrap và public key khớp Auth. Nếu dùng cùng project Supabase, các máy sẽ đọc/ghi cùng dữ liệu; RabbitMQ và Mailpit local trên từng máy là riêng.

## API và kiểm tra

Hai endpoint cần Bearer JWT RS256 đúng Auth (`iss=restaurant-auth`, `aud=restaurant-api`). Customer chỉ đọc booking của mình; quyền staff/manager theo contract.

| Method | Path                                |
| ------ | ----------------------------------- |
| GET    | /api/tracking/bookings/:id/status   |
| GET    | /api/tracking/bookings/:id/timeline |

Consumer ACK sau transaction, chống trùng eventId, không lùi projection khi event đến sai thứ tự; history lưu aggregateVersion và timeline thể hiện gap. Tracking không quyết định trạng thái đặt bàn và không ghi DB của service khác.

Chạy Node để phát triển: `npm ci`, `npm run build`, `npm start`; giữ broker Notification chạy. .env dùng localhost, Compose tự chọn RABBITMQ_DOCKER_URL và đường dẫn key/CA trong container.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:integration
npm.cmd run test:gateway
npm.cmd run build
```

Test gateway cần repo Api-gateway cạnh repo này, đã cài dependencies và build. Test broker: đặt BROKER_TEST_URL tới broker development rồi `npm run test:broker`; tài nguyên test có prefix riêng. Xem [docs/verification.md](docs/verification.md) để biết phạm vi đã kiểm tra.

Dừng bằng `docker compose stop`, xem lỗi bằng `docker compose logs --tail=100 tracking migrate`. Mỗi project Supabase giữ dữ liệu riêng; không có PostgreSQL Docker trong cấu hình này.
