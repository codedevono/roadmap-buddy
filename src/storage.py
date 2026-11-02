"""Storage engine for Roadmap Buddy's Personal Project Hub.
Uses SQLite (vault/buddy.db) for ultra-fast queries and mirrors human-readable
Obsidian Markdown (vault/projects/<slug>.md) and append-only commit logs.
"""

import os
import re
import json
import sqlite3
import time
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from .models import Project, TimelineEntry, WorkSession, MediaAttachment, slugify, generate_id

BASE_DIR = Path(__file__).resolve().parent.parent
VAULT_DIR = BASE_DIR / "vault"
DB_PATH = VAULT_DIR / "buddy.db"
MEDIA_DIR = VAULT_DIR / "media"
PROJECTS_DIR = VAULT_DIR / "projects"
TIMELINE_DIR = VAULT_DIR / "timeline"
SESSIONS_DIR = VAULT_DIR / "sessions"


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_storage():
    """Ensure vault directories and SQLite tables exist."""
    VAULT_DIR.mkdir(exist_ok=True)
    MEDIA_DIR.mkdir(exist_ok=True)
    PROJECTS_DIR.mkdir(exist_ok=True)
    TIMELINE_DIR.mkdir(exist_ok=True)
    SESSIONS_DIR.mkdir(exist_ok=True)

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Projects Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'software',
            start_date TEXT,
            status TEXT DEFAULT 'active',
            tags TEXT DEFAULT '[]',
            cover_image TEXT,
            notes TEXT DEFAULT '',
            deleted INTEGER DEFAULT 0,
            created_at INTEGER,
            updated_at INTEGER
        )
        """)

        # Timeline Entries (Commit History)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS timeline (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            session_id TEXT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            resolved INTEGER DEFAULT 0,
            resolution_notes TEXT DEFAULT '',
            media TEXT DEFAULT '[]',
            timestamp INTEGER NOT NULL,
            deleted INTEGER DEFAULT 0,
            created_at INTEGER,
            updated_at INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
        """)

        # Work Sessions Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            summary TEXT DEFAULT '',
            created_at INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
        """)

        # Media Attachments Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            entry_id TEXT,
            filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            url TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at INTEGER
        )
        """)

        # Indices for speed
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_timeline_proj ON timeline(project_id, timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_timeline_ts ON timeline(timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_proj ON sessions(project_id, start_time DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions(start_time DESC)")

        conn.commit()

    # Initial migration from legacy data if database is brand new
    migrate_legacy_data()


def migrate_legacy_data():
    """Migrate legacy projects from public/data/projects.json if empty."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM projects")
        if cursor.fetchone()[0] > 0:
            return  # Already has projects

    leg_file = BASE_DIR / "public" / "data" / "projects.json"
    if not leg_file.exists():
        return

    try:
        data = json.loads(leg_file.read_text(encoding="utf-8"))
        today = datetime.date.today().isoformat()
        for p in data.get("projects", []):
            proj = Project(
                id=p.get("id") or slugify(p.get("name", "Project")),
                name=p.get("name", "Untitled Project"),
                description=p.get("note") or f"Personal project: {p.get('name')}",
                category="hardware" if "glasses" in p.get("name", "").lower() else "software",
                start_date=today,
                status=p.get("status", "active"),
                tags=["v1", "active"],
                notes=p.get("note", "")
            )
            save_project(proj.to_dict())

            # Seed an initial commit
            initial_entry = TimelineEntry(
                project_id=proj.id,
                type="progress",
                title=f"Initialized {proj.name}",
                body="Migrated project into the living timeline repository."
            )
            save_timeline_entry(initial_entry.to_dict())
    except Exception as e:
        print("Note: Migration skipped or failed:", e)


# ----------------- Project Operations -----------------

def get_projects(include_deleted: bool = False, category: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM projects WHERE 1=1"
        params = []
        if not include_deleted:
            query += " AND deleted = 0"
        if category:
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY updated_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

        projects = []
        for r in rows:
            p = dict(r)
            p["tags"] = json.loads(p.get("tags") or "[]")
            p["deleted"] = bool(p["deleted"])
            
            # Count recent stats
            cursor.execute("SELECT COUNT(*) FROM timeline WHERE project_id = ? AND deleted = 0", (p["id"],))
            p["commits_count"] = cursor.fetchone()[0]
            cursor.execute("SELECT COALESCE(SUM(duration_minutes), 0) FROM sessions WHERE project_id = ?", (p["id"],))
            p["total_minutes"] = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM timeline WHERE project_id = ? AND type = 'blocker' AND resolved = 0 AND deleted = 0", (p["id"],))
            p["open_blockers"] = cursor.fetchone()[0]
            
            projects.append(p)
        return projects


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        if not row:
            return None
        p = dict(row)
        p["tags"] = json.loads(p.get("tags") or "[]")
        p["deleted"] = bool(p["deleted"])
        
        cursor.execute("SELECT COUNT(*) FROM timeline WHERE project_id = ? AND deleted = 0", (p["id"],))
        p["commits_count"] = cursor.fetchone()[0]
        cursor.execute("SELECT COALESCE(SUM(duration_minutes), 0) FROM sessions WHERE project_id = ?", (p["id"],))
        p["total_minutes"] = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM timeline WHERE project_id = ? AND type = 'blocker' AND resolved = 0 AND deleted = 0", (p["id"],))
        p["open_blockers"] = cursor.fetchone()[0]
        return p


def save_project(data: Dict[str, Any]) -> Dict[str, Any]:
    name = data.get("name", "Untitled Project").strip()
    proj_id = data.get("id") or slugify(name)
    now = int(time.time() * 1000)

    tags = data.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT created_at FROM projects WHERE id = ?", (proj_id,))
        existing = cursor.fetchone()
        created_at = existing[0] if existing else now

        cursor.execute("""
        INSERT OR REPLACE INTO projects (
            id, name, description, category, start_date, status, tags, cover_image, notes, deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            proj_id,
            name,
            data.get("description", ""),
            data.get("category", "software"),
            data.get("start_date") or datetime.date.today().isoformat(),
            data.get("status", "active"),
            json.dumps(tags),
            data.get("cover_image"),
            data.get("notes", ""),
            1 if data.get("deleted") else 0,
            created_at,
            now
        ))
        conn.commit()

    # Mirror to Obsidian note in vault/projects/<slug>.md
    write_obsidian_project_note(proj_id, data, now)
    return get_project(proj_id)


def write_obsidian_project_note(proj_id: str, data: Dict[str, Any], now_ts: int):
    """Write an Obsidian-native markdown file with YAML frontmatter."""
    md_path = PROJECTS_DIR / f"{proj_id}.md"
    tags_list = data.get("tags") or []
    if isinstance(tags_list, str):
        tags_list = [t.strip() for t in tags_list.split(",") if t.strip()]

    frontmatter = [
        "---",
        f"id: {proj_id}",
        f"name: {json.dumps(data.get('name', 'Untitled'))}",
        f"category: {data.get('category', 'software')}",
        f"status: {data.get('status', 'active')}",
        f"start_date: {data.get('start_date', datetime.date.today().isoformat())}",
        f"tags: {json.dumps(tags_list)}",
        f"updated_at: {now_ts}",
        "---\n"
    ]
    body = [
        f"# {data.get('name')}",
        "",
        data.get("description", ""),
        "",
        "## Notes & Requirements",
        "",
        data.get("notes", "") or "*No notes recorded yet.*"
    ]
    md_path.write_text("\n".join(frontmatter) + "\n".join(body), encoding="utf-8")


def delete_project(project_id: str, hard: bool = False) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        if hard:
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            cursor.execute("DELETE FROM timeline WHERE project_id = ?", (project_id,))
            cursor.execute("DELETE FROM sessions WHERE project_id = ?", (project_id,))
            # Delete markdown note
            md_file = PROJECTS_DIR / f"{project_id}.md"
            if md_file.exists():
                md_file.unlink()
        else:
            now = int(time.time() * 1000)
            cursor.execute("UPDATE projects SET deleted = 1, updated_at = ? WHERE id = ?", (now, project_id))
            cursor.execute("UPDATE timeline SET deleted = 1, updated_at = ? WHERE project_id = ?", (now, project_id))
        conn.commit()
    return True


def restore_project(project_id: str) -> bool:
    now = int(time.time() * 1000)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE projects SET deleted = 0, updated_at = ? WHERE id = ?", (now, project_id))
        cursor.execute("UPDATE timeline SET deleted = 0, updated_at = ? WHERE project_id = ?", (now, project_id))
        conn.commit()
    return True


# ----------------- Timeline / Commit Log Operations -----------------

def get_timeline(project_id: Optional[str] = None, entry_type: Optional[str] = None, limit: int = 100, offset: int = 0, include_deleted: bool = False) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
        SELECT t.*, p.name as project_name, p.category as project_category
        FROM timeline t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE 1=1
        """
        params = []
        if not include_deleted:
            query += " AND t.deleted = 0"
        if project_id:
            query += " AND t.project_id = ?"
            params.append(project_id)
        if entry_type:
            query += " AND t.type = ?"
            params.append(entry_type)

        query += " ORDER BY t.timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        entries = []
        for r in rows:
            item = dict(r)
            item["media"] = json.loads(item.get("media") or "[]")
            item["resolved"] = bool(item["resolved"])
            item["deleted"] = bool(item["deleted"])
            entries.append(item)
        return entries


def get_timeline_entry(entry_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM timeline WHERE id = ?", (entry_id,))
        row = cursor.fetchone()
        if not row:
            return None
        item = dict(row)
        item["media"] = json.loads(item.get("media") or "[]")
        item["resolved"] = bool(item["resolved"])
        item["deleted"] = bool(item["deleted"])
        return item


def save_timeline_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = data.get("id") or generate_id()
    project_id = data.get("project_id", "default")
    now = int(time.time() * 1000)
    ts = int(data.get("timestamp") or now)

    media = data.get("media", [])
    if isinstance(media, str):
        try:
            media = json.loads(media)
        except Exception:
            media = []

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT created_at FROM timeline WHERE id = ?", (entry_id,))
        existing = cursor.fetchone()
        created_at = existing[0] if existing else now

        cursor.execute("""
        INSERT OR REPLACE INTO timeline (
            id, project_id, session_id, type, title, body, resolved, resolution_notes, media, timestamp, deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            entry_id,
            project_id,
            data.get("session_id"),
            data.get("type", "progress"),
            data.get("title", "Update"),
            data.get("body", ""),
            1 if data.get("resolved") else 0,
            data.get("resolution_notes", ""),
            json.dumps(media),
            ts,
            1 if data.get("deleted") else 0,
            created_at,
            now
        ))

        # Update project's updated_at
        cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        conn.commit()

    # Append to human-readable JSONL log in vault/timeline/<slug>.jsonl
    append_timeline_jsonl(project_id, {
        "id": entry_id,
        "type": data.get("type", "progress"),
        "title": data.get("title", "Update"),
        "body": data.get("body", ""),
        "timestamp": ts,
        "media": media
    })

    return get_timeline_entry(entry_id)


def append_timeline_jsonl(project_id: str, entry: Dict[str, Any]):
    log_path = TIMELINE_DIR / f"{project_id}.jsonl"
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def resolve_blocker(entry_id: str, resolution_notes: str) -> Optional[Dict[str, Any]]:
    now = int(time.time() * 1000)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE timeline
        SET resolved = 1, resolution_notes = ?, updated_at = ?
        WHERE id = ?
        """, (resolution_notes, now, entry_id))
        conn.commit()
    return get_timeline_entry(entry_id)


def delete_timeline_entry(entry_id: str, hard: bool = False) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        if hard:
            cursor.execute("DELETE FROM timeline WHERE id = ?", (entry_id,))
        else:
            now = int(time.time() * 1000)
            cursor.execute("UPDATE timeline SET deleted = 1, updated_at = ? WHERE id = ?", (now, entry_id))
        conn.commit()
    return True


# ----------------- Work Sessions Operations -----------------

def save_work_session(data: Dict[str, Any]) -> Dict[str, Any]:
    session_id = data.get("id") or generate_id()
    project_id = data.get("project_id", "default")
    now = int(time.time() * 1000)
    start_time = int(data.get("start_time") or now)
    end_time = int(data.get("end_time") or now)
    duration_minutes = int(data.get("duration_minutes") or max(1, round((end_time - start_time) / 60000)))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT OR REPLACE INTO sessions (
            id, project_id, start_time, end_time, duration_minutes, summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            project_id,
            start_time,
            end_time,
            duration_minutes,
            data.get("summary", ""),
            now
        ))
        cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        conn.commit()

    # Append to human-readable month file vault/sessions/<year>-<month>.jsonl
    dt = datetime.datetime.fromtimestamp(start_time / 1000, tz=datetime.timezone.utc)
    month_file = SESSIONS_DIR / f"{dt.year:04d}-{dt.month:02d}.jsonl"
    try:
        with open(month_file, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "id": session_id,
                "project_id": project_id,
                "start": start_time,
                "end": end_time,
                "min": duration_minutes,
                "summary": data.get("summary", "")
            }) + "\n")
    except Exception:
        pass

    return {
        "id": session_id,
        "project_id": project_id,
        "start_time": start_time,
        "end_time": end_time,
        "duration_minutes": duration_minutes,
        "summary": data.get("summary", "")
    }


def get_work_sessions(project_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
        SELECT s.*, p.name as project_name
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE 1=1
        """
        params = []
        if project_id:
            query += " AND s.project_id = ?"
            params.append(project_id)
        query += " ORDER BY s.start_time DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(r) for r in cursor.fetchall()]


# ----------------- Calendar Activity Matrix -----------------

def get_calendar_activity(year: int, month: int) -> Dict[str, Any]:
    """Return days worked, session count, minutes, and timeline commits for the month."""
    start_dt = datetime.datetime(year, month, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
    if month == 12:
        end_dt = datetime.datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
    else:
        end_dt = datetime.datetime(year, month + 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)

    start_ts = int(start_dt.timestamp() * 1000)
    end_ts = int(end_dt.timestamp() * 1000)

    days_data = {}

    with get_db() as conn:
        cursor = conn.cursor()

        # Sessions grouped by YYYY-MM-DD
        cursor.execute("""
        SELECT strftime('%Y-%m-%d', datetime(start_time/1000, 'unixepoch')) as day,
               COUNT(*) as sessions_count,
               SUM(duration_minutes) as total_minutes
        FROM sessions
        WHERE start_time >= ? AND start_time < ?
        GROUP BY day
        """, (start_ts, end_ts))
        for r in cursor.fetchall():
            day = r["day"]
            days_data[day] = {
                "date": day,
                "sessions_count": r["sessions_count"],
                "total_minutes": r["total_minutes"],
                "commits": [],
                "events": []
            }

        # Commits grouped by YYYY-MM-DD
        cursor.execute("""
        SELECT t.id, t.project_id, t.type, t.title, t.resolved, t.timestamp,
               p.name as project_name,
               strftime('%Y-%m-%d', datetime(t.timestamp/1000, 'unixepoch')) as day
        FROM timeline t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.deleted = 0 AND t.timestamp >= ? AND t.timestamp < ?
        ORDER BY t.timestamp ASC
        """, (start_ts, end_ts))
        for r in cursor.fetchall():
            day = r["day"]
            if day not in days_data:
                days_data[day] = {
                    "date": day,
                    "sessions_count": 0,
                    "total_minutes": 0,
                    "commits": [],
                    "events": []
                }
            if "commits" not in days_data[day]:
                days_data[day]["commits"] = []
            days_data[day]["commits"].append({
                "id": r["id"],
                "project_id": r["project_id"],
                "project_name": r["project_name"] or "Project",
                "type": r["type"],
                "title": r["title"],
                "resolved": bool(r["resolved"]),
                "timestamp": r["timestamp"]
            })

    # 3. Events & Deadlines (Exams, Mock tests, Milestones)
    # Collect paused goals so they do not clutter calendar
    paused_goal_ids = set()
    goals_dir = VAULT_DIR / "goals"
    if goals_dir.exists():
        for gf in goals_dir.glob("*.json"):
            try:
                gdata = json.loads(gf.read_text(encoding="utf-8"))
                if not gdata.get("active", True):
                    paused_goal_ids.add(gdata.get("id"))
            except Exception:
                pass

    prefix = f"{year:04d}-{month:02d}-"
    events_files = [VAULT_DIR / "events" / "events.json", BASE_DIR / "public" / "data" / "events.json"]
    all_events = []
    date_overrides = {}
    for ef in events_files:
        if ef.exists():
            try:
                edata = json.loads(ef.read_text(encoding="utf-8"))
                all_events.extend(edata.get("events", []))
                date_overrides.update(edata.get("dates", {}))
            except Exception:
                pass

    seen_event_ids = set()
    for ev in all_events:
        eid = ev.get("id")
        if not eid or eid in seen_event_ids:
            continue
        if ev.get("goal_id") and ev.get("goal_id") in paused_goal_ids:
            continue
        seen_event_ids.add(eid)

        # Check date override
        edate = ev.get("date", "")
        if eid in date_overrides:
            ov = date_overrides[eid]
            edate = ov.get("date", edate) if isinstance(ov, dict) else ov

        if edate and edate.startswith(prefix):
            day = edate[:10]
            if day not in days_data:
                days_data[day] = {
                    "date": day,
                    "sessions_count": 0,
                    "total_minutes": 0,
                    "commits": [],
                    "events": []
                }
            if "events" not in days_data[day]:
                days_data[day]["events"] = []
            days_data[day]["events"].append({
                "id": eid,
                "name": ev.get("name", "Event"),
                "type": ev.get("type", "milestone"),
                "weight": ev.get("weight", 5),
                "goal_id": ev.get("goal_id", ""),
                "note": ev.get("note", "")
            })

    # 4. Also check Goals target dates and topic due dates in this month
    if goals_dir.exists():
        for gf in goals_dir.glob("*.json"):
            try:
                gdata = json.loads(gf.read_text(encoding="utf-8"))
                if gdata.get("id") in paused_goal_ids or not gdata.get("active", True):
                    continue
                gtgt = gdata.get("target_date", "")
                if gtgt and gtgt.startswith(prefix):
                    day = gtgt[:10]
                    if day not in days_data:
                        days_data[day] = {
                            "date": day,
                            "sessions_count": 0,
                            "total_minutes": 0,
                            "commits": [],
                            "events": []
                        }
                    if "events" not in days_data[day]:
                        days_data[day]["events"] = []
                    if not any(e["id"] == f"goal-{gdata['id']}-main" for e in days_data[day]["events"]):
                        days_data[day]["events"].append({
                            "id": f"goal-{gdata['id']}-main",
                            "name": f"🎯 {gdata.get('name', 'Goal')}",
                            "type": gdata.get("type", "exam"),
                            "weight": 10 if gdata.get("priority") == "urgent" else 8,
                            "goal_id": gdata.get("id"),
                            "note": gdata.get("note", "")
                        })

                for node in gdata.get("syllabus", []):
                    ndue = node.get("due") or node.get("target_date") or ""
                    if ndue and ndue.startswith(prefix):
                        day = ndue[:10]
                        if day not in days_data:
                            days_data[day] = {
                                "date": day,
                                "sessions_count": 0,
                                "total_minutes": 0,
                                "commits": [],
                                "events": []
                            }
                        if "events" not in days_data[day]:
                            days_data[day]["events"] = []
                        days_data[day]["events"].append({
                            "id": node.get("id"),
                            "name": node.get("t") or node.get("title") or "Study Topic",
                            "type": "topic",
                            "weight": 4,
                            "goal_id": gdata.get("id"),
                            "min": node.get("min", 25)
                        })
            except Exception:
                pass

    return {
        "year": year,
        "month": month,
        "days": days_data
    }


# ----------------- Media Management & Orphan Cleanup -----------------

def save_media_file(project_id: str, filename: str, file_bytes: bytes, mime_type: str = "image/jpeg", entry_id: Optional[str] = None) -> Dict[str, Any]:
    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
    file_id = generate_id()
    disk_name = f"{file_id}_{safe_name}"

    proj_media_dir = MEDIA_DIR / project_id
    proj_media_dir.mkdir(exist_ok=True, parents=True)
    stored_path = proj_media_dir / disk_name
    stored_path.write_bytes(file_bytes)

    rel_url = f"/media/{project_id}/{disk_name}"
    now = int(time.time() * 1000)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO media (id, project_id, entry_id, filename, stored_path, url, mime_type, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            file_id,
            project_id,
            entry_id,
            filename,
            str(stored_path),
            rel_url,
            mime_type,
            len(file_bytes),
            now
        ))
        conn.commit()

    return {
        "id": file_id,
        "project_id": project_id,
        "filename": filename,
        "url": rel_url,
        "mime_type": mime_type,
        "size_bytes": len(file_bytes)
    }


def cleanup_orphaned_media():
    """Remove media files from disk that are no longer referenced in timeline entries or projects."""
    if not MEDIA_DIR.exists():
        return {"removed_count": 0}

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT url FROM media")
        db_urls = set(r[0] for r in cursor.fetchall())

        cursor.execute("SELECT cover_image FROM projects WHERE cover_image IS NOT NULL")
        cover_urls = set(r[0] for r in cursor.fetchall())

    all_referenced = db_urls.union(cover_urls)
    removed = 0

    for p_dir in MEDIA_DIR.iterdir():
        if p_dir.is_dir():
            for f in p_dir.iterdir():
                rel_url = f"/media/{p_dir.name}/{f.name}"
                if rel_url not in all_referenced:
                    try:
                        f.unlink()
                        removed += 1
                    except Exception:
                        pass
            # Remove empty project dir
            try:
                if not any(p_dir.iterdir()):
                    p_dir.rmdir()
            except Exception:
                pass

    return {"removed_count": removed}


# Auto-initialize storage on module load
init_storage()
