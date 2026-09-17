-- ============================================================
-- KÊ KHAI THÔNG TIN DẠY THÊM (theo mẫu KÊ_KHAI_THÔNG_TIN_DẠY.docx)
-- + MỞ RỘNG ĐƠN ĐĂNG KÍ HỌC THÊM (theo mẫu ĐƠN_ĐĂNG_KÍ_HỌC_THÊM.docx)
-- ============================================================
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- Thông tin kê khai chung của giáo viên/cơ sở dạy thêm — 1 dòng/giáo viên.
create table if not exists teacher_disclosure (
  teacher_id uuid primary key references teachers(id) on delete cascade,
  business_name text,          -- "HỘ KINH DOANH UYÊN THƠ"
  address text,
  phone text,
  school_year text,            -- "2024-2025"
  subjects_info text,          -- các môn/khối tổ chức dạy thêm (nhiều dòng)
  teaching_form text,          -- hình thức tổ chức dạy thêm, học thêm
  tuition_rates text,          -- mức thu tiền học thêm (nhiều dòng)
  teacher_honorific text,      -- "Thầy" hoặc "Cô" — dùng để ghép câu trong đơn đăng ký
  teacher_display_name text,   -- tên hiển thị trong đơn/kê khai, VD "Trương Thị Uyên Thơ"
  teacher_degree text,         -- "Thạc sỹ"
  teacher_major text,          -- "Toán"
  teacher_workplace text,      -- "THPT số 1 Tư Nghĩa"
  principal_school_name text,  -- "Trường THPT số 1 Tư Nghĩa" (nơi báo cáo Hiệu trưởng)
  report_teaching_time text,   -- thời gian dạy thêm (báo cáo Hiệu trưởng)
  updated_at timestamptz default now()
);

alter table teacher_disclosure enable row level security;
drop policy if exists teacher_own_disclosure on teacher_disclosure;
create policy teacher_own_disclosure on teacher_disclosure for all using (auth.uid() = teacher_id);

-- Thời khóa biểu linh hoạt — giáo viên tự thêm/xóa dòng, mỗi dòng 1 lớp,
-- 7 ô giờ học theo từng thứ (để trống nếu lớp không học ngày đó).
create table if not exists teacher_schedule_rows (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  class_label text not null,
  mon text, tue text, wed text, thu text, fri text, sat text, sun text,
  order_index int not null default 0
);

create index if not exists idx_teacher_schedule_rows on teacher_schedule_rows(teacher_id, order_index);

alter table teacher_schedule_rows enable row level security;
drop policy if exists teacher_own_schedule on teacher_schedule_rows;
create policy teacher_own_schedule on teacher_schedule_rows for all using (auth.uid() = teacher_id);

-- Học sinh xem thông tin kê khai của giáo viên lớp mình (bypass RLS).
create or replace function get_teacher_disclosure_for_class(p_class_id uuid)
returns teacher_disclosure
language sql security definer as $$
  select td.* from teacher_disclosure td
  join classes c on c.teacher_id = td.teacher_id
  where c.id = p_class_id;
$$;

create or replace function get_teacher_schedule_for_class(p_class_id uuid)
returns setof teacher_schedule_rows
language sql security definer as $$
  select tsr.* from teacher_schedule_rows tsr
  join classes c on c.teacher_id = tsr.teacher_id
  where c.id = p_class_id
  order by tsr.order_index;
$$;

-- Mở rộng đơn đăng ký học thêm cho đúng các trường trong mẫu thật.
alter table tuition_applications add column if not exists student_school_name text;
alter table tuition_applications add column if not exists student_school_class text; -- lớp đang học ở trường (VD "11A3"), khác class_id trong hệ thống
alter table tuition_applications add column if not exists subject_registered text;   -- môn đăng ký học thêm
alter table tuition_applications add column if not exists grade_registered text;     -- khối đăng ký (10/11/12)
alter table tuition_applications add column if not exists not_direct_student boolean default true; -- xác nhận KHÔNG phải học sinh trực tiếp giảng dạy của giáo viên tại trường
alter table tuition_applications add column if not exists parent_consent_text text;  -- ý kiến + chữ ký (gõ tên) của cha mẹ học sinh

-- submit_tuition_application bản mở rộng — đủ tham số theo mẫu đơn thật.
create or replace function submit_tuition_application(
  p_student_id uuid,
  p_class_id uuid,
  p_student_full_name text,
  p_parent_name text,
  p_parent_phone text,
  p_note text,
  p_student_school_name text default null,
  p_student_school_class text default null,
  p_subject_registered text default null,
  p_grade_registered text default null,
  p_not_direct_student boolean default true,
  p_parent_consent_text text default null
)
returns uuid
language plpgsql security definer as $$
declare
  v_teacher_id uuid;
  v_id uuid;
begin
  select teacher_id into v_teacher_id from classes where id = p_class_id;
  insert into tuition_applications (
    student_id, class_id, teacher_id, student_full_name, parent_name, parent_phone, note,
    student_school_name, student_school_class, subject_registered, grade_registered,
    not_direct_student, parent_consent_text
  )
  values (
    p_student_id, p_class_id, v_teacher_id, p_student_full_name, p_parent_name, p_parent_phone, p_note,
    p_student_school_name, p_student_school_class, p_subject_registered, p_grade_registered,
    p_not_direct_student, p_parent_consent_text
  )
  returning id into v_id;
  return v_id;
end;
$$;
