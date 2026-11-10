# DWRK

Môi trường làm việc của một dev có nhiều dự án, nhiều repo và nhiều cách vận hành trên cùng máy tính.

## Language

**Workspace**:
Một dự án nghiệp vụ/công ty, gom các thành phần kỹ thuật và tài liệu liên quan thành một ngữ cảnh làm việc.
_Avoid_: Dùng Project để chỉ đồng thời workspace và từng thành phần bên trong.

**Project**:
Một thành phần kỹ thuật có thư mục làm việc, ví dụ frontend, backend hoặc infrastructure. Project có thể nằm trong một repo, là một repo riêng hoặc không dùng Git.
_Avoid_: Đồng nhất Project với Repository hoặc với một service duy nhất.

**Repository**:
Một kho Git; có thể chứa nhiều project trong trường hợp monorepo. Branch và thay đổi file thuộc repository.
_Avoid_: Coi mỗi module trong monorepo là một repository khác nhau.

**Command**:
Một hành động có tên gắn với project, gồm loại chạy service hoặc thực hiện task. Một project có thể có nhiều command.
_Avoid_: Chỉ có một cặp Run/Stop duy nhất cho mọi cách chạy của project.

**Service**:
Một thành phần được kỳ vọng hoạt động liên tục cho đến khi chủ động dừng, bao gồm ứng dụng hoặc nhóm container Compose.
_Avoid_: Dùng Service cho build hoặc test kết thúc bình thường.

**Task**:
Một công việc có điểm kết thúc và kết quả, ví dụ build, test hoặc đóng gói.
_Avoid_: Gọi task hoàn thành là service bị lỗi hoặc bị dừng bất thường.

**Run**:
Một lần thực thi cụ thể của command, có thời điểm bắt đầu, trạng thái, đầu ra và kết quả riêng.
_Avoid_: Đồng nhất cấu hình command với trạng thái của lần chạy gần nhất.
