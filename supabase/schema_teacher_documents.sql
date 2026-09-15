-- ============================================================
-- QUẢN LÝ GIẤY TỜ SỔ SÁCH DẠY THÊM (theo Thông tư 29/2024/TT-BGDĐT,
-- sửa đổi bởi Thông tư 19/2026/TT-BGDĐT, hiệu lực từ 15/5/2026)
-- ============================================================
-- Khác với "Bài giảng" (file công khai cho học sinh xem), giấy tờ ở đây
-- là hồ sơ quản lý nội bộ của giáo viên (đăng ký kinh doanh, hợp đồng,
-- sổ sách thu-chi...) — bucket để PRIVATE, chỉ đúng giáo viên sở hữu mới
-- đọc/tải được (dùng signed URL, không có link công khai).
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('teacher-docs', 'teacher-docs', false)
on conflict (id) do nothing;

drop policy if exists "teacher_docs_own_read" on storage.objects;
create policy "teacher_docs_own_read" on storage.objects
  for select using (bucket_id = 'teacher-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "teacher_docs_own_upload" on storage.objects;
create policy "teacher_docs_own_upload" on storage.objects
  for insert with check (bucket_id = 'teacher-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "teacher_docs_own_delete" on storage.objects;
create policy "teacher_docs_own_delete" on storage.objects
  for delete using (bucket_id = 'teacher-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists teacher_documents (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  category text not null,      -- 1 trong các thư mục cố định, hoặc tên thư mục tự đặt
  file_name text not null,
  storage_path text not null,  -- đường dẫn trong bucket teacher-docs (private, không phải URL công khai)
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_teacher_documents_teacher on teacher_documents(teacher_id, category);

alter table teacher_documents enable row level security;
drop policy if exists teacher_own_documents on teacher_documents;
create policy teacher_own_documents on teacher_documents for all using (auth.uid() = teacher_id);
