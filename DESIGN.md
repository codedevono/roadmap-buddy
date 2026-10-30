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

## Plan ahead
- v0.5: phone reminders (Telegram bot or web push), morning plan and evening check-in.
- Next: import the remaining Notion roadmaps (Python, DSA, AI, cyber, GSoC, calisthenics, AR optics and tracking, brand design), Notion sync, auto-append to DEVLOG on GitHub, weekly review.
- Later: focus mode with app blocking on Android, home-screen widget.
