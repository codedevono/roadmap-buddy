# Roadmap Buddy

A personal productivity buddy for people with low consistency and a distractible mind.
One roadmap (cyber, AI, Python, GSoC, calisthenics, and more) on your phone, and one question answered: **what do I do right now?**

Status: v0 prototype. Built in public.

## What v0 does
- Shows exactly one task at a time, picked from the track that is furthest behind its weekly target.
- Every task has a tiny first step and a timer (5 minutes in tiny mode).
- Buttons: **Done**, **Later** (hides the task for a day), **Too hard** (drops to the tiny step; finishing it still counts as a session).
- Weekly dots per track instead of daily streaks, so a missed day does not break anything.
- **Copy dev log** gives markdown lines you can paste into a devlog (learn in public).
- Works offline once opened, installs to the home screen. Data stays on your device.

## Run it
1. Put these files in a public GitHub repo.
2. Repo Settings > Pages > Deploy from a branch > `main` / root.
3. Open the Pages URL on your phone in Chrome, then menu > Add to Home screen.

Locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Make it yours
Edit `roadmap.json`. Each track has a `perWeek` target and an ordered list of tasks with a `title`, a `tiny` first step and `min` minutes.

## Docs
- [NEED.md](NEED.md): the problem and who it is for
- [DESIGN.md](DESIGN.md): how it picks tasks and the plan ahead
- [DEVLOG.md](DEVLOG.md): what was built and learned, in order
