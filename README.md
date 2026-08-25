# Hệ thống thi thử trực tuyến (React + TypeScript + Supabase)

Ứng dụng web thi thử: giáo viên tạo lớp, thêm học sinh (mã + mật khẩu riêng), soạn đề thi
(tải từ Word hoặc nhập tay), cài lịch mở/đóng cổng thi và quy trình "phải hoàn thành đợt trước
mới được thi đợt sau". Học sinh đăng nhập bằng mã lớp + mã học sinh, làm bài có đếm giờ, nộp bài
và xem lời giải chi tiết ngay.

## Vì sao cần Supabase (không chỉ là site tĩnh)?

Yêu cầu "học sinh đăng nhập bằng mã lớp/mã HS", "chặn học sinh bỏ thi đợt trước", "mở/đóng cổng
thi theo giờ server" đòi hỏi **dữ liệu dùng chung, xác thực thật và đồng bộ thời gian phía máy
chủ** — một trang tĩnh trên GitHub Pages/Vercel không tự làm được việc này. Supabase (Postgres +
Auth + RPC) là backend miễn phí, không cần tự vận hành server, ghép rất tự nhiên với Vercel.

## 1. Cài đặt Supabase (khoảng 5 phút)

1. Tạo project miễn phí tại https://supabase.com
2. Vào **SQL Editor**, dán toàn bộ nội dung file `supabase/schema.sql` và chạy (Run).
3. Vào **Project Settings > API**, copy `Project URL` và `anon public key`.
4. (Tuỳ chọn nhưng nên làm) Bật **pg_cron** (Database > Extensions) rồi bật đoạn lệnh
   `cron.schedule(...)` đang được comment sẵn ở cuối `schema.sql` — việc này tự động đánh dấu
   học sinh không nộp bài trước giờ đóng cổng là "missed", để hệ thống loại đúng học sinh khỏi
   đợt thi kế tiếp theo đúng yêu cầu quy trình.

## 2. Chạy local

```bash
npm install
cp .env.example .env
# Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env
npm run dev
```

## 3. Đưa lên GitHub

```bash
git init
git add .
git commit -m "Khởi tạo hệ thống thi thử"
git branch -M main
git remote add origin <URL repo GitHub của bạn>
git push -u origin main
```

## 4. Deploy lên Vercel

1. Vào https://vercel.com > New Project > chọn repo GitHub vừa tạo.
2. Framework tự nhận là **Vite**.
3. Vào **Environment Variables**, thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`
   (giá trị lấy ở bước 1.3).
4. Deploy. Xong — mỗi lần push code lên `main`, Vercel tự build lại.

## 5. Cách dùng

**Giáo viên**: `/teacher/login` → đăng ký tài khoản → tạo lớp (sinh ra mã lớp) → thêm học sinh
(hệ thống tự sinh mã HS + mật khẩu, hiển thị 1 lần để gửi cho học sinh) → "Tạo đề thi mới": đặt
tên, số đợt thi, thời lượng, giờ mở/đóng cổng, chọn cách chấm câu Đúng/Sai, bật/tắt yêu cầu hoàn
thành đợt trước → tải file Word (hệ thống tự tách câu theo "Câu 1:", "Câu 2:"...) hoặc bấm "Thêm
câu hỏi thủ công" → với mỗi câu, chọn dạng (trắc nghiệm / đúng-sai 4 ý / trả lời ngắn), nhập đáp
án đúng và lời giải chi tiết → Lưu đề thi.

**Học sinh**: `/student/login` → nhập mã lớp, mã HS, mật khẩu → vào `/student/dashboard` thấy
danh sách đợt thi cùng trạng thái (chưa mở / đang mở / đã đóng / bị loại vì bỏ đợt trước) → vào
thi, làm bài trong thời gian đếm ngược → nộp bài → xem điểm và lời giải chi tiết từng câu ngay.

## 6. Hai cách tính điểm câu Đúng/Sai (yêu cầu #2)

Cấu hình theo từng đề thi (`exams.scoring_method`), logic nằm ở `src/utils/scoring.ts`:

- **`ministry_partial`** — đúng theo quy chế thi tốt nghiệp THPT từ 2025: mỗi câu Đúng/Sai có
  4 ý nhỏ, đúng 1 ý = 0.1 điểm, 2 ý = 0.25 điểm, 3 ý = 0.5 điểm, 4 ý = trọn điểm câu.
- **`equal_split`** — chia đều: điểm câu × (số ý đúng / 4).

## 7. Quy trình "thi theo đợt, bỏ đợt trước thì bị loại" (yêu cầu #4)

- Mỗi đề thi có `wave_number` (đợt số mấy) và cờ `requires_previous_wave`.
- RPC `can_take_exam` (trong `schema.sql`) kiểm tra: nếu đề thi yêu cầu đợt trước, học sinh phải
  có `attempts.status = 'submitted'` ở đề cùng lớp với `wave_number - 1` thì mới được vào thi.
- Học sinh bỏ thi (không nộp trước `close_at`) sẽ bị đánh dấu `missed` bởi job `pg_cron` (xem mục
  1.4) → tự động bị chặn ở đợt kế tiếp cho tới khi **quay lại hoàn thành đúng đợt đã bỏ dở**
  (giáo viên có thể mở lại cổng thi của đợt cũ bằng cách sửa `close_at` nếu muốn cho thi bù).

## 8. Công thức MathType & hình ảnh (yêu cầu #6) — lưu ý quan trọng

MathType chèn công thức vào Word dưới dạng đối tượng OLE/OMML mà trình duyệt không thể tự vẽ lại
đẹp như Word. Có 2 cách để **hiển thị không lỗi 100%**:

1. **Khuyến nghị**: trong Word, chuyển công thức MathType sang ảnh (MathType > Convert Equations
   > Image, hoặc chụp ảnh công thức rồi chèn lại làm Picture). Khi tải file lên hệ thống, công cụ
   `mammoth.js` (đã tích hợp ở `src/utils/docxParser.ts`) sẽ trích xuất mọi ảnh (bao gồm ảnh công
   thức, hình vẽ hình học, biểu đồ...) và nhúng thẳng vào câu hỏi dạng base64 — không bao giờ vỡ
   link ảnh.
2. **Nếu muốn công thức sắc nét, chọn được, không phải ảnh**: gõ trực tiếp bằng cú pháp LaTeX
   trong Word, đặt trong `$...$` (công thức trong dòng) hoặc `$$...$$` (công thức khối). App tự
   nhận diện và render bằng KaTeX (`src/components/MathRenderer.tsx`).

Ảnh/hình vẽ thông thường (không phải công thức) luôn được giữ nguyên nhờ cơ chế nhúng base64 nói
trên, không phụ thuộc đường link ngoài nên không bao giờ bị lỗi "ảnh vỡ".

## 9. Cấu trúc thư mục

```
src/
  components/     MathRenderer, ProtectedRoute, TopBar
  context/        AuthContext (session giáo viên + học sinh)
  pages/          Toàn bộ màn hình (giáo viên / học sinh)
  utils/          scoring.ts (chấm điểm), docxParser.ts (đọc Word)
  types/          Định nghĩa TypeScript dùng chung
supabase/
  schema.sql      Toàn bộ bảng, RLS, RPC — chạy 1 lần trong Supabase SQL Editor
```

## 10. Giới hạn hiện tại / gợi ý mở rộng

- Việc tách câu hỏi từ Word theo mốc "Câu N:" là tách thô; giáo viên nên rà lại từng câu trong
  bước "Biên soạn câu hỏi" trước khi lưu (đặc biệt là gán đúng đáp án/ý đúng-sai, vì Word không
  có cách nào để hệ thống tự biết đáp án nào đúng).
- Chưa có chức năng chống gian lận (khoá tab, giám sát camera...) — có thể bổ sung thêm nếu cần.
- Chưa có thanh soạn thảo WYSIWYG cho nội dung câu hỏi (đang dùng textarea chỉnh HTML thô) — có
  thể thay bằng TipTap/Quill nếu muốn giáo viên soạn trực tiếp không cần biết HTML.
