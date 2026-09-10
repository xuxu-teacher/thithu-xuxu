-- ============================================================
-- ĐỀ THI THỬ (practice_exams) — tải 1 file Word, học sinh làm KHÔNG GIỚI HẠN
-- SỐ LẦN, tự chấm ngay, KHÔNG liên quan gì đến đợt thi chính thức
-- (exams/questions/attempts) — tách bảng riêng để không đụng tới luồng thi
-- có tính điểm/chống gian lận đang chạy cho học sinh thật.
-- ============================================================
-- Chạy SAU schema.sql gốc và schema_question_bank.sql. An toàn chạy lại.
-- ============================================================

create table if not exists practice_exams (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  title text not null,
  duration_minutes int not null default 45,
  created_at timestamptz default now()
);

create table if not exists practice_questions (
  id uuid primary key default uuid_generate_v4(),
  practice_exam_id uuid references practice_exams(id) on delete cascade,
  order_index int not null,
  part text not null check (part in ('mcq','true_false','short_answer')),
  content_html text not null,
  image_url text,
  options jsonb,
  correct_answer text,
  explanation_html text,
  points numeric not null default 1
);

create index if not exists idx_practice_exams_class on practice_exams(class_id);
create index if not exists idx_practice_questions_exam on practice_questions(practice_exam_id);

alter table practice_exams enable row level security;
alter table practice_questions enable row level security;

drop policy if exists teacher_own_practice_exams on practice_exams;
create policy teacher_own_practice_exams on practice_exams for all using (auth.uid() = teacher_id);
drop policy if exists teacher_own_practice_questions on practice_questions;
create policy teacher_own_practice_questions on practice_questions for all using (
  practice_exam_id in (select id from practice_exams where teacher_id = auth.uid())
);

-- Học sinh không dùng Supabase Auth (giống lý do đã ghi trong schema.sql cho
-- exams/attempts) nên truy cập qua RPC security definer, bỏ qua RLS, tự lọc
-- theo p_class_id nhận từ phiên đăng nhập học sinh đã xác thực ở client.
-- Đề thi thử trả nguyên đáp án đúng cho client vì đây là bài tự luyện, tự
-- chấm ngay tại trình duyệt — KHÔNG dùng để lấy điểm chính thức, nên không
-- cần chấm phía server như submit_attempt của đề thi thật.
create or replace function list_practice_exams(p_class_id uuid)
returns table (id uuid, title text, duration_minutes int, question_count bigint, created_at timestamptz)
language sql security definer as $$
  select pe.id, pe.title, pe.duration_minutes, count(pq.id), pe.created_at
  from practice_exams pe
  left join practice_questions pq on pq.practice_exam_id = pe.id
  where pe.class_id = p_class_id
  group by pe.id
  order by pe.created_at desc;
$$;

create or replace function get_practice_exam_questions(p_practice_exam_id uuid)
returns setof practice_questions
language sql security definer as $$
  select * from practice_questions where practice_exam_id = p_practice_exam_id order by order_index;
$$;
