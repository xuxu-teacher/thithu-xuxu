-- ============================================================
-- KHO LƯU FILE BÀI GIẢNG (Supabase Storage)
-- ============================================================
-- Trước đây mục "Bài giảng" chỉ nhận LINK (giáo viên phải tự tải file lên
-- Google Drive/nơi khác rồi dán link vào) — giờ thêm khả năng TẢI FILE
-- TRỰC TIẾP (PDF, Word, ảnh...) ngay trên web, không cần dịch vụ ngoài.
-- Bucket đặt "public" để việc phát link cho học sinh xem đơn giản (không
-- cần xử lý signed URL) — phù hợp vì đây là tài liệu học tập công khai
-- cho học sinh, không phải dữ liệu riêng tư.
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('lesson-files', 'lesson-files', true)
on conflict (id) do nothing;

drop policy if exists "lesson_files_public_read" on storage.objects;
create policy "lesson_files_public_read" on storage.objects
  for select using (bucket_id = 'lesson-files');

drop policy if exists "lesson_files_teacher_upload" on storage.objects;
create policy "lesson_files_teacher_upload" on storage.objects
  for insert with check (bucket_id = 'lesson-files' and auth.role() = 'authenticated');

drop policy if exists "lesson_files_teacher_delete" on storage.objects;
create policy "lesson_files_teacher_delete" on storage.objects
  for delete using (bucket_id = 'lesson-files' and auth.role() = 'authenticated');
