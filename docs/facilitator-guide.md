# cronwise — Facilitator Guide

**Workshop:** Getting Started with GitHub Copilot
**Duration:** 60 minutes
**Repo:** https://github.com/samueltauil/cronwise

> ⚠️ **Facilitators only.** This document lists the planted defects and their causes. Don't put it on screen, and don't send attendees a link that lands here. Attendees work from the [issue list](https://github.com/samueltauil/cronwise/issues).

---

## What cronwise is

A small REST API that turns a cron expression into plain English and shows the next run times.

```
GET  /health
GET  /explain?expression=<cron>&count=<n>
POST /explain            { "expression": "...", "count": 5 }
```

Why this repo works for a Copilot workshop: every engineer has been burned by a cron expression, the logic is pure and self-contained, and the defects are *subtle but provable* — which forces the review conversation that makes the workshop land.

---

## The planted defects

Six exercises, ramping in difficulty. Each maps to a GitHub issue.

| # | Issue | Location | Root cause | Observable symptom |
|---|---|---|---|---|
| **A** | [#2](https://github.com/samueltauil/cronwise/issues/2) | `src/humanize.js` → `formatClock` | `hour % 12` with no `|| 12` fallback | `0 12 * * *` → "At **0:00 PM** every day" |
| **B** | [#4](https://github.com/samueltauil/cronwise/issues/4) | `src/parser.js` → `resolveAtom` | day-of-week `7` never normalized to `0` | `0 12 * * 7` → **HTTP 400** |
| **C** | [#5](https://github.com/samueltauil/cronwise/issues/5) | `src/schedule.js` → `matchesDate` | ANDs day-of-month and day-of-week; POSIX cron **ORs** them when both are restricted | `0 3 1 * MON` → next run **Feb 2027** |
| **D** | [#3](https://github.com/samueltauil/cronwise/issues/3) | `src/humanize.js` → `describeTime` | step syntax expanded, never summarized (see the `TODO`) | `*/15 * * * *` → "96 times a day" |
| **E** | [#1](https://github.com/samueltauil/cronwise/issues/1) | repo root | no README exists | new joiner can't run the service |
| **F** | [#6](https://github.com/samueltauil/cronwise/issues/6) | `src/` | no collisions module at all | `POST /collisions` → 404 |

**Defect C is the one that matters.** It's a real POSIX cron rule that most engineers don't know, the code looks perfectly reasonable, and a reviewer skimming a diff would approve it. When Copilot explains *why* it's wrong rather than just changing a line, that's the moment the room understands the tool.

### Seeded starting state

- Two passing tests in `test/server.test.js` — CI starts green, and Copilot has existing conventions to imitate when asked to generate more.
- `examples/jobs.json` — a realistic eight-job scheduler config, referenced by issues #4 and #6.
- `.github/workflows/ci.yml` — runs `npm test` plus a curl smoke test.

---

## Before the workshop

### Facilitator pre-flight (do this 30 minutes ahead, not 3 minutes ahead)

```bash
git clone https://github.com/samueltauil/cronwise
cd cronwise
npm install
npm run demo:verify
```

`demo:verify` boots the app on an ephemeral port and asserts that **every planted defect is still present**, the baseline tests pass, the tree is clean, and you're on `main`. Expected output:

```
cronwise demo pre-flight

  [PASS] A   humanize: noon renders as "0:00 PM"
  [PASS] B   parser: day-of-week 7 is rejected with HTTP 400
  [PASS] C   schedule: day-of-month AND day-of-week starves the job
  [PASS] D   humanize: step syntax is not summarized
  [PASS] F   routes: POST /collisions is not implemented
  [PASS] OK  baseline: weekday expression still explains correctly
  [PASS] E   docs: README.md does not exist
  [PASS] GIT git: working tree is clean
  [PASS] GIT git: checked out on main
  [PASS] GIT tests: baseline suite passes

Repository is demo-ready. All planted defects are present.
```

**If any check fails, run `npm run demo:reset` and verify again.** Do not start a workshop on a red pre-flight.

### Attendee prerequisites (send 24h ahead)

- An active GitHub Copilot license, signed in.
- VS Code with the **GitHub Copilot** and **GitHub Copilot Chat** extensions.
- Node.js 20+.
- [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli) installed (`copilot --version` should work).
- The repo cloned and `npm install` already run — **on the day, not during the session**.

### Facilitator setup

- Terminal font at 16pt+, VS Code at 16pt+.
- Close every unrelated editor tab. Copilot reads open tabs; a stray file changes suggestions.
- Browser logged into GitHub with the repo already open.
- Have a **completed coding-agent PR** open in a background tab as a fallback (see Surface 4).

---

## Run of show

| Time | Segment | Surface |
|---|---|---|
| 0:00–0:07 | Introduction | Slides |
| 0:07–0:12 | Capability map | Slides |
| 0:12–0:20 | Understand an unfamiliar repo, fix a live 400 | **Copilot CLI** |
| 0:20–0:30 | Completions, `/fix`, `/tests` | **VS Code** |
| 0:30–0:38 | Build a new endpoint across files | **Copilot app** |
| 0:38–0:44 | Delegate an issue, review the PR | **github.com** |
| 0:44–0:52 | Best practices | Discussion |
| 0:52–1:00 | Q&A and next steps | — |

Four surfaces is the spine of this workshop. The point isn't "Copilot has many UIs" — it's that **one unit of work moves from terminal to editor to agent to browser**, and Copilot is present at each hop.

---

## 0:00–0:07 · Introduction

- Copilot is an AI pair programmer across the whole SDLC, not autocomplete.
- Runs in VS Code, Visual Studio, JetBrains, Xcode, Neovim, the CLI, github.com, and GitHub Mobile.
- Today's surfaces: **completions**, **inline chat**, **chat panel**, **agent mode**, **slash commands**, **`#`/`@` context**.

**Talk track:** *"Copilot's output quality is a function of the context it has. Everything we do today is about feeding it better context."*

---

## 0:07–0:12 · Capability map

| Scenario | Surface |
|---|---|
| Write new code | Completions, inline chat, agent mode |
| Understand unfamiliar code | `/explain`, `@workspace`, Copilot CLI |
| Tests | `/tests` |
| Docs | `/doc`, agent mode |
| Debug | `/fix`, paste the failure into chat |
| Review | Copilot code review, PR summaries |

---

## 0:12–0:20 · Surface 1 — Copilot CLI

**Goal:** understand and repair a repo you've never seen, without opening an editor.

Start the server in a **second terminal** and leave it running all session:

```bash
npm start
```

Wait for `cronwise listening on http://localhost:3000`. Cold start can take a few seconds — confirm before you present:

```bash
curl -s http://localhost:3000/health
```
```json
{"status":"ok","service":"cronwise"}
```

Now launch Copilot in the repo:

```bash
copilot
```

### Prompt 1 — orient

```
What does this project do and what endpoints does it expose?
```

It reads the tree and answers. **Point out that there is no README** — it derived all of that from the code. That's the hook.

### Prompt 2 — show a working call

```
Give me a curl command that explains a job running at 9:30am on weekdays.
```

Verify live:

```bash
curl -s "http://localhost:3000/explain?expression=30%209%20*%20*%201-5"
```
```json
{"expression":"30 9 * * 1-5","description":"At 9:30 AM on weekdays","averageIntervalMinutes":2016,"nextRuns":["..."]}
```

### Prompt 3 — hit defect B

Reproduce the bug from issue #4 first, so the failure is real and on screen:

```bash
curl -s "http://localhost:3000/explain?expression=0%2012%20*%20*%207"
```
```json
{"error":"dayOfWeek value 7 is out of range (0-6)","field":"dayOfWeek"}
```

Then hand it to Copilot:

```
This returns HTTP 400, but 7 is valid cron for Sunday — examples/jobs.json
uses it for the weekly usage report. Find the cause and fix it.
```

**What good looks like:** it locates `resolveAtom` in `src/parser.js` and normalizes `7` to `0` for the day-of-week field. Restart the server and re-run the curl — the description should now read *"At 0:00 PM on Sunday"* (noon is still wrong; that's defect A, and it's a nice seam into the next surface).

> If Copilot patches the range check instead of normalizing the value, ask: *"Will `0 12 * * 7` and `0 12 * * 0` now produce identical next-run times? Show me."* That reliably steers it to the correct fix.

**Debrief:** the CLI is the shortest path from "I have a stack trace" to "I understand this codebase." Ideal for SSH sessions, CI boxes, and repos you don't own.

**Participant task (3 min):** ask the CLI one question about a file you've never read.

---

## 0:20–0:30 · Surface 2 — VS Code

Open the folder. Three quick hits — don't let any one run long.

### a) Completions — defect D (issue #3)

Open `src/humanize.js` and find the `TODO` inside `describeTime`. Type this comment directly beneath it:

```js
// Describe step patterns: */15 -> "Every 15 minutes",
// 0-30/10 -> "Every 10 minutes from :00 to :30"
```

Let ghost text propose the implementation. Press `Alt+]` / `Alt+[` to cycle alternatives **before** accepting — showing that there are multiple candidates is the teaching moment.

### b) `/fix` — defect A (issue #2)

Select the `formatClock` function. Inline chat (`Ctrl+I` / `Cmd+I`):

```
Noon renders as "0:00 PM" and midnight as "0:00 AM". Fix the 12-hour conversion.
```

The fix is `const displayHour = hour % 12 || 12;`. It's small on purpose — this is the confidence builder before the hard one.

### c) `/tests`

Select `parseExpression` in `src/parser.js`, then in chat:

```
/tests
```

Then refine — this second prompt is the actual lesson:

```
Add cases for @macros, comma-separated lists, inverted ranges, and month
name aliases. Follow the node:test conventions already in test/server.test.js.
```

Run them:

```bash
npm test
```

**Expect trouble, and welcome it.** Generated tests frequently assert `0 0 * * 7` is valid. If you already fixed defect B in Surface 1, they pass; if you're on a clean clone, they fail. Either outcome is a gift:

> *"Copilot is confident, not correct. The test run is the referee. This is exactly why we generate tests before we trust a fix."*

**Participant task (3 min):** run `/tests` on `humanize`.

---

## 0:30–0:38 · Surface 3 — GitHub Copilot app (agent mode)

**The memorable moment.** Multi-file, autonomous, with you as the reviewer.

1. Open the Copilot app → new session on the `cronwise` project.
2. Prompt:

```
Implement POST /collisions as described in issue #6. Jobs that fire in the
same minute should be grouped, and jobs whose run windows overlap based on
durationMinutes should be flagged. Add tests and make sure npm test passes.
Use examples/jobs.json as a realistic input.
```

3. Narrate what it does: reads `examples/jobs.json`, creates `src/collisions.js`, wires a route, writes tests, runs them, iterates on failures.

4. **Reject something on purpose.** Even if the code is good:

```
Move the overlap detection into its own exported function so it can be
tested without going through the HTTP layer.
```

Reviewing and redirecting is the skill being taught. A facilitator who accepts everything teaches the wrong lesson.

5. Let it open a PR.

**Debrief:** completions help you type; agent mode helps you ship a unit of work. You still own the review.

---

## 0:38–0:44 · Surface 4 — github.com

1. Open the repo on github.com. Use **Ask Copilot**:

```
Where is the next-run calculation and what edge cases does it miss?
```

2. Open **issue #5** (defect C) and **assign it to Copilot**. It starts working in the background.

3. While it works, go to the PR from Surface 3 and show:
   - the generated PR summary,
   - **Copilot code review** on the diff,
   - CI checks running.

4. Return to the coding agent's PR on issue #5. Read its description and session log.

**The payoff:** defect C is genuinely subtle. If the agent correctly explains that POSIX cron ORs day-of-month and day-of-week when both are restricted, that lands harder than any slide. If it gets it wrong, that's *also* a great outcome — review it live and show how you'd push back.

> **Fallback:** if the coding agent is slow, switch to the pre-made PR you opened before the session. Never wait on a progress spinner in front of a room.

---

## 0:44–0:52 · Best practices

Tie each one to something they just watched:

- **Set the stage** — the CLI answered well because the repo *was* the context.
- **Be specific** — *"follow the conventions in `test/server.test.js`"* produced usable tests; *"write tests"* would not have.
- **Give examples** — the curl repro in issue #4 is what made the fix land on the right line.
- **Iterate, don't restart** — the agent-mode revision in Surface 3.
- **Break big asks into steps** — one issue per session.
- **Review everything** — defect C is exactly the kind of thing a skimming reviewer ships.

### Live A/B (60 seconds — highest ROI in the session)

Vague:
```
fix the schedule bug
```

Specific:
```
In src/schedule.js, matchesDate ANDs dayOfMonth and dayOfWeek. POSIX cron
ORs them when both fields are restricted. Fix it and explain the rule.
```

Run both. The difference sells the entire workshop.

### Responsible and secure use

- Review every suggestion — treat it as a draft from a capable junior engineer.
- Never paste secrets, credentials, customer data, or regulated data into prompts.
- Know your org's content exclusion and duplicate-detection settings.
- Copilot is not a security scanner. Pair it with code scanning, SCA, and human review.
- Keep licensing and compliance obligations in mind for generated code.

---

## 0:52–1:00 · Q&A and next steps

Three things to try on Monday: `/explain` on the scariest file you own, `/tests` on an untested function, agent mode on a README.

Close by asking each person to name one task they'll delegate to Copilot this week. Saying it out loud is what drives adoption.

---

## Resetting between runs

The workshop is designed to be run repeatedly. Everything is restorable.

### Local only

```bash
npm run demo:reset
```

This will:
1. Fetch `origin` and reset `main` to the **`demo-start`** tag (the pristine commit).
2. Delete every local branch except `main`.
3. Remove untracked files — `node_modules` survives, so the next run starts fast.
4. Reinstall dependencies if they're missing.
5. Re-run `demo:verify` and fail loudly if anything is still off.

### Local + GitHub

After a run where the coding agent opened PRs or issues were closed:

```bash
npm run demo:reset:all
```

Additionally: force-pushes pristine `main`, closes open PRs and deletes their branches, deletes stray remote branches, and reopens closed workshop issues. Requires an authenticated `gh` CLI.

Skip the confirmation prompt with `-- --yes`:

```bash
npm run demo:reset -- --yes
```

### Always verify before presenting

```bash
npm run demo:verify
```

Exit code `0` means ready. Exit code `1` means it drifted — the output names exactly which check failed.

> **Why a tag and not `origin/main`:** `demo-start` pins the exact pristine commit. If someone merges a PR to `main` during a workshop, resetting to `origin/main` would silently bake a "fixed" bug into the next session. The tag can't drift.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `curl` to `/health` returns nothing | Server still booting | Wait for the `listening on` line; cold start takes a few seconds |
| `EADDRINUSE` on port 3000 | A server from a previous run | Stop it, or `PORT=3001 npm start` |
| PowerShell POST returns a JSON parse error | `\"` escaping inside single quotes | Use `Invoke-RestMethod -Method Post -ContentType application/json -Body '{"expression":"0 3 1 * MON"}'`, or just use the GET form |
| `npm test` hangs | Importing an entrypoint that calls `listen()` | Already handled — tests import `src/app.js`, never `src/server.js` |
| Pre-flight fails on "working tree is clean" | Uncommitted changes from a previous run | `npm run demo:reset` |
| Attendee sees no ghost text | Not signed in, or extension disabled | Check the Copilot status icon; have them pair up rather than debug live |

### Cross-platform command notes

The GET form works identically everywhere and is the safest thing to put on screen:

```bash
curl -s "http://localhost:3000/explain?expression=0%203%201%20*%20MON"
```

POST on macOS/Linux:
```bash
curl -s -X POST localhost:3000/explain \
  -H 'content-type: application/json' \
  -d '{"expression":"0 3 1 * MON"}'
```

POST on PowerShell:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/explain -Method Post `
  -ContentType application/json `
  -Body '{"expression":"0 3 1 * MON"}'
```

---

## Timing buffers

- **Behind at 0:30?** Cut the VS Code completions step (a). Keep `/fix` and `/tests`.
- **Behind at 0:38?** Show the pre-made coding-agent PR instead of starting one live.
- **Never cut Surface 3.** Agent mode is what people remember and repeat to colleagues.
- **Room check at 0:20.** Anyone whose Copilot isn't working pairs up. Do not debug an individual's setup in front of the room.
