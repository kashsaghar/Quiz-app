# MCQ Quiz & Assessment Platform

A free-to-host MCQ quiz platform: teachers sign up, build quizzes by uploading a PDF/TXT question bank (or pasting text), review the auto-parsed questions, and share a link. Students take the quiz with no login, against a live countdown timer. Grading happens entirely on the server — correct answers never reach the browser.

**Stack:** React (Vite) + Tailwind CSS v4 + lucide-react + Supabase (Auth, Postgres, Row-Level Security, RPC).

## Project structure

```
Quiz-app/
├── supabase/
│   └── schema.sql              # Full DB schema, RLS policies, submit_quiz() RPC
├── src/
│   ├── lib/supabaseClient.js   # Supabase client (reads .env)
│   ├── context/AuthContext.jsx # Teacher auth session state
│   ├── utils/
│   │   ├── quizParser.js       # Text -> {questions, options, answers} parser
│   │   ├── pdfText.js          # PDF -> plain text (pdfjs-dist, client-side)
│   │   ├── csvExport.js        # Results -> downloadable CSV
│   │   └── studentProgress.js  # localStorage persistence for in-progress attempts
│   ├── components/
│   │   ├── ProtectedRoute.jsx
│   │   ├── QuestionEditor.jsx  # Review/edit UI row for one question
│   │   ├── Timer.jsx           # Countdown driven by an absolute end-time
│   │   └── Spinner.jsx
│   ├── pages/
│   │   ├── AuthPage.jsx        # Teacher login / signup
│   │   ├── Dashboard.jsx       # Teacher's quiz list + copy-link
│   │   ├── CreateQuiz.jsx      # Upload/paste -> parse -> review & edit -> save
│   │   ├── QuizResults.jsx     # Per-quiz analytics + results table + CSV export
│   │   └── student/
│   │       ├── StudentQuizPage.jsx   # State machine: register -> active -> submitted
│   │       ├── RegistrationGate.jsx  # Name + roll number form
│   │       ├── ActiveTest.jsx        # Timed question list
│   │       └── SubmittedScreen.jsx   # Confirmation only — no scores shown
│   ├── App.jsx                 # Routes (code-split per page)
│   └── main.jsx
└── .env.example
```

## How the security model works

- **Correct answers never leave the database.** They live in `quiz_answers`, a table with no SELECT policy for students at all. Grading happens inside the `submit_quiz()` Postgres function, which runs as `SECURITY DEFINER` (so it can read `quiz_answers` on the server) and returns only a score — never the answer key.
- **Students can't write submissions directly.** The `submissions` table has no INSERT policy for `anon`/`authenticated` — the only way a row is created is through `submit_quiz()`.
- **Students can't read other students' results.** `submissions` SELECT is restricted by RLS to the teacher who owns the quiz (`teacher_id = auth.uid()`).
- **Quizzes/questions are readable by anyone with the link** (`/quiz/:quizId`), which is required for an unauthenticated student to take the test. There's no "list all quizzes" UI, so this only matters to someone who already has a specific link — and it never exposes answers.

Full policies and comments are in [`supabase/schema.sql`](./supabase/schema.sql).

## 1. Set up Supabase (free tier)

1. Go to [supabase.com](https://supabase.com) → **New project** (choose the free plan). Pick a database password and region, then wait ~2 minutes for provisioning.
2. Open **SQL Editor** → **New query**, paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**. This creates all four tables, every RLS policy, and the `submit_quiz` function.
3. Go to **Authentication → Providers** and confirm **Email** is enabled (it is by default) — that's all teachers need.
   - Optional: under **Authentication → Settings**, you can disable "Confirm email" during development so signup doesn't require an email click.
4. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Configure the frontend

```bash
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Install and run locally:

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`, sign up as a teacher, and create your first quiz.

## 3. Deploy for free

### Frontend → Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
3. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output directory `dist` (defaults — no change needed).
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. Vercel's free tier covers this comfortably.
6. Because this is a single-page app with client-side routes (`/quiz/:quizId`, `/results/:quizId`), Vercel's Vite preset already rewrites all paths to `index.html` — no extra `vercel.json` is required. If you ever see a 404 on a direct link/refresh, add a `vercel.json` with a catch-all rewrite to `/index.html`.

### Backend → Supabase

Already deployed — Supabase's free tier (500MB database, 50k monthly active users, unlimited API requests) hosts the Postgres DB, Auth, and RLS policies with no separate step. There's nothing else to deploy.

## Using the app

**As a teacher:** Sign up → Dashboard → "New Quiz" → upload a `.pdf`/`.txt` or paste text → the parser detects numbered questions (`1.`, `2.`), options (`A)`–`D)` or `a.`–`d.`), and an answer key (`Answers: 1-A, 2-C` or inline `Answer: B`) → review/edit/add/delete questions and confirm each correct answer → set title & time limit → Save. Copy the student link from the dashboard and share it.

**As a student:** Open the link → enter name (+ optional roll number) → Start Test → answer questions until time runs out or you submit manually → see a confirmation screen (no scores). Refreshing mid-test resumes exactly where you left off (same timer, same answers) because progress is cached in `localStorage`, keyed by quiz + name.

**Parser format reference** (also shown as a placeholder in the paste box):

```
1. What is the capital of France?
A) Paris
B) Rome
C) Berlin
D) Madrid

2. 2 + 2 = ?
a. 3
b. 4
c. 5

Answers: 1-A, 2-B
```

An inline `Answer: B` directly under a question's options also works instead of a trailing answer-key block. Any question the parser can't confidently match to an answer is flagged in the review step for the teacher to set by hand.
