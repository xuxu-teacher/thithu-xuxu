# Cập nhật: Tải file trực tiếp trong mục Bài giảng

## Vấn đề cũ

Trước đây 3 ô "Link bài giảng", "Link file đề", "Link file lời giải" chỉ nhận DÁN LINK có sẵn — giáo viên
phải tự tải file lên Google Drive hay nơi khác trước, không upload trực tiếp được từ máy.

## Đã sửa

Mỗi ô giờ có thêm nút **"📤 Tải file"** ngay cạnh — bấm vào, chọn file trên máy (PDF, Word, ảnh...), hệ
thống tự tải lên và điền sẵn link vào ô đó (link vẫn có thể sửa tay nếu muốn dùng link ngoài như cũ).

## Cần chạy SQL để tạo kho lưu file trước

Vào Supabase Dashboard → SQL Editor → dán toàn bộ nội dung `supabase/schema_lesson_files.sql` → Run. File
này tạo 1 "bucket" (kho lưu file) tên `lesson-files`, để công khai (học sinh xem được link mà không cần
đăng nhập gì thêm) — chỉ giáo viên đã đăng nhập mới tải/xóa file được.

Nếu chạy SQL báo lỗi không đủ quyền (hiếm khi xảy ra), làm cách thay thế: vào Supabase Dashboard → menu trái
→ **Storage** → **New bucket** → đặt tên đúng `lesson-files` → bật **Public bucket** → Save, rồi báo tôi để
tôi hướng dẫn tạo policy qua giao diện thay vì SQL.

## Merge code

Giải nén, kéo-thả 2 thư mục `src` và `supabase` lên GitHub như mọi lần. Không cần deploy Edge Function nào,
không cần sửa `package.json` lần này.
