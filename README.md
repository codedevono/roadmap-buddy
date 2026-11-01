# Roadmap Buddy vault: format spec (schema_version 1)

One folder of plain text files. Humans (Obsidian), the app, and an AI all read and write the same files.
Nothing here needs a database. Standard library tools only: see `vault.py`.

## Layers (who may change what)

| Layer | Files | Who writes |
| --- | --- | --- |
| Facts you own | `projects/`, `events/`, `settings.json`, `ladders/` | You or the app. An AI only writes a proposal (see Proposals). |
| History | `log/YYYY-MM.jsonl`, `progress.json` | The app, append-only (progress keeps undo as `on:false`). |
| Derived | `context.md` (reserved, generated later) | Regenerated freely. Never the source of truth. |

Device-only state is NOT in the vault: `hideStrip`, `planner`, `tm` (timer), `pin`, `later`, `buddy.v2.seen`.
Derived values are NOT stored: badges, level, `last` (recomputed from the log).

## Layout

```
buddy-vault/
  vault.json             {"schema_version": 1}
  README.md              this spec (optional copy)
  settings.json          shared settings
  progress.json          done topics/tasks and claimed Path milestones
  projects/<slug>.md     one file per project (front matter + free notes)
  events/events.json     events and per-event date overrides
  log/2026-11.jsonl      one session per line, one file per UTC month
  ladders/<id>.json      imported roadmaps (one ladder object per file)
  proposals/             AI suggestions waiting for your OK (reserved)
  context.md             generated summary for a small model (reserved)
```

## Conventions

- All text is UTF-8, LF line ends, files end with a newline.
- Dates are `YYYY-MM-DD`. Times are `HH:MM` (24 h). Timestamps (`ts`, `updated`, `at`) are integer milliseconds since the Unix epoch.
- `updated` is set by the writer on every change of a fact. Merge uses it.
- Never store passwords, API keys or tokens in any file. The validator rejects common secret patterns.

## projects/\<slug\>.md

Filename: lowercase `a-z`, `0-9`, single hyphens, `.md`. The `id` inside the file is the identity; the slug is only a name.

Front matter: every line is `key: <JSON value>`. JSON values are valid YAML, so Obsidian reads them, and parsing stays trivial and safe.
After the closing `---` comes free text (notes). The app does not parse the body.

| Key | Type | Notes |
| --- | --- | --- |
| `id` | string | required, unique, `[A-Za-z0-9_.:-]+` |
| `origin` | `"own"` or `"builtin"` | builtin = seeded once from the repo `projects.json`; after that the vault copy wins |
| `name` | string | required |
| `state` | `idea` `planned` `active` `paused` `blocked` `done` | required. Only `active` reaches the planner |
| `priority` | 1, 2 or 3 | required |
| `type` | string or null | web, hardware, game, security, research, other |
| `goal` | string | one line |
| `done_looks_like` | string | the proof you promised |
| `deadline` | date or null | |
| `needs` | list of topic ids | |
| `ladders` | list of ladder ids | whole ladders the project needs |
| `tasks` | list of `{id, t, min?}` | tasks of an own project |
| `milestones` | list of `{id, t, date, done}` | `date` is a date or `""` |
| `blocked_by` | string | what it waits on |
| `next` | string | the "Where was I" line |
| `proof_url` | string | `http(s)://` link |
| `learned` | string | one line |
| `done_at` | ms or null | |
| `updated` | ms | required |

Rule: `state: "done"` needs `proof_url` and a non-empty `learned` (same rule as the app).

## events/events.json

```
{"schema_version": 1,
 "events": [{"id","name","type","date","end","time","etime","note","updated"}],
 "dates": {"<eventId>": {"date": "YYYY-MM-DD", "updated": 0}}}
```

- `events` holds your own events. A deleted event stays as a tombstone `{"id","deleted":true,"updated":ms}` so a merge does not bring it back.
- `dates` holds your chosen date for an event that comes from the repo (`events.json` / feeds).
- `end` and `time`/`etime` may be `""`.

## log/YYYY-MM.jsonl

One JSON object per line, append-only. The month is the UTC month of `ts`.

```
{"uid":"1767000000000-c1","id":"c1","lad":"c","title":"Pointers","ts":1767000000000,"k":"session","device":"phone"}
```

- `id` is the TOPIC id (as in the app today). `uid` is the unique line id (new). `device` is `phone` or `laptop`.
- `k` is `session`, `tiny` or `topic`. Do not invent other kinds: the app counts any unknown kind as a session.
- Old lines get `uid = "<ts>-<id>"` (a `-2`, `-3` suffix if that repeats) and `device = "phone"`.

## progress.json

```
{"schema_version": 1,
 "done": {"<topicOrTaskId>": {"ts": 0, "on": true}},
 "ms":   {"<milestoneId>":   {"ts": 0, "on": true}}}
```

`done` also holds finished project tasks as `pt:<projectId>:<taskId>`. Undo writes `on:false` with a new `ts`.

## settings.json

`{"schema_version":1, "focus": "<projectId>|null", "goal": "<eventId>|null", "floors": false, "updated": 0}` (`floors` optional).

## ladders/\<id\>.json

The ladder object exactly as the app stores it in `S.ladders`: `id`, `name`, `nodes` (each with `id`, `t`, and optional `needs`, `min`, ...). The file name is the ladder id.

## Merge rules (phone + laptop sync)

- `log`: union by `uid`.
- `progress`: per key, the larger `ts` wins (tie: the first vault).
- `projects`, `events`, `dates`: the larger `updated` wins (tie: the first vault).
- `settings.json`: the file with the larger `updated` wins.
- `ladders`: union by `id`; on a conflict the first vault wins and a warning is printed.

## Proposals (reserved)

An AI never edits facts directly. It writes `proposals/<ts>-<action>.json` such as
`{"action":"move_deadline","args":{"project":"ielts","deadline":"2027-03-01"},"why":"...","created":0}`.
The app shows it; your OK applies it through the same checked function.

## Tools

```
python3 -I vault.py validate DIR
python3 -I vault.py import-backup BACKUP.json OUTDIR [--projects-json projects.json] [--device phone]
python3 -I vault.py export-backup DIR OUT.json
python3 -I vault.py merge A B OUT
```

`export-backup` writes a Backup that the app's Restore can read (a v1-shaped file with the full set of keys).
