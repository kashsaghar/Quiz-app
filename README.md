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
6. Because this is a single-page app with client-side routes (`/quiz/:quizId`, `/results/:quizId`), a `vercel.json` with a catch-all rewrite to `/index.html` is included in this repo — without it, directly opening a student quiz link (rather than navigating to it from within the app) would 404, since Vercel would otherwise look for a literal file at that path.

### Backend → Supabase

Already deployed — Supabase's free tier (500MB database, 50k monthly active users, unlimited API requests) hosts the Postgres DB, Auth, and RLS policies with no separate step. There's nothing else to deploy.

## Using the app

**As a teacher:** Sign up → Dashboard → "New Quiz" → upload a `.pdf`/`.txt` or paste text → the parser detects numbered questions (`1.`, `2.`), options (`A)`–`D)` or `a.`–`d.`), and an answer key (`Answers: 1-A, 2-C` or inline `Answer: B`) → review/edit/add/delete questions and confirm each correct answer → set title & time limit → Save. Copy the student link from the dashboard and share it.

If a PDF page has no real text layer (a scanned page, or a PDF made entirely of images), the extractor automatically falls back to OCR via [Tesseract.js](https://github.com/naptha/tesseract.js) — it renders that page to an image and reads it, entirely in the browser (no server, no API key, no cost). This is slower and less accurate than a real text layer, so the review step flags it with a warning asking the teacher to double-check every question. Pages with a normal text layer skip OCR entirely and stay fast.

Diagrams, graphs, and tables (common in exam-style PDFs) are usually drawn as vector content with no extractable "image" at all — `pdfQuizExtractor.js` detects a question that likely needs one (scattered short caption/axis-label lines, or a question whose option text couldn't be recovered from a table/graph layout) and auto-crops a snapshot of that region from the rendered page, attached as the question's image. Auto-cropping is a heuristic, not a guarantee — in the review step, a teacher can always remove (and undo removing) an auto-attached image, or upload their own picture instead (a phone photo of the printed page works fine) to replace it or to add one to a question that doesn't have one.

If you also have a separate marking scheme / answer key PDF for the same question paper, upload it in the review step ("Apply Marking Scheme") to auto-fill correct answers by question number, instead of selecting all of them by hand. It understands both a table layout (`1   D   1` — question, answer, marks) and a compact inline list (`1-A, 2-C, 3-B`).

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

## Theory exam feature (separate from MCQ quizzes above)

A second, independent feature: a teacher uploads a theory exam paper (PDF) and, optionally, its marking scheme (PDF). Students open a link, download the paper, work it out on their own, then upload a PDF of their worked answer sheet (photographed/scanned pages). A serverless function sends the exam paper (+ marking scheme, if one was uploaded) + student's answer sheet to Google's Gemini API, which grades it and returns a mark + per-question feedback, visible only to the teacher.

**Marking scheme is optional.** If the teacher uploads one, Gemini grades strictly against it. If not, Gemini acts as its own subject-matter-expert examiner: it works out the correct answer for each question from the exam paper itself, decides a fair mark allocation per question (using marks printed on the paper where shown, otherwise splitting the exam's total marks by apparent question length/difficulty), and grades the student's answers against that self-determined standard. The per-question feedback says which mode was used so a teacher reviewing results can tell whether a mark came from the real marking scheme or Gemini's own judgment.

This feature is entirely additive — it uses its own tables (`theory_exams`, `theory_submissions`), its own storage buckets, and its own routes/pages. It never reads or writes anything in the MCQ tables (`quizzes`, `questions`, `quiz_answers`, `submissions`).

### How the security model works

- **The marking scheme never reaches the browser.** It's stored in a private `marking-schemes` bucket with no read policy for students — only the owning teacher (via RLS) and the grading function (via the Supabase service-role key, which bypasses RLS) can read it.
- **A student's own uploaded answer sheet can't be read back by them** — the `answer-sheets` bucket only grants SELECT to the owning teacher.
- **Marks/grading status can never be forged from the client.** `theory_submissions` has no INSERT/UPDATE/DELETE policy for `anon`/`authenticated` at all. The only ways in are the `create_theory_submission()` / `attach_theory_answer_sheet()` RPCs (which never touch marks or status), and the `/api/grade-theory` serverless function, which uses the service-role key.
- **The Gemini API key and the Supabase service-role key only ever live on the server** (Vercel environment variables, no `VITE_` prefix) — never in the client bundle.

Full policies and comments are in [`supabase/theory_schema.sql`](./supabase/theory_schema.sql); the grading function is [`api/grade-theory.js`](./api/grade-theory.js).

### Setup

1. **Database:** In the Supabase SQL Editor, run [`supabase/theory_schema.sql`](./supabase/theory_schema.sql) (after `schema.sql`). This creates the two new tables, their RLS policies, the three storage buckets (`exam-papers` public; `marking-schemes` and `answer-sheets` private), and the two RPCs. It never modifies or drops anything from `schema.sql`.
2. **Gemini API key:** Get an API key for your Gemini subscription from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. **Supabase service-role key:** Project Settings → API → `service_role` key (⚠️ keep this secret — it bypasses every RLS policy).
4. **Vercel environment variables:** in your Vercel project settings, add (server-side, no `VITE_` prefix so they're never shipped to the browser):
   - `GEMINI_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_URL` — same value as `VITE_SUPABASE_URL`
   - `GEMINI_MODEL` (optional — defaults to `gemini-2.5-flash`; bump this if a newer/better Gemini model is available by the time you set this up)
5. Redeploy. The `/api/grade-theory` serverless function is picked up automatically — no separate deployment step.

### Using it

**As a teacher:** Dashboard → "New Theory Exam" → title, total marks, upload the exam paper PDF and (optionally) the marking scheme PDF → Create. Copy the student link and share it. On the exam's "Results" page, click a student's name to see their mark and Gemini's per-question feedback; a "Grade now"/"Regrade" button lets you (re)trigger grading manually if it's stuck on "Awaiting grading" or "Grading failed".

**As a student:** Open the link → download the exam paper → work it out on paper → photograph/scan your pages and convert them to a single PDF → enter your name (+ optional roll number) → upload that PDF → Submit. You'll only see a "submitted successfully" confirmation — your teacher checks the result.

### Known limitations

- Grading is triggered by the student's browser right after upload (fire-and-forget) rather than by a database webhook, so a closed tab or dropped connection right at submission can occasionally leave a submission stuck at "pending" — the teacher's "Grade now" button handles that.
- Very large/many-page PDFs (exam paper + marking scheme + answer sheet combined, base64-encoded) can exceed Gemini's inline request size limit or the serverless function's time limit (configured for 60s, but actual cap depends on your Vercel plan) — if that happens the submission is marked "Grading failed" with the error message, and you can retry after compressing the PDF.
