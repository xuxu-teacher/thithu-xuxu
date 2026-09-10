# Cập nhật: Tải ma trận bằng Word + Xuất đề ra Word (công thức thật)

## 1. Tải ma trận đề bằng file Word

Ở trang "Sinh đề từ ma trận", khung tải ma trận giờ có thêm nút **"📤 Tải file ma trận Word (.docx)"** bên
cạnh nút Excel cũ. Yêu cầu: ma trận phải được trình bày dưới dạng BẢNG trong Word (Insert > Table), đúng 4
cột theo thứ tự Chủ đề — Mức độ — Dạng câu — Số câu, dòng đầu mỗi bảng là tiêu đề (sẽ tự bỏ qua). Nếu file có
nhiều bảng (ví dụ mỗi bảng 1 khối), hệ thống đọc hết tất cả các bảng.

## 2. Xuất đề thi ra Word — công thức là phương trình Word thật, không phải ảnh

Ở màn hình **sửa đề** (`/teacher/exams/:id/edit`), nút mới **"⬇ Xuất file Word (công thức thật)"** — tải về
1 file `.docx` gồm: đề thi đầy đủ (chia PHẦN I/II/III, có ảnh minh họa nếu câu hỏi có), và 1 trang đáp án
riêng ở cuối. Công thức toán được chuyển thành **phương trình Word thật** (mở ra bấm sửa được bình thường
như tự gõ bằng Insert > Equation), không phải ảnh chụp — cách làm: MathJax (đã có sẵn trong app) chuyển LaTeX
sang MathML ngay trên trình duyệt, rồi một thư viện chuyển tiếp sang định dạng phương trình gốc của Word
(OMML).

⚠️ **Đây là tính năng mới, phức tạp hơn các phần trước, cần bạn thử nghiệm kỹ:**
- Nếu file Word tải về công thức hiển thị sai/lỗi, hoặc file không mở được, chụp ảnh gửi tôi kèm mô tả câu
  hỏi có công thức đó (đặc biệt công thức có ma trận, hệ phương trình, hoặc ký hiệu đặc biệt) để tôi sửa.
- Với câu có ảnh minh họa, ảnh cũng được nhúng vào file Word, tự co giãn cho vừa khổ giấy A4.

## Cần cài thêm 1 thư viện (KHÔNG cần bạn tự chạy lệnh gì)

Đã thêm `mathml2omml` vào `package.json` — chỉ cần merge đúng file `package.json` này lên GitHub, Vercel sẽ
**tự động cài** thư viện này khi build lại (không cần bạn chạy `npm install` trên máy).

## Các bước merge

1. Giải nén `kho-cau-hoi-full-v6.zip`.
2. Vào GitHub web → Add file → Upload files → kéo-thả:
   - Cả 2 thư mục `src` và `supabase` (như mọi lần)
   - **Thêm file `package.json` ở gốc thư mục giải nén** (kéo thả riêng file này vào, không nằm trong `src`
     hay `supabase`) — bước này KHÔNG được bỏ qua, thiếu file này Vercel sẽ không biết cài thư viện mới.
3. Commit, chờ Vercel build xong.
4. Không cần deploy Edge Function nào (tính năng này chạy hoàn toàn phía trình duyệt, không gọi AI).
5. Vào 1 đề thi bất kỳ → Sửa đề → thử bấm "⬇ Xuất file Word" → mở file tải về bằng Word, kiểm tra công thức.
