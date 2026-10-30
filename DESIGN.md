# Design

## Principles
- One task on screen. No lists to scan.
- Start small: every task has a tiny first step.
- Forgive misses: weekly targets, no red overdue state.
- Projects first: tasks should produce something I can show.

## How the next task is picked (v0)
For each track, take its first task that is not done and not snoozed.
Score = `(perWeek - doneThisWeek) / perWeek * 10 + min(daysSinceLastSession, 7) * 0.5`.
The highest score wins, so a neglected track floats up.

## Buttons
- **Done**: logs a session, completes the task.
- **Later**: hides the task for 24 hours.
- **Too hard**: shows the tiny step; finishing it logs a session but keeps the task open.

## Data
All state is in the browser (`localStorage`). `roadmap.json` is the source of the plan.

## Plan ahead
- v0.5: phone reminders (Telegram bot or web push), morning plan and evening check-in.
- v1: Notion sync for the roadmap, auto-append to DEVLOG on GitHub, weekly review.
- Later: focus mode with app blocking on Android, home-screen widget.
