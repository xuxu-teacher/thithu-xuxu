-- ============================================================
-- CÔNG KHAI THÔNG TIN DẠY THÊM + ĐƠN XIN HỌC THÊM
-- ============================================================
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- Thông tin công khai gắn với từng lớp (mức thu, lịch học, thời gian học)
-- — hiển thị trực tiếp cho học sinh của lớp, không chỉ là file đính kèm.
alter table classes add column if not exists tuition_fee text;
alter table classes add column if not exists schedule_info text;
alter table classes add column if not exists study_duration text;

-- RPC cho học sinh xem thông tin công khai lớp mình (bypass RLS giống các
-- RPC học sinh khác, vì học sinh không dùng Supabase Auth).
create or replace function get_class_public_info(p_class_id uuid)
returns table (tuition_fee text, schedule_info text, study_duration text)
language sql security definer as $$
  select tuition_fee, schedule_info, study_duration from classes where id = p_class_id;
$$;

-- Đơn xin học thêm — học sinh tự điền, giáo viên xem lại ở mục Quản lý.
create table if not exists tuition_applications (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  teacher_id uuid references teachers(id) on delete cascade,
  student_full_name text not null,
  parent_name text not null,
  parent_phone text not null,
  note text,
  reviewed boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_tuition_applications_teacher on tuition_applications(teacher_id);

alter table tuition_applications enable row level security;
drop policy if exists teacher_own_tuition_applications on tuition_applications;
create policy teacher_own_tuition_applications on tuition_applications for all using (auth.uid() = teacher_id);

-- Học sinh nộp đơn qua RPC (bypass RLS) — teacher_id được suy ra từ lớp học
-- sinh đang thuộc về, không cho học sinh tự chọn tùy ý.
create or replace function submit_tuition_application(
  p_student_id uuid,
  p_class_id uuid,
  p_student_full_name text,
  p_parent_name text,
  p_parent_phone text,
  p_note text
)
returns uuid
language plpgsql security definer as $$
declare
  v_teacher_id uuid;
  v_id uuid;
begin
  select teacher_id into v_teacher_id from classes where id = p_class_id;
  insert into tuition_applications (student_id, class_id, teacher_id, student_full_name, parent_name, parent_phone, note)
  values (p_student_id, p_class_id, v_teacher_id, p_student_full_name, p_parent_name, p_parent_phone, p_note)
  returning id into v_id;
  return v_id;
end;
$$;
