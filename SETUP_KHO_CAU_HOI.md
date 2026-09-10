# Cài đặt tính năng "Kho câu hỏi + Sinh đề theo ma trận"

Tính năng mới, KHÔNG đụng gì tới luồng tạo đề/thi/chấm điểm đang chạy — chỉ thêm bảng, hàm,
trang mới. Toàn bộ file trong gói này đã được đặt đúng vị trí trong cây thư mục repo
`luyenthi_xuxu`, chỉ cần giải nén đè lên (các file cũ bị sửa: `src/types/index.ts`,
`src/App.tsx`, `src/components/TopBar.tsx`, `src/pages/TeacherClassDetail.tsx` — chỉ có phần
thêm mới, không xóa gì).

## Vì sao chọn cách này (không mất phí)

- **Không dùng Google Drive**: bỏ qua hoàn toàn việc tích hợp Google Drive API (OAuth, quyền
  truy cập, token hết hạn...) — quá phức tạp cho việc chỉ cần *đọc nội dung câu hỏi*. Thay vào
  đó, câu hỏi được đọc trực tiếp từ file Word ngay trên trình duyệt (dùng lại đúng engine
  `docxParser.ts` đang chạy khi tạo đề thủ công) rồi lưu dạng dữ liệu có cấu trúc vào Postgres
  của Supabase — vẫn nằm trong gói miễn phí bạn đang dùng, không tốn thêm dung lượng lưu trữ
  file nào cả.
- **Đa dạng nguồn đề**: trang Kho câu hỏi cho tải **nhiều file Word cùng lúc**, mỗi câu được gắn
  `source_file` (tên file gốc) để truy vết — bạn có thể liên tục tải thêm đề thi thử sưu tầm từ
  nhiều trường/nhiều năm, kho sẽ lớn dần theo thời gian, không giới hạn số lần tải.
- **Chi phí duy nhất phát sinh** là gọi Anthropic API để AI tự gán chủ đề/mức độ (không thể miễn
  phí 100% nếu muốn AI phân loại tự động) — đã chọn model **Claude Haiku** (rẻ nhất, đủ chính
  xác cho việc gán nhãn) thay vì Sonnet để tối ưu chi phí khi phân loại hàng trăm câu/lần.

## Các bước cài đặt (làm 1 lần)

### 1. Chạy SQL thêm bảng mới

Vào Supabase Dashboard → SQL Editor → dán toàn bộ nội dung `supabase/schema_question_bank.sql`
→ Run. File này chỉ thêm bảng `question_bank` + 2 hàm RPC, không đổi bảng cũ.

### 2. Deploy Edge Function phân loại AI

```bash
npm install -g supabase   # nếu chưa có CLI
supabase login
supabase link --project-ref <project-ref-của-bạn>   # xem ở Project Settings > General
supabase functions deploy classify-questions
```

### 3. Lấy Anthropic API key và cấu hình secret

Lấy key tại https://console.anthropic.com (mục API Keys), rồi:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

Key được giữ hoàn toàn phía server (Edge Function) — không bao giờ lộ ra trình duyệt học sinh
hay giáo viên.

### 4. Merge code vào repo và deploy như bình thường

Giải nén gói này đè lên thư mục repo, rồi:

```bash
git add .
git commit -m "Thêm kho câu hỏi + sinh đề theo ma trận"
git push
```

Vercel tự build lại — không cần thêm biến môi trường nào ở phía Vercel (API key chỉ nằm ở
Supabase secrets).

## Cách dùng

1. **Tạo Chương trước** (nếu chưa có): mục "Bài giảng" → chọn khối → thêm Chương. Danh sách
   Chương chính là danh sách "chủ đề" mà AI sẽ dùng để phân loại — nên đặt tên đúng như bạn muốn
   thấy trong ma trận đề (VD: "Chương 1: Mệnh đề - Tập hợp").
2. **Tải kho đề**: menu trên cùng → "Kho câu hỏi" → chọn khối → chọn nhiều file Word cùng lúc.
   Hệ thống tách câu, AI gán chủ đề + mức độ (Nhận biết/Thông hiểu/Vận dụng/Vận dụng cao) → rà
   lại các câu có cờ "⚠ Cần rà lại" → bấm "Lưu vào kho".
3. **Sinh đề từ ma trận**: vào trang chi tiết lớp → nút "🧩 Sinh đề từ ma trận" → điền thông tin
   đề như bình thường → thêm các dòng ma trận (chủ đề × mức độ × dạng câu × số lượng, có hiện
   sẵn "còn bao nhiêu câu" trong kho) → "Sinh đề từ ma trận". Đề được tạo xong sẽ mở màn hình
   chỉnh sửa đề (`/teacher/exams/:id/edit`) để rà lại trước khi mở cổng thi cho học sinh.

## Giới hạn cần biết

- Nếu kho chưa đủ câu ở một ô nào đó của ma trận, hệ thống lấy hết số câu hiện có và **báo rõ
  thiếu bao nhiêu câu** thay vì âm thầm tạo đề thiếu câu — bạn cần tải thêm đề vào đúng
  chủ đề/mức độ đó rồi sinh lại, hoặc bổ sung thủ công ở màn hình chỉnh sửa đề.
- AI phân loại có thể sai, nhất là với câu hỏi mơ hồ hoặc chủ đề gần nhau — luôn rà lại các câu
  có cờ "⚠ Cần rà lại" trước khi lưu vào kho.
