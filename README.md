# DWRK — Development Workspaces

App desktop Wails 3 + Go + React để quản lý môi trường phát triển local theo workspace. UI đã kết nối backend Go; cấu hình lưu trên máy, thao tác chạy/dừng sử dụng tiến trình thật.

## Chức năng

- Tạo, đổi tên, sửa thư mục và gỡ workspace/project khỏi app; không xóa thư mục dự án.
- Chọn thư mục bằng dialog hệ thống, quét Git/worktree, Node, Java, Go và Compose; bỏ qua dependency/build và symlink/junction. Có hủy quét và cảnh báo lỗi đọc. Kết quả quét không tự tạo hoặc chạy command.
- Project có nhiều command service/task; chỉnh lệnh, thư mục chạy tương đối, môi trường, cổng, URL và HTTP health check. Chọn riêng các service chạy cùng workspace.
- Chạy/dừng/chạy lại, hủy task, exit code, lỗi, health check và log stdout/stderr. Windows dùng Job Object, gắn tiến trình trước khi cho chạy để quản lý đúng cây tiến trình. Không kill tiến trình lạ theo cổng/tên.
- Lệnh dừng tùy chỉnh dùng snapshot của lần chạy, kể cả khi cấu hình đã sửa. Stop lỗi giữ trạng thái chưa xác định; nút buộc dừng chỉ áp dụng cây tiến trình thuộc app.
- Docker Compose dùng project/files/services cụ thể; kiểm tra container, health và lấy log. Chuyển workspace chỉ quan sát, không tự `up`. Dừng dùng `stop`, không xóa volume.
- Mở IDE, terminal, thư mục, docs và resource file/URL bằng công cụ hệ thống. Database/debug dùng shortcut hoặc IDE đã cấu hình.
- Git chỉ đọc branch, upstream, ahead/behind và file thay đổi theo yêu cầu; không tự fetch/commit/pull/push.
- Import/export JSON có xem trước và kiểm tra tại backend. Import tạo bản sao và remap mọi ID/tham chiếu, không ghi đè và không tự chạy. Đọc được file `dwrk-mock` từ bản UI cũ; export mới dùng schema backend.
- Settings lưu theme, múi giờ, editor, terminal và shell. Thoát app khi còn tiến trình yêu cầu dừng rồi thoát hoặc hủy; Compose bên ngoài không bị dừng ngầm.

Log giới hạn 2.000 dòng / 2 MiB mỗi run, tổng 32 MiB, dòng tối đa khoảng 8 KiB; tính cả chi phí entry để dòng trống không vượt bộ nhớ. View lấy tối đa 200 dòng của command đang chọn; hỗ trợ lọc, tìm kiếm, sao chép và xóa phần hiển thị. Log/runtime chỉ tồn tại trong phiên.

## Chạy app

Cần Go theo `go.mod`, Node.js 24+ trong PATH và Wails CLI 3 tương ứng dependency.

```powershell
cd frontend
npm ci
cd ..
wails3 dev
```

Chạy riêng `npm run dev` ở `frontend` chỉ phục vụ UI; API cần host Wails. Vite mặc định dùng port 9245. Chạy bản đã build bằng `bin/dwrk.exe`.

Trong app: tạo workspace → chọn thư mục → quét và chọn project → mở cấu hình project để thêm lệnh → chạy từng command. Muốn chạy nhóm, chọn service trong cấu hình workspace.

Editor/terminal có executable và danh sách đối số; mỗi dòng là một đối số, `{directory}` được thay bằng đường dẫn nguyên vẹn. Ví dụ editor dùng `Code.exe` với một đối số `{directory}`. Shell nhận nguyên chuỗi command ở đối số cuối; mặc định là PowerShell trên Windows và `/bin/sh -c` trên Linux/macOS. Không đưa mật khẩu/token vào command, environment hay URL; backend không có kho credential và không tự đọc `.env` khi quét.

## Cấu trúc

```text
main.go                       # Khởi tạo Wails và xử lý thoát app
configservice.go              # CRUD, import/export và phục hồi cấu hình
runtimeservice.go             # API command/workspace và snapshot runtime
desktopservice.go             # Dialog, công cụ hệ thống và Git
internal/config/              # Model, validation, JSON, revision, khóa và backup
internal/scanner/             # Quét thư mục; không thực thi nội dung repo
internal/runner/              # Tiến trình, Job Object/process group, log, health, Compose
internal/tools/               # Mở IDE/terminal và Git chỉ đọc
frontend/src/lib/model.ts     # Adapter UI giữ nguyên các trường model backend
frontend/src/features/        # Workspace, project, settings và log
frontend/bindings/            # Wails sinh tự động; không sửa tay
```

`frontend/src/mock` còn giữ fixture/test của bản xem cũ, không được app dùng để điều khiển state/runtime.

## Cấu hình và phục hồi

File nằm tại `os.UserConfigDir()/dwrk/config.json` (Windows: `%AppData%/dwrk/config.json`). Chỉ mutation thành công mới tạo config. Mỗi mutation kèm revision; khóa OS ngăn hai instance ghi đồng thời. File tạm được flush rồi thay thế, backup hợp lệ gần nhất nằm ở `config.json.bak`.

Config lỗi/phiên bản không hỗ trợ được giữ nguyên và trả lỗi. Màn hình lỗi có phục hồi backup sau khi xác nhận; bản lỗi được giữ thành `.rejected-<timestamp>`. Chưa có migration tự động cho các schema backend tương lai. Export dùng dialog lưu file native, không xuất log/runtime hay công cụ riêng của máy; giữ nguyên command/environment để người dùng kiểm tra trước khi chia sẻ.

## Kiểm tra và build

```powershell
go test ./...
go vet ./...
cd frontend
npm test
npm run build
cd ..
wails3 generate bindings -ts -i
go build -tags production -ldflags='-H windowsgui' -o bin/dwrk.exe .
```

Test Compose thực tế là tùy chọn, cần Docker daemon và image `rhysd/actionlint:latest` đã có sẵn. Test không pull image, không dùng network/volume và chỉ dọn container fixture có tên ngẫu nhiên:

```powershell
$env:DWRK_TEST_DOCKER = '1'
go test ./internal/runner -run TestComposeIntegration -v
```

Đã kiểm tra trên Windows: lưu/backup/revision, import cũ/mới, quét, Git, task/exit code, hủy, dừng cây tiến trình độc lập, cổng bận, health HTTP và Compose start/status/health/log/stop thực tế. UI Windows đã smoke test màn hình đầu, dialog workspace/settings và picker native. Chưa chạy thực tế Linux/macOS, chưa kiểm thử mất điện hay filesystem mạng.

## Thiết kế

- [Thiết kế chức năng](docs/product-design.md)
- [Kiến trúc frontend](docs/frontend-architecture.md)
- [Mô hình lưu trữ và JSON mẫu](docs/data-storage.md)
- [Thuật ngữ](CONTEXT.md)
