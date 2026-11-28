-- ============================================================================
-- Theory exam feature — ADDITIVE migration.
--
-- Run this once in the Supabase SQL Editor, AFTER schema.sql. It only creates
-- new tables/buckets/functions — it never touches quizzes, questions,
-- quiz_answers or submissions, so existing MCQ tests and results are
-- completely unaffected.
--
-- Safe to re-run: every object here is dropped first if it exists (but DROP
-- TABLE CASCADE on theory_exams/theory_submissions only ever removes rows
-- created BY this feature, never the MCQ tables above).
-- ============================================================================

create extension if not exists pgcrypto;

drop function if exists public.create_theory_submission(uuid, text, text);
drop function if exists public.attach_theory_answer_sheet(uuid, text);
drop table if exists public.theory_submissions cascade;
drop table if exists public.theory_exams cascade;

drop policy if exists "exam_papers_public_read" on storage.objects;
drop policy if exists "exam_papers_teacher_insert" on storage.objects;
drop policy if exists "exam_papers_teacher_update" on storage.objects;
drop policy if exists "exam_papers_teacher_delete" on storage.objects;
drop policy if exists "marking_schemes_teacher_all" on storage.objects;
drop policy if exists "answer_sheets_teacher_read" on storage.objects;
drop policy if exists "answer_sheets_student_insert" on storage.objects;

-- ============================================================================
-- TABLES
-- ============================================================================

-- One row per theory exam a teacher creates.
create table public.theory_exams (
  id                   uuid primary key default gen_random_uuid(),
  teacher_id           uuid not null references auth.users(id) on delete cascade,
  title                text not null,
  total_marks          int not null check (total_marks > 0),
  exam_paper_url       text,              -- public URL in the exam-papers bucket
  marking_scheme_path  text,              -- storage path in the PRIVATE marking-schemes bucket
  created_at           timestamptz not null default now()
);

-- One row per student attempt. Rows are created exclusively by the
-- create_theory_submission() RPC (no direct insert policy for anon), and
-- marks/status are only ever written by the grading function using the
-- service-role key — never forgeable from the client.
create table public.theory_submissions (
  id                 uuid primary key default gen_random_uuid(),
  exam_id            uuid not null references public.theory_exams(id) on delete cascade,
  student_name       text not null,
  roll_number        text,
  answer_sheet_path  text,              -- storage path in the PRIVATE answer-sheets bucket
  status             text not null default 'pending'
                       check (status in ('pending', 'grading', 'graded', 'error')),
  marks_awarded      int,
  grading_feedback   jsonb,             -- Gemini's per-question breakdown + overall feedback
  error_message      text,
  submitted_at       timestamptz not null default now(),
  graded_at          timestamptz
);

create index theory_exams_teacher_id_idx on public.theory_exams (teacher_id);
create index theory_submissions_exam_id_idx on public.theory_submissions (exam_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.theory_exams enable row level security;
alter table public.theory_submissions enable row level security;

-- ------------------------------------------------------------- theory_exams --
-- Same reasoning as "quizzes_public_read": students only ever reach an exam
-- through its unguessable UUID link, so public SELECT only ever leaks a
-- title/total-marks to someone who already has that link.
create policy "theory_exams_public_read"
  on public.theory_exams for select
  using (true);

create policy "theory_exams_teacher_insert"
  on public.theory_exams for insert
  with check (auth.uid() = teacher_id);

create policy "theory_exams_teacher_update"
  on public.theory_exams for update
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "theory_exams_teacher_delete"
  on public.theory_exams for delete
  using (auth.uid() = teacher_id);

-- ------------------------------------------------------- theory_submissions --
-- No INSERT/UPDATE/DELETE policy for anon/authenticated at all. The only way
-- in is create_theory_submission() / attach_theory_answer_sheet() below, and
-- the only way marks/status ever change is the grading backend's
-- service-role key, which bypasses RLS entirely. A student can never see
-- their own or another student's marks -- only the owning teacher can.
create policy "theory_submissions_teacher_read"
  on public.theory_submissions for select
  using (
    exists (select 1 from public.theory_exams te where te.id = exam_id and te.teacher_id = auth.uid())
  );

-- ============================================================================
-- TABLE-LEVEL GRANTS
-- ============================================================================
grant select on public.theory_exams to anon, authenticated;
grant insert, update, delete on public.theory_exams to authenticated;

-- Deliberately no insert/update/delete grant for anon or authenticated --
-- the only ways in are the two RPCs below (and the grading backend, which
-- uses the service-role key and therefore ignores grants/RLS entirely).
grant select on public.theory_submissions to authenticated;

-- ============================================================================
-- STORAGE
-- ============================================================================

-- Exam paper: public, like quiz-diagrams -- students need to download it with
-- no login, and a question paper isn't sensitive the way a marking scheme or
-- a student's own work is.
insert into storage.buckets (id, name, public)
values ('exam-papers', 'exam-papers', true)
on conflict (id) do nothing;

-- Marking scheme: PRIVATE. Only the owning teacher (and the grading
-- backend's service-role key) can ever read it.
insert into storage.buckets (id, name, public)
values ('marking-schemes', 'marking-schemes', false)
on conflict (id) do nothing;

-- Answer sheets: PRIVATE. Students upload their own work here but can never
-- read anyone's (including their own) back; only the owning teacher and the
-- grading backend can.
insert into storage.buckets (id, name, public)
values ('answer-sheets', 'answer-sheets', false)
on conflict (id) do nothing;

create policy "exam_papers_public_read"
  on storage.objects for select
  using (bucket_id = 'exam-papers');

create policy "exam_papers_teacher_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'exam-papers'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  );

create policy "exam_papers_teacher_update"
  on storage.objects for update
  using (
    bucket_id = 'exam-papers'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  );

create policy "exam_papers_teacher_delete"
  on storage.objects for delete
  using (
    bucket_id = 'exam-papers'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  );

-- Marking scheme bucket is owner-only for every operation (read included) --
-- a student must never be able to fetch the answer key.
create policy "marking_schemes_teacher_all"
  on storage.objects for all
  using (
    bucket_id = 'marking-schemes'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'marking-schemes'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  );

-- Answer sheets: the owning teacher can read (to review a student's actual
-- work). Path convention is "<exam_id>/<submission_id>.pdf".
create policy "answer_sheets_teacher_read"
  on storage.objects for select
  using (
    bucket_id = 'answer-sheets'
    and exists (
      select 1 from public.theory_exams te
      where te.id::text = (storage.foldername(name))[1] and te.teacher_id = auth.uid()
    )
  );

-- Anyone can upload under a folder that names a real exam -- students are
-- never authenticated, so there is no owner to check here. This mirrors how
-- submit_quiz() already trusts anonymous, client-reported student input.
create policy "answer_sheets_student_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'answer-sheets'
    and exists (select 1 from public.theory_exams te where te.id::text = (storage.foldername(name))[1])
  );

-- ============================================================================
-- RPCs — the only ways a theory_submissions row (or its answer_sheet_path)
-- is ever created/changed from the client.
-- ============================================================================

create or replace function public.create_theory_submission(
  p_exam_id      uuid,
  p_student_name text,
  p_roll_number  text
)
returns table (submission_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_student_name is null or btrim(p_student_name) = '' then
    raise exception 'Student name is required';
  end if;

  if not exists (select 1 from public.theory_exams where id = p_exam_id) then
    raise exception 'Exam not found';
  end if;

  insert into public.theory_submissions (exam_id, student_name, roll_number)
  values (p_exam_id, btrim(p_student_name), nullif(btrim(coalesce(p_roll_number, '')), ''))
  returning id into v_id;

  return query select v_id;
end;
$$;

revoke all on function public.create_theory_submission(uuid, text, text) from public;
grant execute on function public.create_theory_submission(uuid, text, text) to anon, authenticated;

-- Points a just-created submission at its uploaded answer sheet. Can only be
-- called once per submission (answer_sheet_path must still be null), so a
-- student can't rewrite their own work after grading has started.
create or replace function public.attach_theory_answer_sheet(
  p_submission_id      uuid,
  p_answer_sheet_path  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.theory_submissions
  set answer_sheet_path = p_answer_sheet_path
  where id = p_submission_id and answer_sheet_path is null;

  if not found then
    raise exception 'Submission not found, or an answer sheet was already attached';
  end if;
end;
$$;

revoke all on function public.attach_theory_answer_sheet(uuid, text) from public;
grant execute on function public.attach_theory_answer_sheet(uuid, text) to anon, authenticated;

-- ============================================================================
-- Done. Next steps (see README.md "Theory exam feature" section):
--   1. Deploy the /api/grade-theory serverless function (already in the repo).
--   2. In your Vercel project settings, add these environment variables:
--        SUPABASE_SERVICE_ROLE_KEY  (Project Settings > API > service_role)
--        SUPABASE_URL               (same value as VITE_SUPABASE_URL)
--        GEMINI_API_KEY             (from your Gemini/AI Studio account)
--   3. Redeploy.
-- ============================================================================
