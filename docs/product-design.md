# DWRK — thiết kế chức năng

## Mục tiêu và quyết định đã chốt

Trung tâm làm việc cho một dev trên máy cá nhân: giảm thao tác mở dự án, chạy/dừng môi trường và tìm log khi làm nhiều dự án có công nghệ khác nhau.

- Workspace là một dự án, có thư mục gốc chứa repo, docs và các thành phần liên quan.
- Chọn thư mục, quét, xem kết quả và chọn nội dung import. Có thể thêm từng mục thủ công.
- Chuyển workspace chỉ đổi giao diện, không chạy/dừng hoặc mở công cụ tự động.
- Người dùng tự cấu hình và chủ động chạy/dừng từng service hoặc một nhóm được chọn.
- Ưu tiên Windows và máy ít RAM ở bản đầu.

## Mô hình chức năng

| Thành phần | Nội dung | Thao tác |
| --- | --- | --- |
| Workspace | Tên, thư mục gốc, repo, service, tài liệu, liên kết | Thêm, sửa, chuyển, gỡ khỏi app |
| Project | Thư mục thành phần kỹ thuật, có thể có hoặc không có Git; chứa nhiều command | Mở công cụ, sửa cấu hình và chọn lệnh mặc định |
| Repository | Tên, đường dẫn, thông tin Git | Mở IDE, terminal, thư mục; xem trạng thái Git |
| Service | Tên, thư mục chạy, chế độ chạy, lệnh và môi trường | Chạy, dừng, chạy lại, cấu hình, xem log |
| Task | Lệnh kết thúc sau khi thực hiện: build, test, đóng gói | Chạy, hủy, xem kết quả và exit code |
| Tài liệu / liên kết | File, thư mục docs, URL localhost, tài liệu nội bộ | Mở bằng công cụ hệ thống |

Workspace chứa các project; project chứa command loại service hoặc task. Một project có thể là repo, module trong monorepo hoặc thư mục không dùng Git. Một repo có thể cung cấp nhiều project và service. Task được phân biệt với service để build thành công không bị hiển thị thành service bị dừng bất thường. Thuật ngữ được ghi tại `CONTEXT.md`; mô hình lưu cụ thể tại `docs/data-storage.md` và cấu trúc frontend tại `docs/frontend-architecture.md`.

## Luồng thêm workspace và import

1. Nhập tên và chọn thư mục gốc bằng hộp chọn thư mục của hệ thống.
2. Quét trong phạm vi thư mục đã chọn; cho phép hủy và hiển thị thư mục không đọc được.
3. Hiện danh sách có checkbox: tên, đường dẫn tương đối, loại mục, dấu hiệu công nghệ, trạng thái đã import.
4. Người dùng chọn từng mục, xem số mục được chọn rồi import.
5. Repo và tài liệu được thêm ngay. Lệnh service chỉ là gợi ý, người dùng kiểm tra/lưu trước khi chạy.

Nhận diện Git bằng `.git` là thư mục hoặc file để hỗ trợ worktree. Nhận diện thêm các dấu hiệu `pom.xml`, `build.gradle`, `build.gradle.kts`, `package.json`, `compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`. Các dấu hiệu được gộp theo đường dẫn, không biến mỗi file thành một project riêng. Một repo monorepo vẫn có thể có nhiều thư mục chạy service.

Không đi vào `.git`, `node_modules`, `target`, `dist`, `build` và không theo symlink/junction. File công nghệ không chứng minh được lệnh chạy chính xác. Quét không chạy script, không pull Git, không build và không đọc/import secret từ `.env`.

Repo đã import được đánh dấu theo đường dẫn tuyệt đối đã chuẩn hóa theo Windows. Không tự chọn thư mục tài liệu chỉ dựa vào tên: cho phép gán loại hoặc thêm thủ công. Import thủ công dùng cùng bước kiểm tra đường dẫn và chống trùng. Quét lại cho phép thêm mục mới; không tự xóa mục cũ.

## Màn hình tổng quan

Hướng giao diện cập nhật: nền tối than, điểm nhấn xanh ngọc; có nút chuyển sáng/tối ở thanh trên và ghi nhớ lựa chọn. Dark mode là mặc định khi chưa có lựa chọn. Bố cục desktop gồm sidebar workspace, danh sách project/service ở giữa, panel chi tiết service bên phải và log trải ngang phía dưới. Khi cửa sổ hẹp, panel chi tiết chuyển xuống dưới danh sách để giữ nội dung dễ đọc. Trạng thái dùng cả chữ và ký hiệu, không chỉ dùng màu.

Frontend mock hiện hiển thị ngày giờ UTC+7 với icon đồng hồ ở footer thay cho dòng công nghệ; đồng hồ cập nhật riêng, không khiến toàn bộ app render lại. Đường dẫn project và nhánh Git có icon để nhận biết nhanh.

Stack frontend đã triển khai cho bản mock: shadcn/ui trên nền Radix UI, Tailwind CSS để style/responsive, giữ React + TypeScript + Vite. Chi tiết cấu trúc và nguyên tắc hiệu năng tại `docs/frontend-architecture.md`. Các thao tác service, quét, Git và công cụ vẫn là mô phỏng; chưa nối backend hoặc lưu cấu hình thật.

Chọn project/service cập nhật đồng thời panel chi tiết và nguồn log. Panel chi tiết có Tổng quan và Lệnh chạy, cung cấp thư mục làm việc, lệnh, trạng thái, cấu hình kiểm tra sẵn sàng và nút mở IDE/terminal. Trạng thái Đang chạy tách biệt với Sẵn sàng; chưa có health check thì không hiện Sẵn sàng. Nút Chạy workspace và Dừng tất cả chỉ áp dụng workspace hiện tại, không kích hoạt khi đổi workspace.

Chi tiết bố cục sau khi tham khảo giao diện:

- Frontend mock từ 1050px: sidebar workspace, cột trái chứa cả tiêu đề workspace / thao tác nhóm / project, panel chi tiết bên phải bắt đầu ngang tiêu đề. Log nằm dưới và trải cả hai cột nội dung.
- Từ 1450px: sidebar 220px, panel chi tiết khoảng 31% vùng nội dung; hàng project tách tên/công nghệ, đường dẫn/branch và các nút thao tác thành ba phần.
- Dưới 1050px: nội dung xếp danh sách → chi tiết → log; dưới 1024px, sidebar chuyển thành nhóm workspace phía trên. Đã kiểm tra không tràn ngang từ 320px. Các ngưỡng có thể tinh chỉnh sau khi kiểm tra WebView native.
- Từng project có nút bánh răng và panel có tab Cấu hình. Có thể sửa tên, thư mục chạy, cổng, lệnh chạy/dừng, thêm/xóa các lệnh build/test/debug có tên riêng và cấu hình health check.
- Health check gồm bật/tắt, URL HTTP/HTTPS, chu kỳ giây và timeout ms. Không tự chạy health check chỉ vì lưu cấu hình. Giá trị profile trong bản thiết kế là nhãn ghi chú; tham số thực thi phải nằm trong lệnh phù hợp công nghệ, tránh ngầm áp dụng profile sai.
- Lưu cấu hình không tự restart. Lệnh bổ sung có tên duy nhất trong project và nội dung không rỗng; cổng 1–65535. Khi bật health check, URL và các khoảng thời gian phải hợp lệ.

## Nguồn icon

Chọn [Devicon](https://devicon.dev/) cho logo ngôn ngữ/framework/công cụ; dự án cung cấp SVG màu gốc và các biến thể. Bản xem sử dụng một số SVG từ phiên bản v2.16.0: React, Spring, Go, Docker và Java. [Kho nguồn](https://github.com/devicons/devicon) có giấy phép MIT và ghi rõ logo thuộc chủ sở hữu thương hiệu, cần dùng theo quy định của thương hiệu.

Chọn [Lucide](https://lucide.dev/guide/) cho icon thao tác như chạy, dừng, cài đặt, thư mục, terminal. Khi triển khai desktop, đóng gói các SVG công nghệ cần dùng cùng app, giữ thông tin giấy phép; không tải cả font icon hoặc phụ thuộc CDN khi app chạy offline. Công nghệ chưa nhận diện dùng icon repo chung, tên công nghệ luôn có bằng chữ. Không dùng icon lá cây chung để thay logo Spring.

- Thanh trái: danh sách workspace, số service đang chạy theo workspace, nút thêm workspace và danh sách service đang chạy toàn cục.
- Đầu trang: tên workspace, thư mục gốc, quét/import và thêm thủ công.
- Tab Tổng quan: service, trạng thái, chạy/dừng, log, cấu hình; task build/test và công cụ thường dùng.
- Tab Repositories: mở IDE, terminal hoặc Explorer tại đúng thư mục.
- Tab Git: branch, file thay đổi, commit ahead/behind nếu có thông tin; làm mới và mở terminal Git tại repo.
- Tab Tài liệu & liên kết: docs, README, URL ứng dụng, trang quản trị và shortcut công cụ DB.
- Panel log bên dưới: chọn service/task, đầu ra stdout/stderr, tìm trong bộ đệm, tạm ngừng cuộn, sao chép, xóa phần hiển thị.

Không tự mở toàn bộ IDE/terminal khi chuyển workspace. Nút chạy/dừng nhóm luôn hiển thị rõ phạm vi workspace và các service được chọn, không tác động workspace khác.

## Cấu hình chạy/dừng

Mỗi service có tên, thư mục chạy, shell, lệnh chạy, lệnh dừng tùy chọn, URL/cổng tùy chọn và biến môi trường bổ sung. Giá trị mặc định lấy môi trường của app. Không hiển thị giá trị secret trong thông báo hoặc log do app tự tạo; đầu ra của chương trình vẫn có thể chứa secret do chương trình in ra.

Hai chế độ có hành vi khác nhau:

| Chế độ | Ví dụ | Cách quản lý |
| --- | --- | --- |
| Tiến trình do app khởi chạy | Spring Boot, React, Wails | App giữ process handle, thu log và dừng cây tiến trình do nó tạo |
| Điều khiển môi trường bên ngoài | Docker Compose chạy detached | Lệnh start/stop và kiểm tra trạng thái bên ngoài; start command hoàn thành chưa chứng minh service đã sẵn sàng |

Với Docker Compose, kiểm tra container của đúng Compose project, lấy log qua Docker, không gắn nhãn đang chạy chỉ vì `docker compose up -d` trả về thành công. Không tự `down -v`, xóa volume hoặc dừng toàn bộ Docker.

Lệnh dừng tùy chỉnh được ưu tiên nếu có; khi thất bại, hiển thị lỗi và giữ trạng thái chưa xác định nếu chưa kiểm tra được. Buộc dừng chỉ áp dụng cây tiến trình thuộc app, được người dùng chọn rõ ràng. Không kill tiến trình lạ chỉ vì cùng tên hoặc chiếm cổng.

Trạng thái service: Đã dừng → Đang khởi động → Đang chạy → Đang dừng → Đã dừng. Tách trạng thái Lỗi và Chưa xác định. Tiến trình tồn tại không đồng nghĩa ứng dụng sẵn sàng nhận request; chỉ báo Sẵn sàng khi có kiểm tra phù hợp được cấu hình. Task có trạng thái Chưa chạy / Đang chạy / Thành công / Thất bại / Đã hủy và exit code.

Chống chạy trùng và vô hiệu thao tác xung đột trong lúc chuyển trạng thái. Nếu cổng đã khai báo bị chiếm, hiển thị thông tin kiểm tra được và cho người dùng xử lý; không tự đổi cổng. Không tự restart khi crash.

Đóng app khi còn tiến trình do app quản lý: hiển thị danh sách và lựa chọn dừng rồi thoát hoặc hủy thoát. Môi trường bên ngoài không bị dừng ngầm. Khi mở lại app, kiểm tra lại trạng thái bên ngoài; không tin PID lưu từ phiên trước vì PID có thể được tái sử dụng.

## Git, Docker, database và debug

- Git bản đầu chỉ đọc trạng thái và mở công cụ/terminal đúng repo. Ahead/behind dựa trên thông tin local và ghi rõ chưa fetch; repo không có upstream hiển thị tương ứng. Không tự commit, pull, push hay reset hàng loạt.
- Docker bản đầu quản lý Compose gắn với workspace, không xây một trình quản lý toàn bộ Docker host.
- Database bản đầu mở client đã cấu hình hoặc giao diện web quản trị. Không xây SQL editor và không lưu mật khẩu DB vào đường dẫn shortcut.
- Debug bản đầu mở IDE và hỗ trợ lệnh chạy chế độ debug đã cấu hình. Attach/debugger nằm trong IDE.

## Lưu trữ, tài nguyên và lỗi

- Lưu cấu hình cục bộ trong thư mục dữ liệu người dùng của app, có phiên bản định dạng và ghi nguyên tử. Không phụ thuộc thư mục repo; không đưa cấu hình máy cá nhân hoặc secret vào Git mặc định.
- Gỡ workspace/repo chỉ gỡ cấu hình khỏi app, không xóa dữ liệu trên đĩa. Workspace còn service do app quản lý phải được xử lý trước khi gỡ.
- Đường dẫn bị đổi/mất hiển thị lỗi và cho chọn lại, không tự xóa mục.
- Giới hạn log mỗi service ở 2.000 dòng và 2 MiB, chạm giới hạn thì bỏ phần cũ; giới hạn cả kích thước dòng. Dừng đọc log view khi không cần và dọn listener sau khi thoát.
- Không chạy kiểm tra Git/Docker liên tục trên mọi workspace. Làm mới khi mở màn hình, theo yêu cầu và theo chu kỳ nhẹ cho view đang xem; cache và tránh chạy các lần kiểm tra chồng nhau.
- Một bộ quản lý tiến trình tại backend Go. React chỉ hiển thị trạng thái và gửi yêu cầu; đổi tab hoặc workspace không tạo tiến trình mới.
- Không thêm terminal nhúng ở bản đầu. Mở terminal hệ thống tại thư mục cần dùng; panel log dành cho service/task do app điều khiển.
- Chỉ chạy các lệnh người dùng đã chủ động cấu hình/chấp nhận. Không thực thi tự động nội dung phát hiện khi quét repo.

## Thứ tự triển khai đề xuất

1. Workspace, chọn thư mục, quét/chọn import, lưu cấu hình, repo và mở IDE/terminal/docs.
2. Service và task cấu hình thủ công, chạy/dừng đúng cây tiến trình Windows, trạng thái và log có giới hạn; danh sách tiến trình toàn cục và xử lý thoát app.
3. Trạng thái Git theo repo, Docker Compose, shortcut DB/debug và thao tác nhóm được chọn.

Mỗi giai đoạn là một luồng dùng được; không thêm cloud sync, quản lý team, tự cài SDK, terminal nhúng hoặc trình SQL ở bản đầu.

## Tiêu chí nghiệm thu chính

- Quét thư mục có nhiều repo, docs và monorepo: người dùng chọn đúng nội dung import, không bị nhân đôi khi quét lại, không có lệnh tự chạy.
- Mở IDE/terminal tại đúng thư mục, kể cả đường dẫn có dấu cách và tiếng Việt.
- Chạy và dừng hai service độc lập; dừng đúng cây tiến trình, không tác động service còn lại.
- Chuyển A → B không thay đổi trạng thái service của A; danh sách toàn cục vẫn tìm được service đó.
- Build kết thúc exit 0 hiển thị Thành công; service crash giữ log và hiện lỗi; start/stop thất bại không hiện thành công giả.
- Docker detached được xác minh riêng và không xóa dữ liệu container/volume.
- Log dài không tăng RAM vô hạn; cấu hình còn nguyên sau khi mở lại app.
- Gỡ workspace không xóa repo; đóng app xử lý rõ các tiến trình còn chạy.

## Phạm vi bản xem giao diện

Bản xem giao diện đi kèm sử dụng dữ liệu giả. Có thể đổi workspace, chuyển tab, mô phỏng chạy/dừng, chọn log, sửa lệnh và chọn mục import. Chưa nối filesystem, Git, Docker, tiến trình hệ điều hành hay lưu cấu hình thật. Một số thao tác chỉ hiển thị thông báo mô phỏng để minh họa vị trí và mục đích của nút.
