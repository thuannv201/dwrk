# DWRK — mô hình dữ liệu và lưu cấu hình

## Quyết định lưu trữ

Bản đầu dùng một file JSON cục bộ, backend Go đọc/ghi bằng `encoding/json`. Khối lượng chính là cấu hình workspace và lệnh, không có yêu cầu truy vấn lịch sử lớn để cần database. Chưa thêm SQLite; xem xét khi có lưu lịch sử/log dài hạn và cần tìm kiếm/phân trang trên dữ liệu đó. Đây là quyết định về độ đơn giản, chưa có benchmark so sánh JSON và SQLite.

Đường dẫn: `filepath.Join(os.UserConfigDir(), "dwrk", "config.json")`. Theo [tài liệu Go](https://pkg.go.dev/os#UserConfigDir), Windows dùng `%AppData%`; không hardcode đường dẫn người dùng, không ghi cấu hình cạnh file exe hay vào repo dự án.

```text
%AppData%/dwrk/
├── config.json          # Cấu hình đang sử dụng
└── config.json.bak      # Bản hợp lệ trước lần thay thế gần nhất
```

Mẫu JSON ở cuối tài liệu chỉ là thiết kế dữ liệu minh họa, chưa được app đọc. Không tạo file cấu hình thật hoặc chạy các lệnh trong ví dụ.

## Các đối tượng cần lưu

```text
AppConfig
├── Settings
├── lastWorkspaceId?
└── Workspace[]
    ├── Project[]
    │   ├── primaryCommandId?
    │   └── Command[]
    │       ├── service / process
    │       ├── service / docker-compose
    │       └── task
    ├── startCommandIds[]
    └── Resource[]
```

Project ở đây là dòng project trên giao diện, không phải workspace. Một Git monorepo có thể cung cấp nhiều project: `shop/apps/web`, `shop/services/iam`, `shop/infra`. Chúng có ID riêng nhưng dùng chung Git root khi kiểm tra Git. Project không có Git vẫn được import và chạy lệnh bình thường.

### AppConfig và Settings

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| schemaVersion | integer | Phiên bản cấu trúc file, bắt đầu 1 |
| revision | integer | Tăng sau mỗi lần lưu thành công, chống ghi đè draft cũ |
| settings | Settings | Thiết lập chung |
| lastWorkspaceId | string, optional | Khôi phục workspace được xem gần nhất |
| workspaces | Workspace[] | Danh sách theo thứ tự sidebar |

Settings gồm `theme: dark/light/system`, `locale`, `timeZone`, `editor`, `terminal`, `shell` và giới hạn log. `timeZone` là tên IANA; mặc định đề xuất `Asia/Ho_Chi_Minh` cho người dùng hiện tại, cho phép đổi trong cài đặt. Mỗi công cụ là `{ executable, args: string[] }`.

Editor/terminal được khởi chạy bằng executable + mảng argv, thay thế đúng token `{directory}` trong từng đối số; không nối đường dẫn vào một chuỗi shell. Shell cấu hình cách thực thi command người dùng đã duyệt, ví dụ PowerShell với `-Command` và chuỗi lệnh là một đối số riêng. Không cho phép lệnh trong repo tự thay đổi công cụ của app.

### Workspace

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| id | string | ID ổn định khi đổi tên hoặc chọn lại thư mục |
| name | string | Tên hiển thị |
| rootPath | string | Đường dẫn tuyệt đối thư mục gốc dùng để quét |
| projects | Project[] | Project đã được chọn import |
| startCommandIds | string[] | Các service được chọn cho nút Chạy workspace |
| resources | Resource[] | Tài liệu, thư mục, URL liên quan |

`startCommandIds` không tự chạy khi mở/chuyển workspace. Thứ tự mảng là thứ tự gửi yêu cầu khởi động; chưa biểu diễn quan hệ phụ thuộc hay chờ readiness. Nếu dự án cần chờ DB sẵn sàng, dùng healthcheck/dependency trong Compose hoặc thực hiện từng bước thủ công; không hứa cả môi trường sẵn sàng từ thứ tự này. Nút Dừng tất cả dựa trên service thực tế đang chạy thuộc workspace, không chỉ trên danh sách start.

### Project

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| id | string | ID project |
| name | string | Tên hiển thị |
| directory | string | Đường dẫn tuyệt đối tới thành phần, có thể nằm ngoài root workspace khi thêm thủ công |
| technologies | string[] | Khóa công nghệ đã nhận diện/được người dùng chấp nhận, ví dụ `spring`, `java`, `react` |
| primaryCommandId | string, optional | Command mặc định cho nút chạy và panel tổng quan |
| commands | Command[] | Các service/task của project; được phép trống sau import |

Không lưu Git branch trong Project vì branch thay đổi ngoài app. Không dùng tên project hoặc directory làm ID. Thứ tự projects/commands được giữ theo mảng, không thêm trường order trùng lặp.

### Command

Các trường chung: `id`, `name`, `kind`, `workingDirectory`, `environment`. ID do backend cấp; ví dụ dùng ID dễ đọc để giải thích, khi triển khai có thể dùng UUID. ID của workspace, project, command và resource duy nhất trong file cấu hình.

`workingDirectory` là đường dẫn tương đối trong project, mặc định `.`. Backend resolve với `Project.directory`, xác minh đường dẫn thực sau symlink/junction vẫn nằm trong phạm vi project và thư mục tồn tại trước khi chạy. Muốn dùng thư mục ngoài phạm vi thì thêm project tương ứng; không dùng `../` để lách kiểm tra.

`environment` chỉ là override cho biến không nhạy cảm; mặc định thừa hưởng môi trường tiến trình app. Ví dụ Spring profile được đặt thật qua `SPRING_PROFILES_ACTIVE=local`, không có trường profile gây hiểu nhầm rằng một nhãn sẽ tự thay đổi cách Java chạy. Phần Environment trong UI có thể trình bày profile thân thiện nhưng phải ánh xạ rõ vào command/env.

| Biến thể | Trường riêng | Hành vi |
| --- | --- | --- |
| `kind: service`, `driver: process` | run, stop?, ports?, url?, healthCheck? | Tiến trình liên tục do app quản lý; stop là lệnh tùy chỉnh nếu cần |
| `kind: service`, `driver: docker-compose` | compose | Backend tạo lệnh theo đúng Compose target và kiểm tra container riêng |
| `kind: task` | run | Công việc kết thúc, có exit code; hủy bằng dừng cây tiến trình |

`run`/`stop` là chuỗi shell có chủ đích, do người dùng nhập hoặc chấp nhận gợi ý. Không thể suy ra lệnh an toàn chỉ từ việc phát hiện `package.json` hay `pom.xml`; import không chạy lệnh. Không nội suy `{directory}`, tên project hoặc dữ liệu log vào chuỗi này; cwd được truyền riêng khi khởi tạo tiến trình.

`ports` là danh sách cổng dự kiến dùng để hiển thị và kiểm tra trước khi chạy, không phải bằng chứng tiến trình đang lắng nghe. `url` là shortcut HTTP/HTTPS. Thiếu `stop`: app dừng cây tiến trình nó sở hữu; không dừng tiến trình tìm thấy theo tên/cổng.

Compose có `{ projectName, files: string[], services: string[] }`. Files tương đối với workingDirectory và phải nằm trong project; services là tên service Compose. Mảng services rỗng nghĩa là toàn bộ service của đúng Compose project đó. Backend dùng cùng cấu hình này cho `up -d`, `stop`, `ps` và `logs`, với các đối số riêng thay vì nối shell.

Chế độ Compose chuẩn sinh lệnh, không lưu đồng thời một bản chuỗi lệnh khác có thể lệch scope. Nếu người dùng cần quy trình tùy chỉnh hoàn toàn, họ có thể tạo service process chạy Compose ở foreground với lệnh dừng riêng. Lệnh detached tùy ý không được app tự nhận là đã quản lý container thành công. Không hỗ trợ `down -v` hoặc xóa volume qua nút dừng.

HealthCheck tùy chọn ở service process: `{ url, intervalMs, timeoutMs, expectedStatus }`, dùng HTTP GET. Không có object nghĩa là tắt. Backend chỉ kiểm tra khi service chạy; không đánh dấu Sẵn sàng từ PID hoặc exit code của lệnh start. Với Compose, dùng trạng thái/health do Docker báo; container không có healthcheck chỉ hiện Đang chạy.

### Resource

`{ id, name, kind: "file" | "directory" | "url", target }`. File/thư mục dùng đường dẫn tuyệt đối; URL giới hạn HTTP/HTTPS ở bản đầu. Shortcut DB mở công cụ theo cấu hình khi tính năng đó được triển khai, không đưa mật khẩu vào URL/tệp config.

## Dữ liệu không ghi vào config

| Dữ liệu | Nơi giữ | Lý do |
| --- | --- | --- |
| Run: runId, commandId, trạng thái, startedAt/endedAt, exitCode | Bộ nhớ backend | Trạng thái phiên chạy, không phải cấu hình |
| Process handle / PID | Backend, trong phiên hiện tại | PID có thể tái sử dụng sau khi thoát |
| Cấu hình đã dùng để khởi chạy run | Snapshot trong bộ nhớ cùng run | Sửa config không thay đổi cách dừng một tiến trình/Compose đã chạy |
| Git root, branch, dirty/ahead/behind | Cache backend theo Git root | Có thể thay đổi ngoài app |
| Log stdout/stderr | Ring buffer backend, bộ đệm đuôi ở frontend | Tránh ghi đĩa liên tục và tăng file config |
| Health hiện tại và thời điểm kiểm tra | Backend, event sang frontend | Không phục hồi trạng thái healthy cũ như sự thật |
| Draft form, tab đang mở, log filter | State frontend | Không cần lưu mỗi lần gõ/chọn |
| Kết quả quét chưa chọn import | Bộ nhớ trong phiên import | Chưa là dữ liệu người dùng chấp nhận |

Run metadata gồm workspaceId/projectId/commandId, runId, sequence và snapshot launch spec. Khi sửa command lúc đang chạy, cấu hình mới dùng cho lần chạy sau; Stop luôn dùng snapshot của run cũ. Không cho xóa project/command có run đang hoạt động trước khi xử lý run đó. Task build/test có kết quả Thành công/Thất bại/Đã hủy, không bị nhập nhằng với service dừng.

Mỗi run bị giới hạn 2.000 dòng và 2 MiB, đồng thời có trần tổng 32 MiB cho log backend. Khi chạm trần, bỏ log cũ và báo số dòng/byte đã bỏ; không dừng service. Giữ metadata tối đa 20 run đã kết thúc; không loại run đang hoạt động. Không tự lưu lịch sử/log dài hạn ở bản đầu; khi thoát app các dữ liệu phiên này mất.

## Kiểm tra và lưu an toàn

1. Backend là nơi duy nhất ghi file. Hạn chế một instance ghi cấu hình trên cùng user; khóa giữa các process hoặc cơ chế single-instance trước khi đọc/ghi. Mutex chỉ giải quyết đồng thời bên trong một process.
2. Mỗi mutation kèm expectedRevision. Nếu đã có bản mới, từ chối draft cũ và yêu cầu load lại/giải quyết; không âm thầm ghi đè. Revision không thay thế khóa giữa các process.
3. Validate cấu trúc và quan hệ: ID duy nhất, primaryCommandId thuộc project, startCommandIds không trùng/chỉ trỏ đến service trong workspace. Project mới được phép chưa có command. lastWorkspaceId không còn tồn tại thì bỏ lựa chọn cũ và chọn workspace đầu tiên.
4. Validate executable/path tại backend khi sử dụng. Directory bị mất vẫn giữ config và cho chọn lại; không xóa mục do ổ đĩa tạm thời không sẵn sàng. Chuẩn hóa đường dẫn bằng thư viện hệ điều hành; so sánh đúng quy tắc Windows, không lowercase toàn bộ đường dẫn trên mọi nền tảng.
5. Health URL hợp lệ HTTP/HTTPS và không chứa credentials; intervalMs tối thiểu 1.000, timeoutMs tối thiểu 100, expectedStatus là mã 200–299. Request có timeout, giới hạn response, không tự gửi secret; backend chống lượt kiểm tra chồng nhau. Cổng là integer 1–65535. Thông số giới hạn log phải hữu hạn và được chặn ở mức backend chấp nhận.
6. Ghi file tạm cùng thư mục, flush/close, giữ backup hợp lệ rồi dùng cơ chế thay thế phù hợp OS. Chỉ báo lưu thành công khi thay thế hoàn tất. Không coi `os.Rename` là bảo đảm atomic trên Windows; kiểm tra cơ chế thay thế và recovery thực tế khi triển khai.
7. Parse lỗi: giữ nguyên file lỗi, báo rõ và cho phục hồi backup sau khi người dùng chọn. Không tự ghi cấu hình rỗng đè lên file. File schemaVersion mới hơn app: mở chế độ không ghi, yêu cầu nâng cấp. Bản cũ: migrate tuần tự, backup trước khi thay thế; lỗi migration giữ bản gốc.
8. Không lưu mật khẩu/token vào config, kể cả trong chuỗi command. Không tự import nội dung `.env`. Dùng môi trường có sẵn; nếu cần quản lý secret riêng ở phiên bản sau, lưu trong kho credential của OS và config chỉ giữ reference. Che input không phải mã hóa dữ liệu; không hứa kiểm soát được secret do chương trình con tự in vào log.

Lần cài mới tạo cấu hình mặc định chỉ khi file thực sự không tồn tại. Quyền thư mục theo tài khoản người dùng; không để người dùng khác ghi vào cấu hình chứa lệnh thực thi.

## Luồng backend/frontend dự kiến

Các thao tác có ý nghĩa nghiệp vụ: lấy config, tạo/sửa/gỡ workspace hoặc project, lưu commands của project, chọn service chạy cùng workspace, start command, stop run, lấy snapshot runtime và subscribe log. Không cung cấp API tùy ý ghi file hoặc chạy bất kỳ chuỗi shell nào từ một message UI không gắn với command đã lưu.

Backend định nghĩa struct và validation; Wails sinh bindings/model cho frontend. Không xây REST server hay database server riêng. Cấu hình JSON là định dạng trên đĩa; UI không tự đọc/ghi JSON bằng localStorage.

## Tình huống kiểm chứng khi triển khai

- Monorepo có frontend/backend chung Git root nhưng command và thư mục làm việc riêng.
- Project có Run local/Debug dùng chung cổng: chỉ chạy chế độ được chọn, báo cổng xung đột khi cố chạy đồng thời.
- Đổi tên project/command không mất liên kết runtime vì dùng ID; sửa thư mục/stop không làm Stop nhắm nhầm run cũ.
- Hai cửa sổ hoặc hai instance cùng lưu: revision và khóa ngăn mất dữ liệu.
- Config hỏng, mất quyền ghi hoặc mất điện giữa lúc thay thế: không ghi thành công giả hoặc thay bằng cấu hình rỗng.
- Compose restart và process PID bị tái sử dụng: không phục hồi trạng thái running bằng dữ liệu PID cũ.
- Đổi workspace chỉ đổi lựa chọn; startCommandIds không được tự thực thi.

## Trạng thái tài liệu

Đây là thiết kế dữ liệu đề xuất; mẫu JSON đã được kiểm tra cấu trúc/tham chiếu bằng assert. Chưa triển khai backend lưu trữ, JSON Schema validator, migration hoặc quản lý tiến trình. Đường dẫn, lệnh và URL ví dụ phải được người dùng xác minh cho dự án thật.

## Mẫu cấu hình minh họa

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "settings": {
    "theme": "dark",
    "locale": "vi-VN",
    "timeZone": "Asia/Ho_Chi_Minh",
    "editor": {
      "executable": "C:/Program Files/Microsoft VS Code/Code.exe",
      "args": ["{directory}"]
    },
    "terminal": {
      "executable": "wt.exe",
      "args": ["-d", "{directory}"]
    },
    "shell": {
      "executable": "C:/Program Files/PowerShell/7/pwsh.exe",
      "args": ["-NoLogo", "-NoProfile", "-Command"]
    },
    "logs": {
      "maxLinesPerRun": 2000,
      "maxBytesPerRun": 2097152,
      "maxBytesTotal": 33554432,
      "maxCompletedRuns": 20
    }
  },
  "lastWorkspaceId": "ws-commerce",
  "workspaces": [
    {
      "id": "ws-commerce",
      "name": "Ecommerce",
      "rootPath": "D:/Projects/shop",
      "projects": [
        {
          "id": "prj-storefront",
          "name": "frontend",
          "directory": "D:/Projects/shop/frontend",
          "technologies": ["react", "typescript", "vite"],
          "primaryCommandId": "cmd-storefront-dev",
          "commands": [
            {
              "id": "cmd-storefront-dev",
              "name": "Dev server",
              "kind": "service",
              "driver": "process",
              "workingDirectory": ".",
              "run": "npm run dev -- --host 127.0.0.1",
              "environment": {},
              "ports": [5173],
              "url": "http://localhost:5173"
            },
            {
              "id": "cmd-storefront-build",
              "name": "Build",
              "kind": "task",
              "workingDirectory": ".",
              "run": "npm run build",
              "environment": {}
            }
          ]
        },
        {
          "id": "prj-iam",
          "name": "iam-service",
          "directory": "D:/Projects/shop/iam",
          "technologies": ["spring", "java", "maven"],
          "primaryCommandId": "cmd-iam-local",
          "commands": [
            {
              "id": "cmd-iam-local",
              "name": "Run local",
              "kind": "service",
              "driver": "process",
              "workingDirectory": ".",
              "run": ".\\mvnw.cmd spring-boot:run",
              "environment": {"SPRING_PROFILES_ACTIVE": "local"},
              "ports": [8080],
              "url": "http://localhost:8080",
              "healthCheck": {
                "url": "http://localhost:8080/actuator/health",
                "intervalMs": 10000,
                "timeoutMs": 2000,
                "expectedStatus": 200
              }
            },
            {
              "id": "cmd-iam-debug",
              "name": "Debug local",
              "kind": "service",
              "driver": "process",
              "workingDirectory": ".",
              "run": ".\\mvnw.cmd spring-boot:run -Dspring-boot.run.jvmArguments=\"-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:5005\"",
              "environment": {"SPRING_PROFILES_ACTIVE": "local"},
              "ports": [8080, 5005]
            },
            {
              "id": "cmd-iam-test",
              "name": "Test",
              "kind": "task",
              "workingDirectory": ".",
              "run": ".\\mvnw.cmd test",
              "environment": {}
            }
          ]
        },
        {
          "id": "prj-infra",
          "name": "infrastructure",
          "directory": "D:/Projects/shop/infra",
          "technologies": ["docker", "postgresql", "redis"],
          "primaryCommandId": "cmd-infra-up",
          "commands": [
            {
              "id": "cmd-infra-up",
              "name": "Local infrastructure",
              "kind": "service",
              "driver": "docker-compose",
              "workingDirectory": ".",
              "environment": {},
              "compose": {
                "projectName": "dwrk-commerce",
                "files": ["compose.yaml"],
                "services": ["postgres", "redis"]
              }
            }
          ]
        }
      ],
      "startCommandIds": ["cmd-infra-up", "cmd-iam-local", "cmd-storefront-dev"],
      "resources": [
        {"id": "res-docs", "name": "Tài liệu dự án", "kind": "directory", "target": "D:/Projects/shop/docs"},
        {"id": "res-readme", "name": "Hướng dẫn chạy", "kind": "file", "target": "D:/Projects/shop/README.md"},
        {"id": "res-local", "name": "Ứng dụng local", "kind": "url", "target": "http://localhost:5173"}
      ]
    }
  ]
}
```
