# Push notifications

Module dùng React Native Firebase 27.1 cho transport, Expo Notifications 57 cho
permission/channels, SQLite cho trạng thái bền vững. Foreground hiển thị banner
trong app; background dùng notification do hệ điều hành hiển thị.

## Ranh giới module

```text
src/notifications/core/       TypeScript thuần: payload, lifecycle, retry, dedup
src/notifications/adapters/   Firebase native, web fallback, permission, SQLite
src/notifications/react/      Bootstrap, observable hook, foreground banner
src/features/notifications/   Handler nghiệp vụ, Settings, API và composition
index.ts                     Background handler trước expo-router/entry
```

Core không import React, Router hay Firebase. Để dùng ở project khác, mang theo
`src/notifications`, thay storage/transport nếu cần, rồi tạo composition tương tự
`src/features/notifications/runtime.ts`. Handler và route thuộc app; core không
biết task, repository hay URL điều hướng.

## Chạy trên thiết bị

1. Dùng development/production build chứa các native module mới. Expo Go và web
   vẫn chạy phần quản lý task, nhưng chức năng push được đánh dấu không hỗ trợ.
2. Cấu hình Firebase project và app identifier đúng với `app.json`. Android dùng
   `firebase/google-services.json`; iOS dùng `firebase/GoogleService-Info.plist`.
3. Với iOS, upload APNs credentials lên Firebase và dùng thiết bị thật để kiểm
   tra remote delivery. Config plugin Expo Notifications thêm APNs entitlement
   và background mode; không sửa các thư mục native sinh tự động.
4. Build lại bằng quy trình development/EAS của project; chỉ restart Metro không
   bổ sung được native module hay thay đổi cấu hình Firebase.
5. Mở **Cài đặt → Thông báo → Bật thông báo**. Mount app chỉ khôi phục trạng thái
   và listeners, không tự hiển thị hộp thoại xin quyền.

`firebase.json` tắt auto-init và APNs auto-registration cho lần cài đầu tiên.
Adapter bật đăng ký khi người dùng chọn enable, tắt auto-init khi disable.
Không tự bật lại lựa chọn của người dùng khi app khởi động.

## Installation ID và endpoint

`app.json` bật `installationIdEnabled: true`. Adapter dùng API modular
`register`/`onRegistered`/`unregister`, không dùng API FCM token cũ. Giá trị FID
chỉ dùng sau đăng ký thành công; không thay bằng một ID lấy trực tiếp từ
Firebase Installations. APNs registration trên iOS vẫn là bước riêng.

Có hai ID khác nhau:

- `installationId`: UUID local, định danh bản cài đặt cho backend và giữ nguyên
  khi FID thay đổi.
- `endpoint`: `{ provider: "fcm", kind: "fid", value: "..." }`, đích push hiện tại.

API/SDK gửi phía server phải hỗ trợ loại endpoint này. Không đưa FID vào tham số
`token` của API chỉ hỗ trợ registration token cũ.

## Kết nối backend

Project chưa có backend/auth. Không cấu hình URL thì Firebase vẫn có thể đăng ký
thiết bị và nhận message, nhưng Settings hiển thị dịch vụ gửi chưa kết nối; không
báo backend sync thành công giả.

Sao chép `.env.example` sang `.env.local` và đặt:

```dotenv
EXPO_PUBLIC_PUSH_REGISTRATION_URL=https://api.example.com/push
```

Đây là URL công khai nằm trong bundle. Credentials của Firebase Admin/APNs chỉ
thuộc backend/build environment. Sau đổi URL cần tạo lại bundle hoặc restart
Metro trong môi trường development.

Workflow APK đọc repository variable GitHub `EXPO_PUBLIC_PUSH_REGISTRATION_URL`.
Với môi trường build khác, cung cấp biến này trong môi trường tạo bundle; file
`.env.local` của máy cá nhân không được commit lên repository.

HTTP adapter gửi request:

```http
PUT /push/installations/{local-installation-id}
Content-Type: application/json
Authorization: Bearer <session-token-if-configured>

{
  "endpoint": { "provider": "fcm", "kind": "fid", "value": "registered-fid" },
  "enabled": true,
  "revision": 3,
  "platform": "android"
}
```

Backend trả 2xx sau khi lưu thành công. Với disable hoặc permission bị thu hồi,
client gửi cùng contract với `enabled: false`; backend giữ một disabled tombstone
để request cũ không bật lại đăng ký. Với mỗi installation:

- Upsert atomically theo revision tăng dần. Retry cùng revision và cùng payload
  phải thành công; không áp dụng revision cũ hơn trạng thái hiện tại.
- Xác thực quyền sở hữu installation. Suy ra user từ credentials, không tin userId
  do client gửi. Client hiện không gửi userId trong body.
- Thay user binding atomically; một user có thể có nhiều installation.
- Chỉ gửi tới endpoint enabled, xóa/vô hiệu hóa đích đã hết hiệu lực từ kết quả
  phía nhà cung cấp. Không xem một request send thành công là thiết bị đã đọc.

Khi bổ sung auth, truyền `getAccessToken(userId)` vào `createHttpRegistrationApi`
ở `runtime.ts`, và gọi `notificationService.setSession(userId | null)` khi phiên
đổi. Service xóa intent/banner của phiên cũ và đặt readiness về false; gọi
`notificationService.setReady(true)` sau khi startup của phiên mới hoàn tất.
Credential resolver phải trả token của đúng user được yêu cầu hoặc từ chối,
không lấy token của user mới để retry request user cũ. Flow logout phía server
cũng cần thu hồi binding; logout offline không bảo đảm server biết ngay lập tức.

Trạng thái đăng ký native và trạng thái đồng bộ server độc lập. Pending sync lưu
trong SQLite, retry có backoff và giới hạn khi service đang chạy; nút retry cho phép
thử lại thủ công. App reconcile khi foreground. Timer JavaScript không bảo đảm
chạy khi OS treo hoặc tắt app.

## Payload

Phần `data` của message dùng các giá trị string:

```json
{
  "schemaVersion": "1",
  "eventId": "evt_123",
  "type": "task.reminder",
  "taskId": "local-task-uuid",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

`eventId` phải duy nhất cho một sự kiện nghiệp vụ, giữ nguyên khi server retry.
`expiresAt` là tùy chọn, dùng ISO timestamp có timezone. `task.reminder` và
`task.updated` cần `taskId`; `announcement` không cần. Payload sai, version/type
chưa hỗ trợ hoặc hết hạn sẽ bị bỏ qua. `notification.title`/`body` được dùng cho
banner, không phải nguồn dữ liệu nghiệp vụ.

Với thông báo hiển thị, gửi `notification + data`, channel Android `tasks`. Khi
app ở background, OS đã hiển thị nên handler không tạo một local notification
thứ hai. Dữ liệu task hiện chỉ lưu local; server chưa có API đồng bộ task. Không
tạo/sửa/xóa/toggle task dựa trên payload. Nếu chỉ nhắc lịch của task local, cần
tính năng local reminders riêng.

## Nhận, mở và xử lý nghiệp vụ

- Foreground: Firebase `onMessage` → validate → receipt handler → banner.
- Background: handler ngoài React → validate → kiểm tra enabled → receipt dedup;
  không điều hướng, không xin quyền. Đường mặc định hiện không ghi task vì chưa có
  dữ liệu canonical từ server. Khi bổ sung sync, truyền callback headless-safe vào
  processor trong `background.native.ts`; không import Router/React từ đó.
- Bấm thông báo: Firebase opened/initial event → lưu pending intent → chờ root
  Router và startup → handler của app. Task còn tồn tại được đưa lên đầu và tô
  sáng trong danh sách; task đã xóa/announcement quay về danh sách bình thường.
- Bootstrap chỉ start service sau khi Router có navigation state, đặt readiness
  trước start; cold tap được xử lý trước việc đăng ký native/API có thể chậm.
- iOS silent launch: root kiểm tra headless trước khi chạy startup effects UI.

Mỗi loại notification có handler trong `features/notifications/handlers.ts`.
Để thêm loại mới, mở rộng discriminated union, decoder và map handler cùng nhau.
Không nhận route/URL tùy ý từ payload. Nếu thêm custom notification actions,
cần adapter response riêng và actionId; Firebase opened/initial chỉ xử lý thao
tác mở notification mặc định.

Receipt và open có khóa dedup riêng: nhận push không làm mất thao tác bấm về sau.
SQLite atomic claims dùng lease và claim ID để tránh hai runtime cùng nhận một
việc; pending opens tồn tại qua restart. Receipt/open đã hoàn tất giữ 7 ngày.
Crash giữa side effect và completion vẫn có thể retry, nên handler phải idempotent
(ví dụ set trạng thái đích, không gọi toggle).

Push không thay thế cơ chế đồng bộ dữ liệu. Silent/data-only delivery phụ thuộc
OS, ưu tiên và cấu hình APNs; force-stop có thể chặn delivery. Khi thêm backend,
app cần fetch dữ liệu chuẩn khi hoạt động trở lại, không phụ thuộc mọi push đều đến.

## Kiểm thử

Web fallback không nhận push. Metro đã cấu hình WASM và isolation headers cho
SQLite ở development; khi host bản web, server cũng cần
`Cross-Origin-Embedder-Policy: credentialless` và
`Cross-Origin-Opener-Policy: same-origin` để dùng SharedArrayBuffer.

```sh
npm run lint
npm run typecheck
npm run test:notifications
npm run test:ci
```

Core tests dùng fake transport/API/storage; adapter tests chạy SQLite thật trên
Node 24 và thay thế native boundary. CI chạy cả Jest và adapter integration tests.
Các test này không chứng minh remote delivery qua Firebase/APNs.

Trên Android và iPhone thật, kiểm tra: deny → bật lại trong Settings; enable/disable;
foreground banner; background/terminated tap; cold startup; payload sai/hết hạn;
nhận trùng rồi bấm; mất mạng rồi retry; FID đổi; task bị xóa; backend không cấu hình;
user switch/logout sau khi bổ sung auth. Xác nhận không có hai notification cho
cùng một message. Test cả binary development và release.

## Tài liệu API đã đối chiếu

- [Expo Notifications SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo Router custom entry](https://docs.expo.dev/router/installation/)
- [React Native Firebase Installation ID](https://rnfirebase.io/messaging/migrating-to-installation-id)
- [Firebase background handling](https://rnfirebase.io/messaging/usage)
- [Firebase notification interaction](https://rnfirebase.io/messaging/notifications)
