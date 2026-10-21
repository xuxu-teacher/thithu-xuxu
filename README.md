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

## 8. Đọc file Word & công thức MathType (yêu cầu #6) — đã nâng cấp

Bộ phân tích Word đã được thay bằng engine đọc trực tiếp XML bên trong file `.docx` (không qua
thư viện trung gian như trước), cho phép:

- **Tự tách 3 phần đề thi**: PHẦN 1 (trắc nghiệm), PHẦN 2 (đúng/sai 4 ý), PHẦN 3 (trả lời ngắn) —
  theo các tiêu đề thường dùng trong đề thi Việt Nam (không phân biệt hoa/thường, có/không dấu).
- **Tự nhận đáp án đúng** — đây là điểm khác biệt lớn nhất: bạn chỉ cần soạn đề trong Word như
  bình thường, sau đó **bôi đen và gạch chân (Ctrl+U)** đáp án đúng của câu trắc nghiệm, hoặc các
  ý đúng của câu Đúng/Sai. Hệ thống tự đọc định dạng gạch chân này khi tải file lên — không cần
  thao tác lại trên web. Câu trả lời ngắn tự nhận qua dòng `Đáp án: ...` trong file.
- **Giữ nguyên hình ảnh** — nhúng thẳng base64 vào câu hỏi, không bao giờ vỡ link.
- Sau khi tải lên, các câu **chưa xác định chắc chắn đáp án** (ví dụ quên gạch chân) sẽ được đánh
  dấu **"⚠ Cần rà lại đáp án"** ngay trong màn hình soạn đề để giáo viên kiểm tra lại trước khi
  lưu — tránh sai sót âm thầm.

### Công thức toán (MathJax thay cho KaTeX)

Toàn bộ hiển thị công thức đã chuyển sang **MathJax 3** (cấu hình sẵn trong `index.html`) — xử lý
tốt hơn các cấu trúc phức tạp (hệ phương trình, ma trận, phân số lồng nhau) so với KaTeX trước
đây, và là chuẩn được nhiều hệ thống thi thử tại Việt Nam dùng.

- **Công thức gõ bằng LaTeX** trực tiếp trong Word, đặt trong `$...$` (trong dòng) hoặc `$$...$$`
  (dạng khối) → hiển thị chính xác 100%, không cần công cụ gì thêm.
- **Công thức chèn bằng công cụ MathType** (đối tượng OLE nhúng trong Word): trình duyệt không
  tự đọc được cấu trúc này. Có 2 cách xử lý:
  1. Nếu bạn đã có sẵn **máy chủ chuyển đổi MathType → LaTeX** riêng (ví dụ từ dự án cũ), điền
     địa chỉ máy chủ đó vào biến môi trường `VITE_MATHTYPE_SERVER_URL` (thêm cả trong `.env` khi
     chạy local và trong Environment Variables của Vercel) — hệ thống sẽ tự gửi công thức tới máy
     chủ này để chuyển đổi khi tải file Word lên.
  2. Nếu **không có** máy chủ này, hệ thống sẽ cảnh báo ngay khi tải file lên rằng công thức
     MathType không hiển thị được. Cách khắc phục chắc chắn 100% dù không cần máy chủ: trong
     Word, chọn công thức → **MathType > Convert Equations > Image** (hoặc chụp ảnh công thức)
     rồi chèn lại làm ảnh — hệ thống sẽ giữ nguyên ảnh này không lỗi.



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

## 11. Gán ID6 cho đề thi (trang `/teacher/gan-id`, menu **Gán ID**)

Tải PDF đề có lời giải (hoặc 2 file: đề trước, lời giải sau) → AI (Gemini) đọc từng câu và chọn
dạng theo bảng chia dạng ID6 → giáo viên rà, sửa trong bảng → **Tải file Word** (trùng tên file PDF,
định dạng như mẫu: `Câu n.  [2D1H2-2]` theo 3 phần).

- Bảng dạng: `src/data/id6Taxonomy.ts` (532 dạng, sinh từ file `GV-bang-chia-dang-toan-TEX-ID6`).
- Mẫu Word (header/footer, lề): `public/templates/mau-gan-id6.docx`.
- Mức độ: câu có nhãn `[MĐ1]…[MĐ4]` quy đổi theo bảng trên trang (mặc định N/H/V/C); câu không
  có nhãn do AI đánh giá.
- PDF scan (không có lớp chữ, ≤ 3,2 MB) được gửi nguyên file cho AI đọc.

**Cài đặt (1 lần):**
1. `npm install` (thêm thư viện `pdfjs-dist`).
2. Lấy API key tại https://aistudio.google.com/apikey.
3. Vercel → Project thithu-xuxu → Settings → Environment Variables: thêm `GEMINI_API_KEY`
   (không có tiền tố `VITE_`). Tuỳ chọn `GEMINI_MODEL`. Redeploy.
4. Hàm máy chủ nằm ở `api/gemini.ts` — chỉ chạy trên Vercel (`vercel dev` khi thử ở máy;
   `npm run dev` thường không có `/api`).
