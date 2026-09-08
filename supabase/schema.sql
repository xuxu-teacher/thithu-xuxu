-- ============================================================
-- SCHEMA CHO HỆ THỐNG THI THỬ TRỰC TUYẾN
-- Chạy toàn bộ file này trong Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- GIÁO VIÊN ----------
-- Giáo viên dùng Supabase Auth (email/password) bình thường.
create table if not exists teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- ---------- LỚP HỌC (mỗi lớp có 1 mã lớp duy nhất) ----------
create table if not exists classes (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  class_code text unique not null,        -- VD: 12A1-2026
  class_name text not null,
  created_at timestamptz default now()
);

-- ---------- HỌC SINH ----------
-- Học sinh KHÔNG dùng Supabase Auth (không cần email) -> tự quản lý bằng mã HS + mật khẩu (hash).
create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references classes(id) on delete cascade,
  student_code text unique not null,      -- mã đăng nhập, VD: HS0001
  full_name text not null,
  password_hash text not null,            -- bcrypt hash, tạo qua RPC hash_password
  created_at timestamptz default now()
);

-- ---------- ĐỀ THI ----------
create table if not exists exams (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  title text not null,
  wave_number int not null default 1,        -- Đợt thi số mấy (1,2,3...)
  duration_minutes int not null default 90,
  open_at timestamptz not null,              -- giờ mở cổng thi
  close_at timestamptz not null,             -- giờ đóng cổng thi
  scoring_method text not null default 'partial'
      check (scoring_method in ('equal_split','ministry_partial')),
  -- equal_split: câu đúng-sai chia đều điểm theo số ý đúng
  -- ministry_partial: đúng 1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1đ (Bộ GDĐT 2025)
  requires_previous_wave boolean not null default true,
  -- true: học sinh phải hoàn thành đợt (wave_number-1) mới được thi đợt này
  created_at timestamptz default now()
);

-- ---------- CÂU HỎI ----------
-- part: 'mcq' (trắc nghiệm 4 đáp án - 1 đáp án đúng)
--       'true_false' (đúng/sai 4 ý nhỏ a,b,c,d - chấm điểm từng phần)
--       'short_answer' (trả lời ngắn - tự luận số/chữ)
create table if not exists questions (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references exams(id) on delete cascade,
  order_index int not null,
  part text not null check (part in ('mcq','true_false','short_answer')),
  content_html text not null,             -- HTML câu hỏi (đã convert từ Word, có thể chứa <img> và công thức KaTeX dạng $$..$$)
  image_url text,                         -- ảnh minh họa (nếu tách riêng)
  options jsonb,                          -- mcq: [{key:'A',html:'...'}], true_false: [{key:'a',html:'...',correct:true}]
  correct_answer text,                    -- mcq: 'A' | short_answer: đáp án text
  explanation_html text,                  -- lời giải chi tiết hiển thị sau khi nộp bài
  points numeric not null default 1,
  created_at timestamptz default now()
);

-- ---------- LƯỢT LÀM BÀI ----------
create table if not exists attempts (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references exams(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  status text not null default 'in_progress'
      check (status in ('in_progress','submitted','missed','disqualified')),
  started_at timestamptz,
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,   -- { question_id: answer }
  score numeric,
  created_at timestamptz default now(),
  unique (exam_id, student_id)
);

-- ---------- INDEXES ----------
create index if not exists idx_students_class on students(class_id);
create index if not exists idx_exams_class on exams(class_id);
create index if not exists idx_questions_exam on questions(exam_id);
create index if not exists idx_attempts_exam on attempts(exam_id);
create index if not exists idx_attempts_student on attempts(student_id);

-- ---------- KHỐI LỚP (để phân loại bài giảng) ----------
alter table classes add column if not exists grade text; -- '10' | '11' | '12'

-- ---------- CHƯƠNG & BÀI GIẢNG ----------
create table if not exists chapters (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  grade text not null,           -- Khối: '10' | '11' | '12'
  title text not null,           -- Tên chương, VD: "Chương 1: Mệnh đề - Tập hợp"
  order_index int not null default 0,
  created_at timestamptz default now()
);

create table if not exists lessons (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid references chapters(id) on delete cascade,
  title text not null,           -- Tên bài, VD: "Bài 1: Mệnh đề"
  link text not null,            -- Link bài dạy (video, tài liệu, Google Drive...)
  order_index int not null default 0,
  created_at timestamptz default now()
);

alter table chapters enable row level security;
alter table lessons enable row level security;

drop policy if exists teacher_own_chapters on chapters;
create policy teacher_own_chapters on chapters for all using (auth.uid() = teacher_id);
drop policy if exists teacher_own_lessons on lessons;
create policy teacher_own_lessons on lessons for all using (
  chapter_id in (select id from chapters where teacher_id = auth.uid())
);

-- RPC: học sinh xem bài giảng theo đúng khối của lớp mình, do đúng giáo viên
-- của lớp mình biên soạn (không thấy bài giảng của giáo viên/lớp khác).
create or replace function get_student_lessons(p_student_id uuid)
returns table (
  chapter_id uuid, chapter_title text, chapter_order int,
  lesson_id uuid, lesson_title text, lesson_link text, lesson_order int
) language sql security definer as $$
  select c.id, c.title, c.order_index, l.id, l.title, l.link, l.order_index
  from students s
  join classes cl on cl.id = s.class_id
  join chapters c on c.teacher_id = cl.teacher_id and c.grade = cl.grade
  join lessons l on l.chapter_id = c.id
  where s.id = p_student_id
  order by c.order_index, l.order_index;
$$;



-- Hash mật khẩu học sinh (dùng pgcrypto)
create extension if not exists pgcrypto;

create or replace function hash_password(plain text)
returns text language sql as $$
  select crypt(plain, gen_salt('bf'));
$$;

create or replace function verify_password(plain text, hashed text)
returns boolean language sql as $$
  select hashed = crypt(plain, hashed);
$$;

-- RPC: học sinh đăng nhập bằng mã lớp + mã học sinh + mật khẩu
create or replace function student_login(p_class_code text, p_student_code text, p_password text)
returns table (student_id uuid, class_id uuid, full_name text) language plpgsql security definer as $$
begin
  return query
    select s.id, s.class_id, s.full_name
    from students s
    join classes c on c.id = s.class_id
    where c.class_code = p_class_code
      and s.student_code = p_student_code
      and verify_password(p_password, s.password_hash);
end;
$$;

-- RPC: kiểm tra học sinh có đủ điều kiện vào thi đợt này không
-- (đợt trước phải có attempt status = 'submitted', nếu exam yêu cầu requires_previous_wave)
create or replace function can_take_exam(p_exam_id uuid, p_student_id uuid)
returns boolean language plpgsql as $$
declare
  v_exam exams%rowtype;
  v_prev_exam_id uuid;
  v_prev_status text;
begin
  select * into v_exam from exams where id = p_exam_id;
  if v_exam.wave_number <= 1 or not v_exam.requires_previous_wave then
    return true;
  end if;

  select id into v_prev_exam_id from exams
    where class_id = v_exam.class_id and wave_number = v_exam.wave_number - 1
    limit 1;

  if v_prev_exam_id is null then
    return true; -- không có đợt trước để so sánh
  end if;

  select status into v_prev_status from attempts
    where exam_id = v_prev_exam_id and student_id = p_student_id;

  return v_prev_status = 'submitted';
end;
$$;

-- Job (chạy định kỳ qua Supabase Cron / pg_cron) đánh dấu 'missed' cho học sinh
-- không nộp bài trước close_at, để chặn các đợt thi sau.
-- Ví dụ lịch chạy mỗi 15 phút:
-- select cron.schedule('mark-missed-attempts', '*/15 * * * *', $$
--   update attempts a set status = 'missed'
--   from exams e
--   where a.exam_id = e.id and a.status = 'in_progress' and now() > e.close_at;
--
--   insert into attempts (exam_id, student_id, status)
--   select e.id, s.id, 'missed'
--   from exams e
--   join students s on s.class_id = e.class_id
--   where now() > e.close_at
--     and not exists (select 1 from attempts a where a.exam_id = e.id and a.student_id = s.id);
-- $$);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table teachers enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table exams enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;

-- Giáo viên chỉ thấy/sửa dữ liệu của chính mình
-- An toàn để chạy lại nhiều lần: xóa policy cũ (nếu có) trước khi tạo lại.
drop policy if exists teacher_self on teachers;
create policy teacher_self on teachers for select using (auth.uid() = id);
drop policy if exists teacher_self_insert on teachers;
create policy teacher_self_insert on teachers for insert with check (auth.uid() = id);
drop policy if exists teacher_own_classes on classes;
create policy teacher_own_classes on classes for all using (auth.uid() = teacher_id);
drop policy if exists teacher_own_students on students;
create policy teacher_own_students on students for all using (
  class_id in (select id from classes where teacher_id = auth.uid())
);
drop policy if exists teacher_own_exams on exams;
create policy teacher_own_exams on exams for all using (auth.uid() = teacher_id);
drop policy if exists teacher_own_questions on questions;
create policy teacher_own_questions on questions for all using (
  exam_id in (select id from exams where teacher_id = auth.uid())
);
drop policy if exists teacher_own_attempts on attempts;
create policy teacher_own_attempts on attempts for select using (
  exam_id in (select id from exams where teacher_id = auth.uid())
);

-- Học sinh: KHÔNG dùng Supabase Auth, nên toàn bộ truy cập dữ liệu học sinh
-- (đọc đề, nộp bài, xem điểm) đi qua các Supabase Edge Functions / RPC chạy
-- với service_role (bỏ qua RLS) và tự kiểm tra quyền theo student_id + password
-- đã xác thực ở bước login. Vì vậy KHÔNG tạo policy "anon" mở cho các bảng này,
-- tránh lộ dữ liệu. Xem thư mục supabase/functions/ (đề xuất) hoặc dùng RPC
-- security definer tương tự can_take_exam ở trên cho các thao tác của học sinh.

-- Cột đếm số lần học sinh rời khỏi tab/thu nhỏ cửa sổ trong lúc làm bài —
-- dùng để cảnh báo giáo viên về dấu hiệu gian lận (mở tài liệu/tra cứu ở tab khác).
alter table attempts add column if not exists tab_switch_count int not null default 0;

-- RPC: học sinh tự đổi mật khẩu (phải nhập đúng mật khẩu cũ)
create or replace function change_student_password(
  p_student_id uuid, p_old_password text, p_new_password text
) returns boolean language plpgsql security definer as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from students where id = p_student_id;
  if v_hash is null or not verify_password(p_old_password, v_hash) then
    return false;
  end if;
  update students set password_hash = hash_password(p_new_password) where id = p_student_id;
  return true;
end;
$$;

-- RPC: học sinh nộp bài — CHẤM ĐIỂM NGAY TẠI SERVER bằng đáp án thật trong
-- bảng questions (không dùng điểm tính sẵn từ client), vì trong lúc làm bài
-- client chỉ nhận được đề đã ẩn đáp án (xem get_exam_questions), nên client
-- không thể tự chấm chính xác — và cũng không nên tin điểm do client gửi lên
-- vì có thể bị sửa qua devtools. Hỗ trợ cả 2 cách tính điểm câu Đúng/Sai.
create or replace function submit_attempt(
  p_exam_id uuid, p_student_id uuid, p_answers jsonb, p_tab_switch_count int default 0
) returns numeric language plpgsql security definer as $$
declare
  v_scoring_method text;
  v_total numeric := 0;
  q record;
  v_ans jsonb;
  v_correct_count int;
  v_total_subs int;
  v_ratio numeric;
begin
  select scoring_method into v_scoring_method from exams where id = p_exam_id;

  for q in select * from questions where exam_id = p_exam_id loop
    v_ans := p_answers -> q.id::text;

    if q.part = 'mcq' then
      if v_ans is not null and (v_ans #>> '{}') = q.correct_answer then
        v_total := v_total + q.points;
      end if;

    elsif q.part = 'short_answer' then
      if v_ans is not null and lower(trim(both from (v_ans #>> '{}'))) = lower(trim(both from coalesce(q.correct_answer, ''))) then
        v_total := v_total + q.points;
      end if;

    elsif q.part = 'true_false' then
      select count(*) into v_total_subs from jsonb_array_elements(q.options);
      select count(*) into v_correct_count
        from jsonb_array_elements(q.options) opt
        where (v_ans ->> (opt->>'key'))::boolean is not distinct from (opt->>'correct')::boolean
          and (v_ans ->> (opt->>'key')) is not null;

      if v_scoring_method = 'equal_split' then
        v_ratio := v_correct_count::numeric / greatest(v_total_subs, 1);
      else
        v_ratio := case v_correct_count
          when 0 then 0 when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 else 1.0
        end;
      end if;
      v_total := v_total + q.points * v_ratio;
    end if;
  end loop;

  v_total := round(v_total, 2);

  update attempts
    set answers = p_answers, status = 'submitted', submitted_at = now(),
        score = v_total, tab_switch_count = greatest(tab_switch_count, p_tab_switch_count)
    where exam_id = p_exam_id and student_id = p_student_id;

  if not found then
    insert into attempts (exam_id, student_id, answers, status, started_at, submitted_at, score, tab_switch_count)
    values (p_exam_id, p_student_id, p_answers, 'submitted', now(), now(), v_total, p_tab_switch_count);
  end if;

  return v_total;
end;
$$;

-- RPC: ghi nhận số lần chuyển tab ngay trong lúc làm bài (gọi định kỳ từ
-- client), để dữ liệu không mất nếu học sinh đóng trình duyệt trước khi nộp.
create or replace function report_tab_switch(p_exam_id uuid, p_student_id uuid, p_count int)
returns void language sql security definer as $$
  update attempts set tab_switch_count = greatest(tab_switch_count, p_count)
  where exam_id = p_exam_id and student_id = p_student_id;
$$;

-- RPC: học sinh bắt đầu làm bài (tạo/khởi tạo attempt in_progress, kiểm tra
-- điều kiện đợt thi trước + cổng thi còn mở hay không)
-- Đánh dấu lượt thi "làm bù" (bắt đầu sau khi cổng thi đã đóng) — để giáo
-- viên phân biệt được trong bảng kết quả.
alter table attempts add column if not exists is_catchup boolean not null default false;

-- Lưu số điện thoại học sinh (nếu có) — dùng làm mật khẩu ban đầu khi import
-- từ Excel, và để giáo viên tiện tra cứu/liên hệ.
alter table students add column if not exists phone text;

-- RPC: học sinh bắt đầu làm bài. Nếu học sinh CHƯA nộp bài đợt này và cổng
-- thi đã đóng, vẫn cho phép "làm bù" (miễn là cổng đã từng mở và đủ điều
-- kiện về đợt trước) — để học sinh có cơ hội hoàn thành đợt bị bỏ lỡ và mở
-- khóa đợt thi tiếp theo, thay vì bị chặn vĩnh viễn. Lượt làm bù được đánh
-- dấu is_catchup = true để giáo viên biết đây không phải bài làm đúng giờ.
create or replace function start_attempt(p_exam_id uuid, p_student_id uuid)
returns text language plpgsql security definer as $$
declare
  v_exam exams%rowtype;
  v_is_catchup boolean;
begin
  select * into v_exam from exams where id = p_exam_id;
  if v_exam is null then return 'Không tìm thấy đề thi.'; end if;
  if now() < v_exam.open_at then return 'Cổng thi chưa mở.'; end if;
  if not can_take_exam(p_exam_id, p_student_id) then
    return 'Bạn chưa hoàn thành đợt thi trước nên chưa đủ điều kiện thi đợt này.';
  end if;
  if exists (
    select 1 from attempts where exam_id = p_exam_id and student_id = p_student_id and status = 'submitted'
  ) then
    return 'Bạn đã nộp bài đợt thi này rồi.';
  end if;

  v_is_catchup := now() > v_exam.close_at;

  insert into attempts (exam_id, student_id, status, started_at, is_catchup)
  values (p_exam_id, p_student_id, 'in_progress', now(), v_is_catchup)
  on conflict (exam_id, student_id) do update
    set status = 'in_progress', started_at = now(), is_catchup = v_is_catchup;

  return null;
end;
$$;

-- RPC: danh sách đề thi của lớp học sinh kèm trạng thái attempt + có được thi hay không
create or replace function list_exams_for_student(p_class_id uuid, p_student_id uuid)
returns table (
  exam_id uuid, title text, wave_number int, duration_minutes int,
  open_at timestamptz, close_at timestamptz, scoring_method text,
  attempt_status text, eligible boolean
) language plpgsql security definer as $$
begin
  return query
    select e.id, e.title, e.wave_number, e.duration_minutes, e.open_at, e.close_at,
           e.scoring_method,
           coalesce(a.status, 'not_started'),
           can_take_exam(e.id, p_student_id)
    from exams e
    left join attempts a on a.exam_id = e.id and a.student_id = p_student_id
    where e.class_id = p_class_id
    order by e.wave_number asc;
end;
$$;

-- RPC: lấy câu hỏi cho học sinh làm bài. Khi bài chưa nộp -> KHÔNG trả đáp án
-- đúng/lời giải để tránh lộ đề qua tab Network. Khi đã nộp -> trả đầy đủ để
-- xem lại lời giải chi tiết.
create or replace function get_exam_questions(p_exam_id uuid, p_student_id uuid)
returns table (
  id uuid, order_index int, part text, content_html text, image_url text,
  options jsonb, correct_answer text, explanation_html text, points numeric
) language plpgsql security definer as $$
declare
  v_submitted boolean;
begin
  select exists(
    select 1 from attempts
    where exam_id = p_exam_id and student_id = p_student_id and status = 'submitted'
  ) into v_submitted;

  if v_submitted then
    return query
      select q.id, q.order_index, q.part, q.content_html, q.image_url,
             q.options, q.correct_answer, q.explanation_html, q.points
      from questions q where q.exam_id = p_exam_id order by q.order_index;
  else
    return query
      select q.id, q.order_index, q.part, q.content_html, q.image_url,
             case when q.part = 'true_false' then (
               select jsonb_agg(jsonb_build_object('key', o->>'key', 'html', o->>'html'))
               from jsonb_array_elements(q.options) o
             ) else q.options end,
             null::text, null::text, q.points
      from questions q where q.exam_id = p_exam_id order by q.order_index;
  end if;
end;
$$;

-- RPC: lấy thông tin cơ bản 1 đề thi (dùng cho trang làm bài của học sinh)
create or replace function get_exam_info(p_exam_id uuid)
returns table (
  id uuid, title text, wave_number int, duration_minutes int,
  open_at timestamptz, close_at timestamptz, scoring_method text
) language sql security definer as $$
  select id, title, wave_number, duration_minutes, open_at, close_at, scoring_method
  from exams where id = p_exam_id;
$$;

-- RPC: lấy toàn bộ điểm số các đợt đã nộp của 1 học sinh (báo cáo cá nhân)
create or replace function get_student_progress(p_student_id uuid)
returns table (exam_id uuid, title text, wave_number int, score numeric, max_points numeric, submitted_at timestamptz)
language sql security definer as $$
  select e.id, e.title, e.wave_number, a.score,
    (select coalesce(sum(q.points), 0) from questions q where q.exam_id = e.id) as max_points,
    a.submitted_at
  from attempts a
  join exams e on e.id = a.exam_id
  where a.student_id = p_student_id and a.status = 'submitted' and a.score is not null
  order by e.wave_number asc;
$$;
create or replace function get_my_attempt(p_exam_id uuid, p_student_id uuid)
returns table (status text, answers jsonb, score numeric, submitted_at timestamptz)
language sql security definer as $$
  select status, answers, score, submitted_at from attempts
  where exam_id = p_exam_id and student_id = p_student_id;
$$;
