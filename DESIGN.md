# Design

## Principles
- One task on screen. No lists to scan.
- Start small: every task has a tiny first step.
- Forgive misses: weekly targets, no red overdue state.
- Projects first: tasks should produce something I can show.

## The model (v1)
- **Skill ladders**: topics with prerequisites, imported from my Notion roadmaps. Finishing a topic unlocks what depends on it.
- **Projects**: an ordered list of the skills a project needs, plus a priority (1 to 3). Several can be active.
- **Events**: competitions with a date and the skills or ladders that prepare for them.

## How the next task is picked
Each ready topic (all prerequisites done) gets a score from three pressures:
1. **Project pull**: `priority^2 * max(10 - position, 2)` for a skill a project needs. A prerequisite of a needed skill gets 90% of that, so learning is pulled just in time.
2. **Event pressure**: `weight * 300 / daysLeft` for prep topics of events with a date (ignored beyond 180 days).
3. **Ladder floor**: `(floor - doneThisWeek) / floor * 6 + min(idleDays, 7) * 0.4`, applied to each ladder's first open topic so no ladder starves.
The highest score wins, and the two strongest reasons become the "Why now" line.

## Buttons
- **Session done**: logs a session; the topic stays open.
- **Topic finished**: marks it done and re-plans.
- **Later**: hides the topic for 24 hours.
- **Too hard**: shows the tiny step; finishing it logs a session.

## Data
All state is in the browser (`localStorage`). `skills.json`, `projects.json` and `events.json` are the source of the plan.

## The Path view (gamified whole picture)
- `path.json` groups topics into three phases (Foundation, Competitive depth, Cross-domain mastery) and tags each quest with one of four tracks (systems, graphics, security, AI systems). No years: you move on when the quests are done.
- A quest is an ordinary topic from `skills.json`, so finishing it anywhere counts everywhere. Nothing is stored twice.
- Milestones (a CTF, a first merged fix, a certificate) are claimed by hand and give XP. Each phase has one boss that unlocks at 60% of that phase's quests. Only bosses are locked, so nothing else can frustrate.
- XP, levels and badges stay derived from state (`done`, the session log and claimed milestones), so a slow week never erases anything.

## Plan ahead
- v0.5: phone reminders (Telegram bot or web push), morning plan and evening check-in.
- Next: import the remaining Notion roadmaps (AR optics and tracking, brand and graphic design, the GSoC 2028 C/C++ track), Notion sync, auto-append to DEVLOG on GitHub, weekly review.
- Later: focus mode with app blocking on Android, home-screen widget.

## v2 phase P1: projects inside the app
- `S.projects` (in localStorage) holds projects made in the app; `projects.json` projects stay read-only and can be focused.
- Each task of a project becomes a pseudo topic `pt:<projectId>:<taskId>` so Today, logging and XP work unchanged.
- Score for the first open task of a project: `priority^2 * 12 * focusFactor + max(0, 20 - daysLeft) * 0.5 * focusFactor`; focusFactor is 1 for the focus project and 0.25 for the rest. Skill pulls from `projects.json` use the same factor.
- Deadline maths, capacity from the log and the on-track message come in phase P2.

## Planner contract (main screen)
`plan(fromDate, days) -> [{date:'YYYY-MM-DD', taskId:string|null, why:string, light:boolean}]`. Planners live in `Planners` and the choice is stored as `S.planner` (default `rules`). The screen renders what comes back. A result is checked first: the date must match, the task must exist, not be done, and have its prerequisites done or planned on an earlier day; otherwise that day comes from the rules planner. A planner that throws is replaced by the rules planner. The rules planner runs pick() once per day on a scratch copy of the progress and never changes saved data. A day with an event that has a time is light: only tasks of 30 minutes or less. An API key must never be in the page; an API planner needs a small server in between.

