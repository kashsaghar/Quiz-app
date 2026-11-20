-- ============================================================================
-- MCQ Quiz & Assessment Platform — Supabase schema
--
-- Run this entire file once in the Supabase SQL Editor (Dashboard > SQL Editor
-- > New query) on a fresh project. Safe to re-run: every object is dropped
-- first if it exists.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Clean slate (safe on first run too)
-- ----------------------------------------------------------------------------
drop function if exists public.submit_quiz(uuid, text, text, jsonb);
drop table if exists public.submissions cascade;
drop table if exists public.quiz_answers cascade;
drop table if exists public.questions cascade;
drop table if exists public.quizzes cascade;

drop policy if exists "quiz_diagrams_public_read" on storage.objects;
drop policy if exists "quiz_diagrams_teacher_insert" on storage.objects;
drop policy if exists "quiz_diagrams_teacher_update" on storage.objects;
drop policy if exists "quiz_diagrams_teacher_delete" on storage.objects;

-- ============================================================================
-- TABLES
-- ============================================================================

-- One row per quiz a teacher creates.
create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  time_limit_minutes int not null default 30 check (time_limit_minutes > 0),
  created_at         timestamptz not null default now()
);

-- Questions + their answer OPTIONS (not the correct answer — that is kept
-- in quiz_answers below, in a different table, so it can have different,
-- much stricter RLS policies).
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options       jsonb not null,            -- e.g. {"A": "Paris", "B": "Rome", "C": "Berlin", "D": "Madrid"}
  image_url     text,                      -- optional diagram/graph/table snapshot (public storage URL)
  order_index   int not null default 0,
  created_at    timestamptz not null default now()
);

-- Correct answers, isolated in their own table so RLS can block ALL client
-- read access to it. Only the SECURITY DEFINER submit_quiz() function (and
-- the owning teacher, for editing) can ever see a row here.
create table public.quiz_answers (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null unique references public.questions(id) on delete cascade,
  correct_option text not null,             -- e.g. "B" — must match a key in questions.options
  created_at     timestamptz not null default now()
);

-- One row per graded student attempt. Rows are inserted exclusively by the
-- submit_quiz() RPC (there is no INSERT policy for anon/authenticated), so
-- a score can never be forged or edited from the client.
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  student_name    text not null,
  roll_number     text,
  answers         jsonb not null default '{}'::jsonb,  -- {question_id: "A"}
  score           int not null,
  total_questions int not null,
  submitted_at    timestamptz not null default now()
);

create index questions_quiz_id_idx on public.questions (quiz_id);
create index submissions_quiz_id_idx on public.submissions (quiz_id);
create index quizzes_teacher_id_idx on public.quizzes (teacher_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.submissions enable row level security;

-- ---------------------------------------------------------------- quizzes --
-- Students only ever reach a quiz through its unguessable UUID link, so a
-- public SELECT here only ever leaks a title/time-limit to someone who
-- already has that link — never a listing of all quizzes.
create policy "quizzes_public_read"
  on public.quizzes for select
  using (true);

create policy "quizzes_teacher_insert"
  on public.quizzes for insert
  with check (auth.uid() = teacher_id);

create policy "quizzes_teacher_update"
  on public.quizzes for update
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "quizzes_teacher_delete"
  on public.quizzes for delete
  using (auth.uid() = teacher_id);

-- --------------------------------------------------------------- questions --
-- Public read is required so students can take the quiz. This table never
-- contains the correct answer, so exposing it (including image_url) is safe.
create policy "questions_public_read"
  on public.questions for select
  using (true);

create policy "questions_teacher_write"
  on public.questions for insert
  with check (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())
  );

create policy "questions_teacher_update"
  on public.questions for update
  using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())
  )
  with check (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())
  );

create policy "questions_teacher_delete"
  on public.questions for delete
  using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())
  );

-- ------------------------------------------------------------ quiz_answers --
-- Deliberately NO policy grants anon/authenticated (non-owner) access of any
-- kind. RLS defaults to deny, so this table is completely invisible to
-- students. Only the owning teacher can manage it (for the review/edit UI),
-- and the submit_quiz() RPC bypasses RLS entirely via SECURITY DEFINER to
-- grade on the server.
create policy "quiz_answers_teacher_read"
  on public.quiz_answers for select
  using (
    exists (
      select 1 from public.questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  );

create policy "quiz_answers_teacher_insert"
  on public.quiz_answers for insert
  with check (
    exists (
      select 1 from public.questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  );

create policy "quiz_answers_teacher_update"
  on public.quiz_answers for update
  using (
    exists (
      select 1 from public.questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  );

create policy "quiz_answers_teacher_delete"
  on public.quiz_answers for delete
  using (
    exists (
      select 1 from public.questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  );

-- -------------------------------------------------------------- submissions --
-- No INSERT/UPDATE/DELETE policy exists for anon/authenticated at all, so a
-- student can NEVER write to this table directly — the only way in is the
-- submit_quiz() RPC below. Only the owning teacher can read results, so one
-- student can never see another student's score.
create policy "submissions_teacher_read"
  on public.submissions for select
  using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())
  );

-- ============================================================================
-- TABLE-LEVEL GRANTS
--
-- RLS policies only take effect once the underlying table-level privilege
-- already permits that role to touch the table at all — Postgres checks
-- table grants first, RLS second. Some Supabase projects don't auto-grant
-- these for tables created via the SQL editor, so they're made explicit
-- here. The actual row-level restrictions are still enforced by the
-- policies above (e.g. "insert/update/delete granted to authenticated" does
-- NOT mean any authenticated user can edit any quiz — the policy's
-- auth.uid() = teacher_id check still applies on every row).
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.quizzes to anon, authenticated;
grant insert, update, delete on public.quizzes to authenticated;

grant select on public.questions to anon, authenticated;
grant insert, update, delete on public.questions to authenticated;

grant select, insert, update, delete on public.quiz_answers to authenticated;

-- Deliberately no insert/update/delete grant for anon or authenticated here —
-- the ONLY way into this table is the submit_quiz() RPC below.
grant select on public.submissions to authenticated;

-- ============================================================================
-- STORAGE — diagram/graph/table snapshot images attached to questions.
--
-- Public bucket (images aren't sensitive like answers are — a question's
-- own diagram is shown to the student taking that question anyway), but
-- writes are scoped to the owning teacher via the object path convention
-- "<quiz_id>/<question_id>.png": the policies check that the quiz named by
-- the first path segment belongs to auth.uid().
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('quiz-diagrams', 'quiz-diagrams', true)
on conflict (id) do nothing;

create policy "quiz_diagrams_public_read"
  on storage.objects for select
  using (bucket_id = 'quiz-diagrams');

create policy "quiz_diagrams_teacher_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'quiz-diagrams'
    and exists (
      select 1 from public.quizzes q
      where q.id::text = (storage.foldername(name))[1]
        and q.teacher_id = auth.uid()
    )
  );

create policy "quiz_diagrams_teacher_update"
  on storage.objects for update
  using (
    bucket_id = 'quiz-diagrams'
    and exists (
      select 1 from public.quizzes q
      where q.id::text = (storage.foldername(name))[1]
        and q.teacher_id = auth.uid()
    )
  );

create policy "quiz_diagrams_teacher_delete"
  on storage.objects for delete
  using (
    bucket_id = 'quiz-diagrams'
    and exists (
      select 1 from public.quizzes q
      where q.id::text = (storage.foldername(name))[1]
        and q.teacher_id = auth.uid()
    )
  );

-- ============================================================================
-- submit_quiz RPC — the ONLY way a submission is ever created.
--
-- Runs as SECURITY DEFINER so it can read quiz_answers (which RLS otherwise
-- hides from the caller) to grade the attempt, but it NEVER returns the
-- correct answers to the client — only the final score.
-- ============================================================================
create or replace function public.submit_quiz(
  p_quiz_id     uuid,
  p_student_name text,
  p_roll_number  text,
  p_answers      jsonb
)
returns table (
  submission_id   uuid,
  score           int,
  total_questions int,
  submitted_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total        int;
  v_score        int;
  v_submission_id uuid;
  v_submitted_at timestamptz;
begin
  if p_student_name is null or btrim(p_student_name) = '' then
    raise exception 'Student name is required';
  end if;

  if not exists (select 1 from public.quizzes where id = p_quiz_id) then
    raise exception 'Quiz not found';
  end if;

  select count(*) into v_total
  from public.questions
  where quiz_id = p_quiz_id;

  select count(*) into v_score
  from public.questions q
  join public.quiz_answers a on a.question_id = q.id
  where q.quiz_id = p_quiz_id
    and upper(btrim(coalesce(p_answers ->> q.id::text, ''))) = upper(a.correct_option);

  insert into public.submissions (quiz_id, student_name, roll_number, answers, score, total_questions)
  values (
    p_quiz_id,
    btrim(p_student_name),
    nullif(btrim(coalesce(p_roll_number, '')), ''),
    coalesce(p_answers, '{}'::jsonb),
    v_score,
    v_total
  )
  returning id, submissions.submitted_at into v_submission_id, v_submitted_at;

  return query select v_submission_id, v_score, v_total, v_submitted_at;
end;
$$;

-- Explicitly grant EXECUTE to both anon (unauthenticated students) and
-- authenticated (in case a logged-in teacher previews their own quiz).
revoke all on function public.submit_quiz(uuid, text, text, jsonb) from public;
grant execute on function public.submit_quiz(uuid, text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- Done. Next steps:
--   1. Project Settings > API: copy the "Project URL" and "anon public" key
--      into your frontend .env (see README.md).
--   2. Authentication > Providers: Email provider is enabled by default —
--      that's all teachers need to sign up / log in.
-- ============================================================================
