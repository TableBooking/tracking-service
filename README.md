# Tracking service

Nhận `booking.state-changed.v1`, lưu history và projection vào Supabase để trả status/timeline.

## Yêu cầu

- Cài Docker Desktop, bật Linux containers và dùng Docker Compose v2.24+.
- Cài Git để clone hoặc cập nhật repo.
- Chuẩn bị project Supabase và public key RSA từ service Auth.
- Chạy bằng Docker thì không cần cài Node trên máy.

## Cấu hình

Mở PowerShell trong thư mục `tracking-service` vừa clone hoặc cập nhật.

### 1. Tạo file và thư mục

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
New-Item -ItemType Directory -Force keys, certs | Out-Null
```

### 2. Điền .env

- Điền `DATABASE_URL` cho role `tracking_app` và `MIGRATION_DATABASE_URL` cho role `tracking_migrator` của đúng project Supabase.
- Thay project ref và host có sẵn trong file mẫu bằng thông tin Session pooler của project đang dùng: cổng `5432`, database `postgres`. URL-encode phần password; không thêm tham số `sslmode`, `sslrootcert`, `sslkey`, `sslcert` vào URL.
- Giữ `DB_SSL_ENABLED=true`, `DB_SSL_CA_PATH=./certs/supabase-ca.crt` và `JWT_PUBLIC_KEY_PATH=./keys/auth-public.pem`.
- Giữ `JWT_ISSUER=restaurant-auth` và `JWT_AUDIENCE=restaurant-api` khớp token Auth.
- Điền hai biến broker dưới đây bằng cùng username/password/vhost với Notification. Dùng password broker khác password Supabase.

| Biến broker           | Địa chỉ kết nối                                                |
| --------------------- | -------------------------------------------------------------- |
| `RABBITMQ_URL`        | Node trên máy: `localhost:5675`.                               |
| `RABBITMQ_DOCKER_URL` | Container: `rabbitmq:5672` trong network `tablebooking-user3`. |

Compose dùng `RABBITMQ_DOCKER_URL` làm `RABBITMQ_URL` trong container và đổi đường dẫn key/CA sang đường dẫn container. Tracking không gửi email; không cần điền SMTP env.

### 3. Đặt CA và public key

| File                    | Lấy ở đâu                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `certs/supabase-ca.crt` | Tải CA certificate của project từ phần cài đặt Database trên Supabase.              |
| `keys/auth-public.pem`  | Nhận public key RSA dạng PEM/SPKI, tối thiểu 2048 bit, từ service Auth đang ký JWT. |

Chỉ đặt public key RSA vào `auth-public.pem`; không dùng private key, Supabase anon key hoặc service-role key.

### 4. Bootstrap project mới

Chỉ làm bước này với project Supabase mới; bỏ qua nếu role/schema đã được bootstrap.

Tạo file cấu hình:

```powershell
if (!(Test-Path .env.bootstrap)) { Copy-Item .env.bootstrap.example .env.bootstrap }
```

Điền `BOOTSTRAP_DATABASE_URL` bằng kết nối quản trị của đúng project, với password đã URL-encode; thay cả project ref và host có sẵn trong file mẫu.

Đặt `APP_DB_PASSWORD` và `MIGRATOR_DB_PASSWORD` bằng password nguyên bản của hai role tương ứng trong `.env`.

Chạy bootstrap sau khi đặt CA:

```powershell
docker compose --profile setup run --rm --build bootstrap
```

## Chạy

Khởi động Compose của **Notification trước** để có broker và network `tablebooking-user3`; Tracking không có RabbitMQ riêng.

1. Build image từ source:

   ```powershell
   docker compose build
   ```

2. Khởi động các service:

   ```powershell
   docker compose up -d --no-build --wait
   ```

3. Kiểm tra trạng thái container:

   ```powershell
   docker compose ps -a
   ```

Migration chạy trước ứng dụng; container `migrate` thoát code `0` là bình thường.

## Kiểm tra

Mở các địa chỉ mặc định sau:

| Thành phần                        | Địa chỉ                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| API                               | `http://localhost:3004/api/tracking/bookings/<BOOKING_ID>/status` |
| Liveness                          | http://localhost:3004/health/live                                 |
| Readiness                         | http://localhost:3004/health/ready                                |
| RabbitMQ Manager của Notification | http://localhost:15675                                            |
| Mailpit UI của Notification       | http://localhost:8025                                             |

Kiểm tra hai health endpoint trả HTTP `200`. Dùng RabbitMQ Manager và Mailpit khi thử cùng Notification.

## API

Gửi header `Authorization: Bearer <JWT>` với JWT RS256 có `iss=restaurant-auth`, `aud=restaurant-api`. Thay `:id` bằng UUID của booking.

| Method | Path                                  |
| ------ | ------------------------------------- |
| GET    | `/api/tracking/bookings/:id/status`   |
| GET    | `/api/tracking/bookings/:id/timeline` |

Customer chỉ đọc booking của mình; staff/manager đọc theo contract. Consumer ACK sau transaction, chống trùng `eventId`, không lùi projection khi event sai thứ tự; timeline thể hiện gap qua `gapDetected`.

## Dừng

Dừng Tracking trước khi dừng Notification:

```powershell
docker compose stop
```

## Test

Cài Node 24 (`>=24.15.0 <25`). Chạy trong thư mục repo:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

Để chạy `test:gateway`, chuẩn bị repo `Api-gateway` nằm cạnh repo này, đã cài dependencies và build, có `../Api-gateway/dist/bootstrap.js`. Test tự khởi động Gateway trên cổng tạm.

```powershell
npm.cmd run test:gateway
```

Để chạy `test:broker`, khởi động RabbitMQ development của Notification và điền đúng `RABBITMQ_URL` trong `.env`. Nạp URL vào `BROKER_TEST_URL`; test dùng queue/exchange có prefix riêng.

```powershell
$env:BROKER_TEST_URL = node --env-file=.env -p "process.env.RABBITMQ_URL"
npm.cmd run test:broker
Remove-Item Env:BROKER_TEST_URL
```

Xem phạm vi và giới hạn kiểm chứng tại [docs/verification.md](docs/verification.md).

## Lỗi thường gặp

| Triệu chứng                                | Cách xử lý                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Cổng `3004` bị chiếm                       | Dừng tiến trình Node đang chiếm cổng trước khi chạy container.                                                                             |
| PowerShell chặn `npm.ps1`                  | Dùng `npm.cmd` như các lệnh ở trên.                                                                                                        |
| Git báo dubious ownership                  | Chạy lệnh Git bên dưới trong thư mục repo.                                                                                                 |
| DB báo lỗi TLS/CA                          | Kiểm tra `certs/supabase-ca.crt` thuộc đúng project và giữ `DB_SSL_ENABLED=true`.                                                          |
| `migrate` báo lỗi quyền                    | Với project mới, bootstrap đúng project bằng tài khoản quản trị; kiểm tra hai role và URL DB.                                              |
| Network `tablebooking-user3` không tồn tại | Khởi động Compose của Notification trước, rồi chạy lại Tracking.                                                                           |
| Không kết nối được broker                  | Kiểm tra RabbitMQ của Notification đang chạy; dùng `RABBITMQ_DOCKER_URL` trỏ tới `rabbitmq:5672`, cùng username/password/vhost với broker. |
| Container chưa sẵn sàng                    | Xem log ứng dụng và migration bằng lệnh bên dưới.                                                                                          |

Xem log:

```powershell
docker compose logs --tail=100 tracking migrate
```

Nếu Git báo dubious ownership, chạy:

```powershell
$repoPath = (Get-Location).Path.Replace('\', '/')
git -c safe.directory="$repoPath" status
```

## Lưu ý

- Giữ kín `.env`, `.env.bootstrap` và private key; chỉ chia sẻ file mẫu.
- Bootstrap không tự đổi password của role đã tồn tại.
- Mỗi project Supabase giữ dữ liệu riêng; các máy dùng cùng project sẽ dùng chung dữ liệu.
- Chưa chứng nhận E2E với Booking/Operations. Trước khi ghép, thống nhất exchange type, queue arguments và routing keys.
