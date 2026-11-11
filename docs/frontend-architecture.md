# Frontend DWRK — cấu trúc và lựa chọn UI

Cập nhật triển khai: App đã dùng ConfigService, RuntimeService và DesktopService qua bindings Wails. Model Go được chuyển sang view model tại src/lib/model.ts; dữ liệu mock chỉ còn phục vụ test cũ. Runtime được lấy tuần tự, chỉ mang log của command đang chọn; subscription sự kiện thoát app được dọn khi unmount. Các mô tả “chưa nối backend” bên dưới là bối cảnh của bản thiết kế ban đầu.

## Stack đã chọn

Giữ React + TypeScript + Vite hiện có. Chọn **shadcn/ui + Radix UI + Tailwind CSS** theo yêu cầu người dùng. shadcn cung cấp mã nguồn component có thể tùy biến; Radix xử lý hành vi và accessibility cho các thành phần như Dialog, AlertDialog, DropdownMenu, Tabs và Select; Tailwind dùng cho style và responsive. Dùng CSS variables cho theme, CSS Grid/container queries cho bố cục, Lucide cho thao tác và SVG Devicon đóng gói cục bộ cho công nghệ.

Chọn nền Radix một cách tường minh khi khởi tạo shadcn; không dựa vào mặc định CLI và không trộn component từ hai nền Radix/Base UI. Chỉ thêm component cần dùng. Không viết lại focus trap hoặc xử lý menu bàn phím. Kiểm tra peer dependency với React hiện có trước khi triển khai; không tự nâng React chỉ để theo template mới.

Tailwind tạo CSS lúc build, không cần runtime styling. Không có benchmark để khẳng định stack này luôn nhanh hơn CSS Modules hay bộ UI khác. Hiệu năng của DWRK chủ yếu cần kiểm soát luồng log, số DOM node, số subscription và tần suất cập nhật; lựa chọn stack giúp có component nhất quán và dễ tự phát triển.

Frontend mock đã được triển khai theo stack này; backend chưa được kết nối. Đã có alias `@`, Tailwind Vite plugin, cấu hình shadcn, component Radix và logo cục bộ. Giữ React 18 và điều chỉnh ref của Button/Dialog cho tương thích. Chỉ theme được lưu trong localStorage; dữ liệu mock còn lại nằm trong bộ nhớ.

## Cấu trúc thư mục

Chia theo tính năng; kiểm thử đặt cạnh logic chúng phục vụ. Component shadcn đặt trong `components/ui` theo quy ước của công cụ; style chung nằm trong `styles`. Không dùng CSS Modules làm lớp style song song. Cây dưới là cấu trúc đích khi nối backend; bản mock chỉ tạo phần đang dùng, reducer/DTO tạm nằm trong `src/mock`, chưa cần ConfigProvider hoặc runtime/log store riêng.

```text
frontend/
├── bindings/                       # Wails sinh từ Go; không sửa tay
├── public/                         # Chỉ tài nguyên cần URL tĩnh
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx                 # Khởi tạo, chọn workspace và kết nối dữ liệu
    │   ├── AppShell.tsx            # Sidebar, nội dung, footer
    │   └── ConfigProvider.tsx      # Snapshot cấu hình + thao tác lưu ít thay đổi
    ├── features/
    │   ├── workspaces/
    │   │   ├── WorkspaceSidebar.tsx
    │   │   └── ImportProjectsDialog.tsx
    │   ├── projects/
    │   │   ├── ProjectList.tsx
    │   │   ├── ProjectDetails.tsx
    │   │   └── ProjectSettingsDialog.tsx
    │   ├── commands/
    │   │   └── CommandList.tsx
    │   ├── logs/
    │   │   ├── LogPanel.tsx
    │   │   └── logStore.ts
    │   └── settings/
    │       └── SettingsDialog.tsx
    ├── runtime/
    │   └── runtimeStore.ts         # Trạng thái run, subscription theo command
    ├── components/
    │   ├── ui/                    # Mã component shadcn trên nền Radix
    │   ├── icons/
    │   │   └── TechnologyIcon.tsx  # Map khóa công nghệ → SVG, fallback repo
    │   └── StatusBar.tsx           # Đồng hồ tự cập nhật, không render lại app
    ├── lib/
    │   └── utils.ts               # Helper cn theo component shadcn thực sự dùng
    ├── assets/
    │   └── technologies/           # Chỉ các logo thực sự dùng + giấy phép
    └── styles/
        └── globals.css            # Tailwind, theme tokens, font, accessibility
```

Không thêm `entities`, repository frontend, API client chung hoặc nhiều tầng service chỉ để chuyển tiếp lời gọi. Component/tính năng gọi binding Wails được sinh sẵn; chỉ tách hàm gom thao tác khi có logic thật. Go là nguồn định nghĩa kiểu dữ liệu lưu trữ; frontend dùng model được Wails sinh ra, không duy trì một bản TypeScript giống hệt bằng tay.

Các phần dùng chung không import ngược từ feature. App ghép các feature với nhau qua ID và props; không để ProjectList trực tiếp điều khiển DOM của LogPanel. Thêm file test cạnh logic xử lý thực sự, không tạo test cho mỗi component chỉ để đủ cây thư mục.

## Dữ liệu và cập nhật giao diện

- ConfigProvider chứa snapshot cấu hình đã lưu, loading/error và hành động cấu hình. Form giữ draft cục bộ đến khi Save; Cancel bỏ draft.
- Chọn workspace/project/command là state giao diện; đổi lựa chọn không gọi Start/Stop.
- Runtime và log không đặt vào context cấu hình. Dùng `useSyncExternalStore` cho subscription theo command/run, snapshot giữ ổn định khi không có thay đổi. Không tạo nhiều store library nếu React đã đáp ứng.
- Backend là chủ sở hữu trạng thái tiến trình. Khi kết nối/reload: đăng ký event trước, lấy snapshot có sequence, áp snapshot rồi chỉ xử lý event mới hơn; mất thứ tự/khoảng trống thì đồng bộ lại.
- Event luôn có workspaceId, projectId, commandId, runId và sequence. Run mới không trộn log hoặc trạng thái của run cũ.
- Đồng hồ đã nằm trong component con của StatusBar, cập nhật mỗi giây và dọn timer khi unmount. Không đưa đồng hồ vào state App khiến tất cả project render lại.

## Ưu tiên hiệu năng cụ thể

1. Log: backend dùng ring buffer, giới hạn cả byte và dòng; gom event khoảng 100ms hoặc khi batch đạt giới hạn byte, tránh IPC từng dòng. Không cắt mất UTF-8 hoặc để một dòng dài vượt bộ đệm.
2. Chỉ stream log của run đang xem; khi đổi run, lấy phần đuôi có sequence rồi nhận phần mới. Backend vẫn giữ buffer có giới hạn cho các run khác. Chỉ giữ tối đa 200 dòng trong DOM ở bản đầu, báo rõ đang xem phần đuôi. Nếu cần cuộn toàn bộ 2.000 dòng thì dùng virtual list sau khi đo nhu cầu.
3. Trạng thái Git: cache theo Git root để hai module cùng monorepo không chạy hai lần Git. Làm mới khi cần; không poll mọi repo nền mỗi giây.
4. Health check chỉ hoạt động với service liên quan đang chạy, có timeout, không chạy chồng lượt. Đổi workspace không tắt health check của service đang chạy.
5. Dialog cấu hình/import chỉ mount khi mở. Import icon cụ thể, không import cả bộ icon động hoặc tải logo từ Internet lúc app chạy.
6. Theme dùng class `dark` và CSS variables theo cấu hình shadcn/Tailwind; system theo `prefers-color-scheme`, lựa chọn thủ công được lưu. Frontend mock dùng media queries theo cửa sổ WebView; bản mockup trong chat trước đó dùng container queries và `data-theme`. Container queries có thể áp dụng khi có panel thay đổi kích thước độc lập.
7. Dọn event listener, timer và subscription khi unmount; kiểm tra dưới React StrictMode để tránh nhân đôi listener.

Build mock hiện tại khoảng 303 kB JS / 96 kB gzip và 43 kB CSS / 8 kB gzip (chưa bao gồm font và SVG). Đã kiểm tra không tràn ngang ở 7 mức rộng 320–1586px. Chưa đo thời gian mở native app, CPU khi rảnh hoặc RAM với tiến trình thật; không suy ra các số này từ kích thước bundle.

## Nguồn tham khảo chính thức

- [shadcn/ui với Vite](https://ui.shadcn.com/docs/installation/vite) — tích hợp với frontend hiện có, không tạo app/template khác thay Wails.
- [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) — component không áp style, tập trung accessibility và có thể dùng dần từng phần.
- [Tailwind với Vite](https://tailwindcss.com/docs/installation/using-vite) và [Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli) — luồng build CSS, không cần runtime styling.
- [shadcn/ui](https://ui.shadcn.com/docs) — phân phối mã nguồn component để tự quản lý và tùy biến.
- [shadcn: thay đổi nền mặc định](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default) — cần chọn Radix tường minh theo yêu cầu dự án.
- [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) — cơ chế subscription và snapshot của external store.
- [React: tránh state dư thừa](https://react.dev/learn/you-might-not-need-an-effect) — tính giá trị dẫn xuất trực tiếp thay vì đồng bộ thêm state bằng effect.