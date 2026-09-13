-- ============================================================
-- HỌC PHÍ — đánh dấu học sinh đã nộp hay chưa
-- ============================================================
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

alter table students add column if not exists tuition_paid boolean not null default false;

-- Học sinh không dùng Supabase Auth nên bị RLS của bảng `students` chặn đọc
-- trực tiếp (giống lý do exams/attempts phải qua RPC) — thêm RPC riêng để
-- học sinh tự xem đúng trạng thái học phí của mình.
create or replace function get_my_tuition_status(p_student_id uuid)
returns boolean
language sql security definer as $$
  select tuition_paid from students where id = p_student_id;
$$;
