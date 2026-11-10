# DWRK — Development Workspaces

App desktop Wails + Go + React để quản lý môi trường làm việc dev theo workspace. Frontend hiện có giao diện hoạt động với **mock data**, chưa điều khiển filesystem, Git, Docker, database hoặc tiến trình thật.

## Chạy frontend

Cần Node.js 24+ và npm. Từ thư mục dự án:

```powershell
cd frontend
npm ci
npm run dev
```

Mặc định: [http://127.0.0.1:9245](http://127.0.0.1:9245). Đổi port khi cần:

```powershell
npm run dev -- --port 9345
```

Chạy trong desktop bằng `wails3 dev` ở thư mục gốc nếu đã cài Go và Wails CLI theo project. Frontend vẫn dùng Vite plugin/bindings Wails hiện có; không tạo server REST riêng.

## Chức năng mock đã có

- Workspace sidebar, tìm workspace/project, tạo workspace và thêm project thủ công.
- Quét mô phỏng → chọn mục import; không thêm lại thư mục đã import và không tự chạy service.
- Chọn project và command; panel chi tiết ở bên phải trên màn rộng, xếp dọc ở màn nhỏ.
- Chạy/dừng/chạy lại service, chạy task build/test, chạy/dừng theo workspace và danh sách service đang chạy toàn cục.
- Chuyển workspace giữ nguyên trạng thái service của workspace khác.
- Dialog cấu hình project: nhiều lệnh, lệnh mặc định, thư mục, cổng, lệnh dừng, HTTP health check.
- Log theo command: stdout/stderr, tìm kiếm, xóa hiển thị, tự động cuộn và lịch sử thao tác.
- Dark/light/system, đồng hồ UTC+7, icon Git/thư mục, logo Devicon cục bộ.

Chỉ theme được ghi nhớ trong localStorage. Project, command, log và trạng thái mock trở về dữ liệu mẫu khi reload. Mọi nút mở IDE/terminal/docs/URL chỉ hiển thị thông báo mô phỏng.

## Stack và tổ chức

React 18 + TypeScript + Vite, Tailwind CSS 4, component shadcn/ui trên Radix UI, Lucide, SVG Devicon. Component shadcn được lấy từ registry Radix chính thức, điều chỉnh import và ref để tương thích React 18; giấy phép đi kèm source.

- `frontend/src/app`: màn hình và kết nối state mock.
- `frontend/src/features`: project, workspace và log.
- `frontend/src/components/ui`: component shadcn/Radix.
- `frontend/src/mock`: dữ liệu mẫu, reducer, validation và kiểm thử.
- `frontend/src/styles`: Tailwind và theme tokens.
- `frontend/bindings`: Wails sinh tự động, không sửa tay.

## Build và kiểm tra

Trong thư mục `frontend`:

```powershell
npm test
npm run build
```

Test dùng Node test runner và TypeScript stripping, không thêm test framework vào dependency. Production output nằm ở `frontend/dist`, được Go embed khi build app desktop.

Đã kiểm tra UI bằng Edge headless: 320, 390, 768, 1024, 1050, 1280 và 1586px; dialog/focus, lưu health check, thêm task, import/chống trùng, thêm project/workspace, scope chạy/dừng và lưu theme. Chưa kiểm thử app trong Wails WebView hoặc đo RAM/CPU thực tế.

## Thiết kế

- [Thiết kế chức năng](docs/product-design.md)
- [Kiến trúc frontend](docs/frontend-architecture.md)
- [Mô hình lưu trữ và JSON mẫu](docs/data-storage.md)
- [Thuật ngữ](CONTEXT.md)
- [Ảnh desktop](docs/screenshots/ui-desktop.png), [mobile](docs/screenshots/ui-mobile.png), [cấu hình project](docs/screenshots/ui-settings.png)
