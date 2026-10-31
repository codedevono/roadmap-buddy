# Roadmap Buddy

A personal productivity buddy for people with low consistency and a distractible mind.
Your projects, competitions and learning roadmaps become one plan, and the app answers one question: **what do I do right now, and why?**

Status: v1 prototype with XP, levels, badges and a Path view. Built in public.

## How it works
- **Skills** (`skills.json`): your roadmaps as ladders of topics with prerequisites (math, 3D math, physics, electronics, embedded, design and CAD, C and C++, and more).
- **Projects** (`projects.json`): each project lists the skills it needs, in the order it needs them, with a priority from 1 to 3. You can run several at once.
- **Path** (`path.json`): the whole low-level design roadmap as three phases with no years: quests (topics from the ladders), four tracks that feed one core, XP milestones and a locked boss per phase. Progress is shared with the Topics tab.
- **Events** (`events.json`): GSoC, CTFs and contests with a date. As the date nears, their prep rises in the plan.
- **Planner**: adds three pressures per task: what active projects need next (including prerequisites), event deadlines, and a weekly floor per ladder so nothing starves. The top task is shown with a "Why now" line.

## Buttons
- **Session done**: logs a work session; the topic stays open.
- **Topic finished**: marks the topic done, which unlocks what depends on it and re-plans.
- **Later**: hides the topic for a day.
- **Too hard**: drops to a 5-minute tiny step; finishing it still counts as a session.

Weekly dots per ladder replace daily streaks, so a missed day breaks nothing. **Copy dev log** gives markdown lines for learn in public. Data stays on your device.

## Run it
1. Put these files in a public GitHub repo.
2. Repo Settings > Pages > Deploy from a branch > `main` / root.
3. Open the Pages URL on your phone in Chrome, then menu > Add to Home screen.

Locally: `python3 -m http.server`, then open http://localhost:8000.

## Make it yours
- Ladders come from the real Notion roadmaps and the 6-year low-level design roadmap (15 ladders, 118 topics). A ladder marked `"sample": true` would be a placeholder; none are left. Add `"tiny"` to a topic for its smallest first step.
- Set `date` (YYYY-MM-DD) on an event to turn on its urgency.
- Change a project's `status` to `"paused"` to take it out of the plan.

## Docs
- [NEED.md](NEED.md): the problem and who it is for
- [DESIGN.md](DESIGN.md): how the planner decides
- [DEVLOG.md](DEVLOG.md): what was built and learned, in order

## Projects (v2, phase P1)
- The **Projects** tab lets you add a project inside the app: name, one-line goal, what done looks like (the proof), deadline, priority, type, tasks and the skills it needs.
- **Focus**: one focus project gets almost all of Today; other projects wait (they keep a quarter of their weight).
- Tasks of your projects appear on Today with a "Why now" line, e.g. "Weather station is your focus project, due in 20 days".
- **Export projects** saves a `buddy-projects.json` file (the backup, since data lives in this browser); **Import projects** restores it.
