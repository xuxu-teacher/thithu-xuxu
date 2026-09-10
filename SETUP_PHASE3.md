# Sửa lỗi build + Đề thi thử

## Lỗi build vừa gặp — nguyên nhân

`Cannot find module '../data/curriculumTopics'` — do lần cập nhật trước bạn chỉ merge đúng 1 file
`TeacherQuestionBankUpload.tsx` (theo hướng dẫn "sửa nhanh"), nhưng file đó có `import` tới
`src/data/curriculumTopics.ts` — một file MỚI từ bản cập nhật trước đó nữa mà chưa được merge lên GitHub.
Thiếu file này khiến cả 2 lỗi hiện ra (lỗi thứ 2 chỉ là hệ quả của lỗi thứ 1).

**Cách sửa chắc chắn nhất — không sót file nào nữa:** gói `kho-cau-hoi-full-v3.zip` lần này chứa
TOÀN BỘ thư mục `src` và `supabase` ở trạng thái mới nhất, đầy đủ mọi thứ từ trước đến giờ. Kéo-thả đè cả
2 thư mục này lên GitHub (không cần merge từng file lẻ nữa) là chắc chắn hết lỗi thiếu file.

## Tính năng mới: Đề thi thử

Khác với đề thi chính thức (có đợt thi, giờ mở/đóng cổng, chỉ làm 1 lần):

- Giáo viên: trong trang lớp học, nút **"📝 Tạo đề thi thử"** → tải lên 1 file Word có sẵn (y hệt cách
  tạo đề thi thường) → xuất bản.
- Học sinh: trang chủ có nút **"📝 Đề thi thử"** → chọn đề → làm bài → nộp là thấy điểm ngay (tự chấm tại
  trình duyệt) → bấm **"🔁 Làm lại từ đầu"** để làm lại bao nhiêu lần tùy thích.
- Không tính vào điểm chính thức, không ảnh hưởng gì đến các đợt kiểm tra thật, không cần đặt giờ mở/đóng.

⚠️ Vì đây là bài tự luyện, đáp án đúng được gửi thẳng cho trình duyệt học sinh ngay khi mở đề (để chấm tại
chỗ) — khác với đề thi thật (đáp án luôn giữ ở server, chỉ trả về sau khi nộp bài). Học sinh có thể xem được
đáp án qua công cụ dành cho lập trình viên nếu cố tình tìm — chấp nhận được vì đây chỉ là luyện tập, không
lấy điểm.

## Cần chạy thêm 1 file SQL

Vào Supabase Dashboard → SQL Editor → dán toàn bộ nội dung `supabase/schema_practice_exams.sql` → Run.
(Chỉ thêm bảng/hàm mới, không đụng dữ liệu cũ — an toàn chạy lại nhiều lần.)

## Các bước làm (đúng thứ tự)

1. Chạy file SQL `supabase/schema_practice_exams.sql` trên Supabase Dashboard (như mô tả trên).
2. Giải nén `kho-cau-hoi-full-v3.zip`.
3. Vào GitHub web → repo → **Add file → Upload files** → kéo-thả 2 thư mục `src` và `supabase` từ file vừa
   giải nén vào → cuộn xuống, gõ commit message → **Commit directly to the main branch** → **Commit
   changes**.
4. Chờ Vercel build lại (vào tab Deployments xem trạng thái "Ready").
5. Vào web thử: giáo viên tạo 1 đề thi thử, học sinh vào làm thử.

Không cần deploy thêm Edge Function nào mới ở bước này (đề thi thử không dùng AI).
