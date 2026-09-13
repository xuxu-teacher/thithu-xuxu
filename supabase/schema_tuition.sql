-- ============================================================
-- HỌC PHÍ — đánh dấu học sinh đã nộp hay chưa
-- ============================================================
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

alter table students add column if not exists tuition_paid boolean not null default false;
