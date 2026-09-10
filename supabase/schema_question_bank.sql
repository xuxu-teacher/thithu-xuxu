-- ============================================================
-- KHO CÂU HỎI + SINH ĐỀ THEO MA TRẬN
-- ============================================================
-- Chạy file này trong Supabase SQL Editor SAU KHI đã chạy schema.sql gốc.
-- Chỉ thêm bảng/hàm mới, không đổi gì ở schema cũ — an toàn chạy lại
-- nhiều lần ("if not exists" / "or replace" / "drop policy if exists").
--
-- Ý tưởng: câu hỏi được tải lên và tự động phân loại (chủ đề + mức độ,
-- xem edge function classify-questions) sẽ nằm ở đây, TÁCH RIÊNG khỏi
-- bảng `questions` (là câu hỏi đã thuộc một đề thi cụ thể). Khi giáo viên
-- gửi "ma trận đề", hệ thống rút ngẫu nhiên đúng số lượng câu theo từng
-- ô (chủ đề × mức độ × dạng) từ đây, sao chép sang `questions` của đề
-- thi mới — không đụng gì tới luồng tạo đề thủ công / thi / chấm điểm
-- đang chạy.
-- ============================================================

create table if not exists question_bank (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  grade text not null check (grade in ('10','11','12')),
  chapter_id uuid references chapters(id) on delete set null,
  topic text not null,          -- tên chủ đề, khớp với chapters.title của đúng khối
  difficulty text not null check (difficulty in ('Nhận biết','Thông hiểu','Vận dụng','Vận dụng cao')),
  part text not null check (part in ('mcq','true_false','short_answer')),
  content_html text not null,
  image_url text,
  options jsonb,
  correct_answer text,
  explanation_html text,
  points numeric not null default 1,
  source_file text,             -- tên file Word gốc — để truy vết nguồn đề, biết câu này lấy từ đề nào
  needs_review boolean not null default false,  -- AI không chắc chủ đề/mức độ -> cần giáo viên rà lại
  created_at timestamptz default now()
);

create index if not exists idx_question_bank_filter
  on question_bank(teacher_id, grade, topic, difficulty, part);

alter table question_bank enable row level security;
drop policy if exists teacher_own_question_bank on question_bank;
create policy teacher_own_question_bank on question_bank for all using (auth.uid() = teacher_id);

-- RPC: đếm số câu hiện có trong kho theo từng ô (chủ đề × mức độ × dạng)
-- — dùng để hiển thị "kho còn bao nhiêu câu" ngay khi giáo viên dựng ma
-- trận đề, tránh yêu cầu nhiều hơn số câu thực có.
create or replace function question_bank_counts(p_teacher_id uuid, p_grade text)
returns table (topic text, difficulty text, part text, cnt bigint)
language sql security definer as $$
  select topic, difficulty, part, count(*) as cnt
  from question_bank
  where teacher_id = p_teacher_id and grade = p_grade
  group by topic, difficulty, part;
$$;

-- RPC: sinh đề thi từ ma trận.
-- p_matrix: mảng JSON các ô, mỗi ô dạng {"topic":"...","difficulty":"...","part":"mcq","count":3}
-- Đề thi (bảng `exams`) phải được INSERT trước ở phía client (giống hệt
-- luồng tạo đề thủ công hiện tại) — hàm này chỉ RÚT CÂU HỎI và chèn vào
-- `questions` với đúng exam_id đó.
-- Trả về, cho MỖI ô của ma trận: số câu yêu cầu (requested) vs số câu
-- thực rút được (inserted) — để client cảnh báo nếu kho chưa đủ câu ở ô
-- nào đó, thay vì âm thầm tạo ra đề thiếu câu.
create or replace function create_exam_from_matrix(
  p_exam_id uuid,
  p_teacher_id uuid,
  p_grade text,
  p_matrix jsonb
)
returns table (topic text, difficulty text, part text, requested int, inserted int)
language plpgsql security definer as $$
declare
  v_item jsonb;
  v_order int := 0;
  v_count int;
  v_requested int;
begin
  for v_item in select * from jsonb_array_elements(p_matrix) loop
    v_requested := (v_item->>'count')::int;

    with picked as (
      select * from question_bank qb
      where qb.teacher_id = p_teacher_id
        and qb.grade = p_grade
        and qb.topic = (v_item->>'topic')
        and qb.difficulty = (v_item->>'difficulty')
        and qb.part = (v_item->>'part')
      order by random()
      limit v_requested
    ), numbered as (
      select picked.*, row_number() over () as rn from picked
    )
    insert into questions (exam_id, order_index, part, content_html, image_url, options, correct_answer, explanation_html, points)
    select p_exam_id, v_order + rn, numbered.part, numbered.content_html, numbered.image_url,
           numbered.options, numbered.correct_answer, numbered.explanation_html, numbered.points
    from numbered;

    get diagnostics v_count = row_count;
    v_order := v_order + v_count;

    topic := v_item->>'topic';
    difficulty := v_item->>'difficulty';
    part := v_item->>'part';
    requested := v_requested;
    inserted := v_count;
    return next;
  end loop;
end;
$$;
