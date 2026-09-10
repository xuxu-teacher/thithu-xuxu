# Cập nhật: Kho câu hỏi tự nhận khối lớp + Hub "Tạo đề thi"

## 1. Kho câu hỏi — bỏ chọn khối thủ công

Trang "Kho câu hỏi" không còn ô chọn Khối 10/11/12 trước khi tải file nữa. AI giờ tự đọc nội dung từng câu
và tự xác định luôn khối lớp (dựa theo đúng chương trình SGK Kết nối tri thức của cả 3 khối), cùng lúc với
việc gán chủ đề và mức độ như trước — 1 file Word có thể chứa lẫn câu của nhiều khối khác nhau, hệ thống vẫn
phân loại đúng từng câu.

Ở màn hình duyệt trước khi lưu, mỗi câu giờ có thêm cột **"Khối"** (dropdown 10/11/12) bên cạnh chủ đề/mức
độ — sửa lại nếu AI đoán sai. Đổi khối sẽ tự cập nhật lại danh sách chủ đề tương ứng.

**Cần deploy lại Edge Function** (đã đổi cách gọi AI):
```bash
supabase functions deploy classify-questions
```

## 2. Trang "Tạo đề thi" — gộp 2 cách tạo đề chính thức

Trong trang lớp học, nút "+ Tạo đề thi mới" và "🧩 Sinh đề từ ma trận" trước đây gộp lại thành 1 nút
**"+ Tạo đề thi"** duy nhất → mở trang trung gian trình bày rõ 2 lựa chọn:

- **Phần 1 — Tải 1 đề Word có sẵn**: đúng luồng cũ (tạo đợt thi, cấu hình giờ mở/đóng cổng, chấm điểm,
  giám sát rời tab lúc thi, thống kê điểm sau khi đóng cổng — các tính năng này đã có sẵn từ trước, không
  phải xây mới).
- **Phần 2 — Sinh đề từ Kho câu hỏi (ma trận đề)**: đúng luồng "Sinh đề từ ma trận" đã có, chỉ đổi chỗ
  truy cập cho rõ ràng hơn.

Nút "📝 Tạo đề thi thử" (luyện tự do, không giới hạn số lần) vẫn tách riêng như cũ, không nằm trong hub
này vì bản chất khác hẳn (không chấm điểm chính thức).

## Merge code

Giải nén đè cả 2 thư mục `src` và `supabase` từ gói `kho-cau-hoi-full-v4.zip` lên GitHub (Add file → Upload
files → kéo-thả), commit, rồi deploy lại Edge Function `classify-questions` như trên.
