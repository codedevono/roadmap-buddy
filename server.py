#!/usr/bin/env python3
"""Roadmap Buddy Live Daemon & Copilot Server.
Serves the web client from public/, provides live vault synchronization,
first-class Goals & Exams engine, reflexive rebalancing, and autonomous git commits.
"""

import os
import sys
import re
import json
import time
import datetime
import base64
import mimetypes
import urllib.request
import urllib.error
import urllib.parse
import subprocess
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

import src.storage as storage

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = PUBLIC_DIR / "data"
VAULT_DIR = BASE_DIR / "vault"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PORT = int(os.environ.get("PORT", 8000))

# Ensure vault and data structure exists
def init_vault():
    VAULT_DIR.mkdir(exist_ok=True)
    (VAULT_DIR / "projects").mkdir(exist_ok=True)
    (VAULT_DIR / "events").mkdir(exist_ok=True)
    (VAULT_DIR / "log").mkdir(exist_ok=True)
    (VAULT_DIR / "ladders").mkdir(exist_ok=True)
    (VAULT_DIR / "goals").mkdir(exist_ok=True)

    v_json = VAULT_DIR / "vault.json"
    if not v_json.exists():
        v_json.write_text(json.dumps({"schema_version": 1}, indent=2), encoding="utf-8")

    prog_json = VAULT_DIR / "progress.json"
    if not prog_json.exists():
        prog_json.write_text(json.dumps({"schema_version": 1, "done": {}, "ms": {}}, indent=2), encoding="utf-8")

    settings_json = VAULT_DIR / "settings.json"
    if not settings_json.exists():
        settings_json.write_text(json.dumps({
            "schema_version": 1,
            "focus": "buddy",
            "goal": "gsoc27",
            "mode": "balanced",
            "updated": int(time.time() * 1000)
        }, indent=2), encoding="utf-8")

    ev_json = VAULT_DIR / "events" / "events.json"
    if not ev_json.exists():
        ev_json.write_text(json.dumps({
            "schema_version": 1,
            "events": [],
            "dates": {}
        }, indent=2), encoding="utf-8")

init_vault()

def check_ollama():
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags", headers={"User-Agent": "RoadmapBuddy/2.0"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name") for m in data.get("models", [])]
            return True, models
    except Exception:
        return False, []

def get_best_model(models):
    if not models:
        return None
    for m in models:
        if "qwen" in m.lower():
            return m
    for m in models:
        if "gemma" in m.lower():
            return m
    return models[0]

def query_ollama(model, messages, timeout=60, temp=0.3):
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temp,
            "num_predict": 800
        }
    }
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res.get("message", {}).get("content", "")

def append_log_entry(entry):
    ts = entry.get("ts", int(time.time() * 1000))
    dt = datetime.datetime.fromtimestamp(ts / 1000, tz=datetime.timezone.utc)
    month_file = VAULT_DIR / "log" / f"{dt.year:04d}-{dt.month:02d}.jsonl"

    uid = f"{ts}-{entry.get('id', 'task')}"
    log_line = {
        "uid": uid,
        "id": entry.get("id"),
        "lad": entry.get("lad", "misc"),
        "title": entry.get("title", "Session"),
        "ts": ts,
        "k": entry.get("k", "session"),
        "device": entry.get("device", "laptop")
    }

    with open(month_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_line) + "\n")

    prog_path = VAULT_DIR / "progress.json"
    prog = json.loads(prog_path.read_text(encoding="utf-8")) if prog_path.exists() else {"schema_version": 1, "done": {}, "ms": {}}
    if entry.get("k") == "topic":
        prog["done"][entry["id"]] = {"ts": ts, "on": True}
    prog_path.write_text(json.dumps(prog, indent=2), encoding="utf-8")
    return log_line

def get_recent_activity(days=7):
    now_ts = int(time.time() * 1000)
    cutoff = now_ts - (days * 86400 * 1000)
    sessions = []
    log_dir = VAULT_DIR / "log"
    if log_dir.exists():
        for lf in sorted(log_dir.glob("*.jsonl")):
            for line in lf.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("ts", 0) >= cutoff:
                        sessions.append(entry)
                except Exception:
                    pass

    total_mins = sum(s.get("min", 25) for s in sessions)
    topics_done = sum(1 for s in sessions if s.get("k") == "topic")
    return {
        "count": len(sessions),
        "total_minutes": total_mins,
        "avg_minutes_per_day": round(total_mins / max(1, days), 1),
        "topics_done": topics_done,
        "sessions": sessions[-10:]
    }

# ----------------- Goals Engine (Exams & Fixed Targets) -----------------
def get_all_goals():
    goals = []
    goals_dir = VAULT_DIR / "goals"
    if goals_dir.exists():
        for gf in sorted(goals_dir.glob("*.json")):
            try:
                goals.append(json.loads(gf.read_text(encoding="utf-8")))
            except Exception:
                pass
    if not goals and (DATA_DIR / "goals.json").exists():
        try:
            goals = json.loads((DATA_DIR / "goals.json").read_text(encoding="utf-8")).get("goals", [])
        except Exception:
            pass
    return goals

def parse_goal_input(raw_input):
    if isinstance(raw_input, str):
        clean = raw_input.strip()
        if "```" in clean:
            clean = re.sub(r'^```[a-z]*\s*', '', clean, flags=re.I)
            clean = re.sub(r'\s*```$', '', clean)
        try:
            raw_input = json.loads(clean)
        except Exception:
            start = clean.find("{")
            end = clean.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    raw_input = json.loads(clean[start:end])
                except Exception:
                    pass

    # If it's a dict now, check its structure
    if isinstance(raw_input, dict):
        # Case 1: Bundle with "ladders" (like ausbildung-roadmap.json)
        if "ladders" in raw_input and isinstance(raw_input["ladders"], list) and raw_input["ladders"]:
            l0 = raw_input["ladders"][0]
            name = l0.get("name") or "Roadmap Goal"
            goal_id = l0.get("id") or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            target_date = l0.get("target") or l0.get("target_date") or ""
            
            # Events in bundle
            events = raw_input.get("events") or []
            # If no target_date on ladder, see if an exam event has a date
            if not target_date and events:
                for ev in events:
                    if ev.get("type") in ("exam", "test") and ev.get("date"):
                        target_date = ev["date"]
                        break
            
            return {
                "id": goal_id,
                "name": name,
                "target_date": target_date,
                "type": "exam" if any(e.get("type") == "exam" for e in events) else "target",
                "priority": "urgent",
                "ladder": l0,
                "ladders": raw_input["ladders"],
                "events": events,
                "syllabus": l0.get("nodes", []),
                "links": l0.get("links", []),
                "note": l0.get("note", "")
            }

        # Case 2: Single ladder object (has "id", "nodes")
        if "nodes" in raw_input and isinstance(raw_input["nodes"], list):
            name = raw_input.get("name") or raw_input.get("id") or "Ladder Goal"
            goal_id = raw_input.get("id") or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            target_date = raw_input.get("target") or raw_input.get("target_date") or ""
            return {
                "id": goal_id,
                "name": name,
                "target_date": target_date,
                "type": "target",
                "priority": "urgent",
                "ladder": raw_input,
                "ladders": [raw_input],
                "events": raw_input.get("events", []),
                "syllabus": raw_input["nodes"],
                "links": raw_input.get("links", []),
                "note": raw_input.get("note", "")
            }

        # Case 3: Standard Goal / Exam object (has "goal" or "syllabus")
        name = raw_input.get("goal") or raw_input.get("name") or "New Goal"
        goal_id = raw_input.get("id") or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        target_date = raw_input.get("target_date") or raw_input.get("date") or ""
        syllabus = raw_input.get("syllabus") or raw_input.get("topics") or []
        mock_tests = raw_input.get("mock_tests") or raw_input.get("mocks") or []
        return {
            "id": goal_id,
            "name": name,
            "target_date": target_date,
            "type": raw_input.get("type", "exam"),
            "priority": raw_input.get("priority", "urgent"),
            "syllabus": syllabus,
            "mock_tests": mock_tests,
            "note": raw_input.get("note", "")
        }

    # If it's a string, try Ollama to parse into structured JSON
    if isinstance(raw_input, str):
        ollama_ok, models = check_ollama()
        if ollama_ok and models:
            model = get_best_model(models)
            prompt = f"""Convert this study plan / exam syllabus into structured JSON:
{raw_input}

Return a valid JSON object matching this schema:
{{
  "name": "Exam or Goal Name",
  "target_date": "YYYY-MM-DD",
  "type": "exam",
  "priority": "urgent",
  "syllabus": [
    {{"title": "Topic Title", "target_date": "YYYY-MM-DD", "min": 30, "resources": [{{"title": "Resource Name", "url": "https://..."}}]}}
  ],
  "mock_tests": [
    {{"title": "Mock 1", "date": "YYYY-MM-DD"}}
  ]
}}
Return JSON only."""
            try:
                txt = query_ollama(model, [{"role": "system", "content": "You convert study text into structured roadmap JSON. Output JSON only."}, {"role": "user", "content": prompt}], timeout=45)
                start = txt.find("{")
                end = txt.rfind("}") + 1
                if start >= 0 and end > start:
                    parsed = json.loads(txt[start:end])
                    return parse_goal_input(parsed)
            except Exception:
                pass

    return None

def save_goal(raw_goal):
    parsed = parse_goal_input(raw_goal)
    if not parsed:
        raise ValueError("Could not parse goal input into valid structure")

    goal_id = parsed["id"]
    name = parsed["name"]
    target_date = parsed.get("target_date", "")
    goal_type = parsed.get("type", "exam")
    priority = parsed.get("priority", "urgent")
    note = parsed.get("note", "")
    links = parsed.get("links", [])
    
    # 1. Ladder normalization
    if "ladder" in parsed and isinstance(parsed["ladder"], dict):
        ladder = parsed["ladder"]
        ladder["id"] = goal_id
        ladder["name"] = name
        ladder_nodes = ladder.get("nodes", [])
    else:
        # Build ladder from syllabus
        raw_syllabus = parsed.get("syllabus", [])
        ladder_nodes = []
        for i, item in enumerate(raw_syllabus):
            topic_title = item.get("title") or item.get("topic") or item.get("t") or f"Topic {i+1}"
            topic_id = item.get("id") or f"{goal_id}-{i+1}"
            min_duration = int(item.get("min") or (item.get("est_hours", 0.5) * 60) or 30)
            due = item.get("target_date") or item.get("due") or ""
            needs = item.get("needs") or []
            node_links = item.get("resources") or item.get("links") or []

            node = {
                "id": topic_id,
                "t": topic_title,
                "min": min_duration,
                "needs": needs
            }
            if due:
                node["due"] = due
            if node_links:
                node["links"] = node_links
            ladder_nodes.append(node)

        ladder = {
            "id": goal_id,
            "name": name,
            "floor": 2,
            "nodes": ladder_nodes
        }
        if target_date:
            ladder["target"] = target_date
        if note:
            ladder["note"] = note
        if links:
            ladder["links"] = links

    prep_ids = [n["id"] for n in ladder_nodes if n.get("id")]
    
    # Save ladder file in vault
    (VAULT_DIR / "ladders" / f"{goal_id}.json").write_text(json.dumps(ladder, indent=2), encoding="utf-8")

    # Update public/data/skills.json
    skills_path = DATA_DIR / "skills.json"
    if skills_path.exists():
        try:
            sk = json.loads(skills_path.read_text(encoding="utf-8"))
            ladders = [l for l in sk.get("ladders", []) if l.get("id") != goal_id]
            ladders.insert(0, ladder)
            sk["ladders"] = ladders
            skills_path.write_text(json.dumps(sk, indent=2), encoding="utf-8")
        except Exception:
            pass

    # 2. Events normalization & insertion
    # Clean up existing events for this goal
    for ev_file in [VAULT_DIR / "events" / "events.json", DATA_DIR / "events.json"]:
        if ev_file.exists():
            try:
                ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
                ev_data["events"] = [e for e in ev_data.get("events", []) if not (
                    e.get("goal_id") == goal_id or str(e.get("id", "")).startswith(f"goal-{goal_id}")
                )]
                ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
            except Exception:
                pass

    events_to_add = []
    
    # If the bundle provided explicit events (e.g. Ausbildung's Goethe B1, Visa, etc.)
    bundle_events = parsed.get("events", [])
    if bundle_events:
        for i, ev in enumerate(bundle_events):
            ev_name = ev.get("name", f"{name} Milestone {i+1}")
            ev_date = ev.get("date", target_date)
            ev_type = ev.get("type", "milestone")
            ev_note = ev.get("note", "")
            events_to_add.append({
                "id": f"goal-{goal_id}-ev-{i+1}",
                "goal_id": goal_id,
                "name": ev_name,
                "type": ev_type,
                "date": ev_date,
                "prep": prep_ids,
                "weight": 10 if ev_type == "exam" else (8 if ev_type == "application" else 6),
                "note": ev_note
            })
    else:
        # Default main exam event
        if target_date:
            events_to_add.append({
                "id": f"goal-{goal_id}-main",
                "goal_id": goal_id,
                "name": f"🎯 {name}",
                "type": goal_type,
                "date": target_date,
                "prep": prep_ids,
                "weight": 10 if priority == "urgent" else 8,
                "note": f"Exam/Target date for {name}."
            })
        # Mock tests
        for mi, mock in enumerate(parsed.get("mock_tests", [])):
            m_name = mock.get("title") or mock.get("name") or f"{name} Mock {mi+1}"
            m_date = mock.get("date") or mock.get("target_date") or ""
            if m_date:
                events_to_add.append({
                    "id": f"goal-{goal_id}-mock-{mi+1}",
                    "goal_id": goal_id,
                    "name": f"📝 {m_name}",
                    "type": "test",
                    "date": m_date,
                    "weight": 7,
                    "note": f"Mock test for {name}."
                })

    for ev_file in [VAULT_DIR / "events" / "events.json", DATA_DIR / "events.json"]:
        if ev_file.exists():
            try:
                ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
                ev_list = ev_data.get("events", [])
                for ne in events_to_add:
                    ev_list.insert(0, ne)
                ev_data["events"] = ev_list
                ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
            except Exception:
                pass

    # 3. Save goal record
    goal_record = {
        "id": goal_id,
        "name": name,
        "target_date": target_date,
        "type": goal_type,
        "priority": priority,
        "active": True,
        "note": note,
        "links": links,
        "syllabus": ladder_nodes,
        "mock_tests": parsed.get("mock_tests", []),
        "events": events_to_add,
        "prep_ids": prep_ids,
        "updated": int(time.time() * 1000)
    }
    (VAULT_DIR / "goals" / f"{goal_id}.json").write_text(json.dumps(goal_record, indent=2), encoding="utf-8")

    all_goals = get_all_goals()
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")

    return goal_record

def delete_goal(goal_id):
    # 1. Delete vault goal
    gf = VAULT_DIR / "goals" / f"{goal_id}.json"
    if gf.exists():
        gf.unlink()
    
    # 2. Update public/data/goals.json
    all_goals = [g for g in get_all_goals() if g.get("id") != goal_id]
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")
    
    # 3. Delete vault ladder
    lf = VAULT_DIR / "ladders" / f"{goal_id}.json"
    if lf.exists():
        lf.unlink()
        
    # 4. Remove ladder from public/data/skills.json
    skills_path = DATA_DIR / "skills.json"
    if skills_path.exists():
        try:
            sk = json.loads(skills_path.read_text(encoding="utf-8"))
            sk["ladders"] = [l for l in sk.get("ladders", []) if l.get("id") != goal_id]
            skills_path.write_text(json.dumps(sk, indent=2), encoding="utf-8")
        except Exception:
            pass

    # 5. Scrub all associated events and date overrides completely
    for ev_file in [VAULT_DIR / "events" / "events.json", DATA_DIR / "events.json"]:
        if ev_file.exists():
            try:
                ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
                ev_data["events"] = [e for e in ev_data.get("events", []) if not (
                    e.get("goal_id") == goal_id or 
                    str(e.get("id", "")).startswith(f"goal-{goal_id}") or
                    e.get("ladder") == goal_id
                )]
                if "dates" in ev_data and isinstance(ev_data["dates"], dict):
                    ev_data["dates"] = {k: v for k, v in ev_data["dates"].items() if not k.startswith(f"goal-{goal_id}") and not k.startswith(f"{goal_id}-")}
                ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
            except Exception:
                pass
                
    return True

def toggle_pause_goal(goal_id, active=None):
    gf = VAULT_DIR / "goals" / f"{goal_id}.json"
    if not gf.exists():
        raise ValueError(f"Goal {goal_id} not found")
    data = json.loads(gf.read_text(encoding="utf-8"))
    if active is None:
        data["active"] = not data.get("active", True)
    else:
        data["active"] = bool(active)
    data["updated"] = int(time.time() * 1000)
    gf.write_text(json.dumps(data, indent=2), encoding="utf-8")

    all_goals = get_all_goals()
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")
    return data

def reschedule_goal(goal_id, action="push_forward", days_shift=30):
    gf = VAULT_DIR / "goals" / f"{goal_id}.json"
    if not gf.exists():
        raise ValueError(f"Goal {goal_id} not found")
    goal_data = json.loads(gf.read_text(encoding="utf-8"))
    today = datetime.date.today()

    # Load ladder
    lf = VAULT_DIR / "ladders" / f"{goal_id}.json"
    ladder = json.loads(lf.read_text(encoding="utf-8")) if lf.exists() else {"id": goal_id, "nodes": []}
    nodes = ladder.get("nodes", [])

    # Load progress to see which are done
    prog_path = VAULT_DIR / "progress.json"
    done_ids = set()
    if prog_path.exists():
        try:
            done_ids = set(json.loads(prog_path.read_text(encoding="utf-8")).get("done", {}).keys())
        except Exception:
            pass

    updated_count = 0
    if action == "push_forward":
        # Find uncompleted nodes with due date in the past
        past_nodes = []
        for n in nodes:
            nid = n.get("id")
            if nid in done_ids:
                continue
            due_str = n.get("due")
            if due_str:
                try:
                    dt = datetime.date.fromisoformat(due_str)
                    if dt < today:
                        past_nodes.append(n)
                except Exception:
                    pass

        # Target date
        target_str = goal_data.get("target_date")
        target_dt = None
        if target_str:
            try:
                target_dt = datetime.date.fromisoformat(target_str)
            except Exception:
                pass

        if not target_dt or target_dt <= today:
            target_dt = today + datetime.timedelta(days=max(60, days_shift))
            goal_data["target_date"] = target_dt.isoformat()
            ladder["target"] = target_dt.isoformat()

        # Spread past uncompleted nodes evenly from tomorrow to target_dt
        total_days = max(1, (target_dt - today).days)
        step = max(3, total_days // max(1, len(past_nodes) + 1))
        curr_offset = 3
        for pn in past_nodes:
            new_due = today + datetime.timedelta(days=curr_offset)
            if new_due > target_dt:
                new_due = target_dt
            pn["due"] = new_due.isoformat()
            curr_offset += step
            updated_count += 1

    elif action == "clear_passed":
        for n in nodes:
            if n.get("id") not in done_ids and n.get("due"):
                try:
                    if datetime.date.fromisoformat(n["due"]) < today:
                        del n["due"]
                        updated_count += 1
                except Exception:
                    pass

    elif action == "extend_target":
        delta = datetime.timedelta(days=days_shift)
        target_str = goal_data.get("target_date")
        if target_str:
            try:
                new_target = datetime.date.fromisoformat(target_str) + delta
                goal_data["target_date"] = new_target.isoformat()
                ladder["target"] = new_target.isoformat()
            except Exception:
                pass
        for n in nodes:
            if n.get("id") not in done_ids and n.get("due"):
                try:
                    n["due"] = (datetime.date.fromisoformat(n["due"]) + delta).isoformat()
                    updated_count += 1
                except Exception:
                    pass

    # Save ladder and goal
    ladder["nodes"] = nodes
    if lf.exists():
        lf.write_text(json.dumps(ladder, indent=2), encoding="utf-8")
    skills_path = DATA_DIR / "skills.json"
    if skills_path.exists():
        try:
            sk = json.loads(skills_path.read_text(encoding="utf-8"))
            for i, l in enumerate(sk.get("ladders", [])):
                if l.get("id") == goal_id:
                    sk["ladders"][i] = ladder
                    break
            skills_path.write_text(json.dumps(sk, indent=2), encoding="utf-8")
        except Exception:
            pass

    goal_data["syllabus"] = nodes
    goal_data["updated"] = int(time.time() * 1000)
    gf.write_text(json.dumps(goal_data, indent=2), encoding="utf-8")
    
    all_goals = get_all_goals()
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")

    return {
        "success": True,
        "goal_id": goal_id,
        "action": action,
        "updated_nodes": updated_count,
        "target_date": goal_data.get("target_date")
    }

def add_goal_task(goal_id, task_data):
    gf = VAULT_DIR / "goals" / f"{goal_id}.json"
    if not gf.exists():
        raise ValueError(f"Goal {goal_id} not found")
    goal = json.loads(gf.read_text(encoding="utf-8"))

    title = task_data.get("title") or task_data.get("t") or "New Task"
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:20]
    task_id = f"{goal_id}-{len(goal.get('syllabus', [])) + 1}-{slug}" if slug else f"{goal_id}-{int(time.time())}"
    mins = int(task_data.get("min") or 30)
    due = task_data.get("due") or task_data.get("target_date") or ""
    tiny = task_data.get("tiny") or ""
    links = task_data.get("links") or task_data.get("resources") or []
    if isinstance(links, str) and links.strip():
        links = [{"t": "Resource", "u": links.strip(), "kind": "docs", "free": True}]

    node = {
        "id": task_id,
        "t": title,
        "min": mins,
        "needs": task_data.get("needs", [])
    }
    if tiny:
        node["tiny"] = tiny
    if due:
        node["due"] = due
    if links:
        node["links"] = links

    syllabus = goal.setdefault("syllabus", [])
    syllabus.append(node)
    prep_ids = goal.setdefault("prep_ids", [])
    if task_id not in prep_ids:
        prep_ids.append(task_id)
    goal["updated"] = int(time.time() * 1000)
    gf.write_text(json.dumps(goal, indent=2), encoding="utf-8")

    # Update ladder in vault
    lf = VAULT_DIR / "ladders" / f"{goal_id}.json"
    ladder = json.loads(lf.read_text(encoding="utf-8")) if lf.exists() else {
        "id": goal_id, "name": goal.get("name", "Goal"), "floor": 2, "nodes": []
    }
    ladder_nodes = ladder.setdefault("nodes", [])
    if not any(n.get("id") == task_id for n in ladder_nodes):
        ladder_nodes.append(node)
    ladder["nodes"] = ladder_nodes
    lf.write_text(json.dumps(ladder, indent=2), encoding="utf-8")

    # Update public/data/skills.json
    skills_path = DATA_DIR / "skills.json"
    if skills_path.exists():
        try:
            sk = json.loads(skills_path.read_text(encoding="utf-8"))
            ladders = sk.get("ladders", [])
            for l in ladders:
                if l.get("id") == goal_id:
                    l["nodes"] = ladder_nodes
                    break
            else:
                ladders.insert(0, ladder)
            sk["ladders"] = ladders
            skills_path.write_text(json.dumps(sk, indent=2), encoding="utf-8")
        except Exception:
            pass

    # If due date, add to events.json
    if due:
        for ev_file in [VAULT_DIR / "events" / "events.json", DATA_DIR / "events.json"]:
            if ev_file.exists():
                try:
                    ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
                    ev_list = ev_data.get("events", [])
                    ev_list.append({
                        "id": f"ev-{task_id}",
                        "goal_id": goal_id,
                        "name": title,
                        "type": "topic",
                        "date": due,
                        "weight": 4,
                        "note": f"Task due for {goal.get('name')}"
                    })
                    ev_data["events"] = ev_list
                    ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
                except Exception:
                    pass

    all_goals = get_all_goals()
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")
    return {"goal": goal, "task": node}

def delete_goal_task(goal_id, task_id):
    gf = VAULT_DIR / "goals" / f"{goal_id}.json"
    if not gf.exists():
        raise ValueError(f"Goal {goal_id} not found")
    goal = json.loads(gf.read_text(encoding="utf-8"))

    goal["syllabus"] = [n for n in goal.get("syllabus", []) if n.get("id") != task_id]
    goal["prep_ids"] = [pid for pid in goal.get("prep_ids", []) if pid != task_id]
    goal["updated"] = int(time.time() * 1000)
    gf.write_text(json.dumps(goal, indent=2), encoding="utf-8")

    lf = VAULT_DIR / "ladders" / f"{goal_id}.json"
    if lf.exists():
        ladder = json.loads(lf.read_text(encoding="utf-8"))
        ladder["nodes"] = [n for n in ladder.get("nodes", []) if n.get("id") != task_id]
        lf.write_text(json.dumps(ladder, indent=2), encoding="utf-8")

        skills_path = DATA_DIR / "skills.json"
        if skills_path.exists():
            try:
                sk = json.loads(skills_path.read_text(encoding="utf-8"))
                for l in sk.get("ladders", []):
                    if l.get("id") == goal_id:
                        l["nodes"] = ladder["nodes"]
                        break
                skills_path.write_text(json.dumps(sk, indent=2), encoding="utf-8")
            except Exception:
                pass

    for ev_file in [VAULT_DIR / "events" / "events.json", DATA_DIR / "events.json"]:
        if ev_file.exists():
            try:
                ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
                ev_data["events"] = [e for e in ev_data.get("events", []) if e.get("id") != f"ev-{task_id}" and e.get("id") != task_id]
                ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
            except Exception:
                pass

    all_goals = get_all_goals()
    (DATA_DIR / "goals.json").write_text(json.dumps({"goals": all_goals}, indent=2), encoding="utf-8")
    return {"goal": goal, "deleted_task": task_id}

def get_current_mode():
    settings_file = VAULT_DIR / "settings.json"
    if settings_file.exists():
        try:
            return json.loads(settings_file.read_text(encoding="utf-8")).get("mode", "balanced")
        except Exception:
            pass
    return "balanced"

def set_current_mode(mode):
    settings_file = VAULT_DIR / "settings.json"
    st = json.loads(settings_file.read_text(encoding="utf-8")) if settings_file.exists() else {"schema_version": 1}
    st["mode"] = mode
    st["updated"] = int(time.time() * 1000)
    settings_file.write_text(json.dumps(st, indent=2), encoding="utf-8")
    return mode

def build_system_context():
    context = []
    mode = get_current_mode()
    context.append(f"Current Operating Mode: {mode.upper()} (exam_only freezes projects; balanced runs both)")

    # Active Goals / Exams
    goals = get_all_goals()
    if goals:
        context.append("Active Goals & Exams: " + "; ".join([f"{g['name']} on {g.get('target_date','TBD')} ({len(g.get('prep_ids',[]))} topics)" for g in goals if g.get('active', True)]))

    # Active Projects
    if mode != "exam_only":
        proj_path = DATA_DIR / "projects.json"
        if proj_path.exists():
            try:
                pj = json.loads(proj_path.read_text(encoding="utf-8"))
                context.append("Active Projects: " + ", ".join([f"{p['name']} ({p.get('status','active')})" for p in pj.get("projects", [])]))
            except Exception:
                pass
    else:
        context.append("Note: Projects are MUTED. Only exam preparation and critical deadlines are active.")

    events_path = DATA_DIR / "events.json"
    if events_path.exists():
        try:
            ev = json.loads(events_path.read_text(encoding="utf-8"))
            context.append("Key Deadlines & Mocks: " + "; ".join([f"{e['name']} on {e.get('date')}" for e in ev.get("events", [])[:5]]))
        except Exception:
            pass

    act = get_recent_activity(7)
    context.append(f"Recent Pace: {act['count']} sessions logged ({act['total_minutes']} mins total, ~{act['avg_minutes_per_day']} m/day)")
    return "\n".join(context)

# ----------------- Phase 3: Reflexive Rebalancer -----------------
def generate_rebalance_plan():
    act = get_recent_activity(7)
    today = datetime.date.today()
    proposals = []

    cal_file = DATA_DIR / "calendar.json"
    high_impact_events = []
    if cal_file.exists():
        try:
            cdata = json.loads(cal_file.read_text(encoding="utf-8"))
            for e in cdata.get("events", []):
                edate = e.get("date")
                if edate:
                    dt = datetime.date.fromisoformat(edate)
                    diff = (dt - today).days
                    if 0 <= diff <= 21:
                        high_impact_events.append({"event": e, "days_left": diff})
        except Exception:
            pass

    for item in high_impact_events:
        ev = item["event"]
        days = item["days_left"]
        if days <= 7:
            proposals.append({
                "id": ev.get("id"),
                "name": ev.get("name"),
                "type": "event_prep",
                "current_date": ev.get("date"),
                "suggested_action": "Throttle non-exam study workload to ensure peak focus",
                "reason": f"High impact event '{ev.get('name')}' is in {days} days"
            })

    ollama_ok, models = check_ollama()
    summary = "Schedule is currently well balanced."
    if ollama_ok and models:
        model = get_best_model(models)
        prompt = f"""You are Roadmap Buddy's reflexive rebalancer.
Today is {today.isoformat()}.
Recent velocity: {act['avg_minutes_per_day']} min/day over last 7 days.
Upcoming critical dates: {[e['event']['name'] + ' in ' + str(e['days_left']) + 'd' for e in high_impact_events]}
Proposals: {json.dumps(proposals)}

In 2 short sentences, explain to the student whether their schedule needs adjustment and why."""
        try:
            summary = query_ollama(model, [{"role": "user", "content": prompt}], timeout=25, temp=0.2).strip()
        except Exception:
            pass

    return {
        "velocity": act,
        "upcoming_critical_events": high_impact_events,
        "proposals": proposals,
        "summary": summary
    }

# ----------------- Phase 4: Autonomous Daily Briefing -----------------
def generate_daily_briefing():
    act = get_recent_activity(7)
    today = datetime.date.today()
    ollama_ok, models = check_ollama()
    context = build_system_context()

    if not ollama_ok or not models:
        return {
            "title": f"Daily Briefing - {today.strftime('%A, %b %d')}",
            "focus": "Focus on your primary goal and exam syllabus.",
            "radar": "Keep your regular 25-minute study rhythm.",
            "streak": f"Pace: {act['total_minutes']} mins logged this week."
        }

    model = get_best_model(models)
    prompt = f"""Today is {today.strftime('%A, %B %d, %Y')}.
Roadmap context:
{context}

Write a morning briefing for an ambitious student/builder.
Return a valid JSON object with exactly these 3 keys:
- "focus": One single high-leverage task to prioritize today (max 15 words)
- "radar": What is coming up on the calendar or light day notices (max 15 words)
- "insight": One encouraging, pragmatic observation about their pace or goals (max 20 words)
Return JSON only."""

    try:
        raw = query_ollama(model, [{"role": "system", "content": "You are Roadmap Buddy. Return JSON only."}, {"role": "user", "content": prompt}], timeout=30, temp=0.2)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])
            return {
                "date": today.strftime('%A, %b %d'),
                "focus": data.get("focus", "Maintain focus on your active goal."),
                "radar": data.get("radar", "Check upcoming deadlines on the calendar."),
                "insight": data.get("insight", "Consistency beats intensity."),
                "model": model
            }
    except Exception:
        pass

    return {
        "date": today.strftime('%A, %b %d'),
        "focus": "Maintain focus on your active goal and syllabus.",
        "radar": "Review calendar events on the Month tab.",
        "insight": "Every 25-minute focus session builds real compound skill."
    }

# ----------------- Phase 4: Autonomous Git Committer -----------------
def run_git_auto_commit(custom_msg=None):
    st = subprocess.run(["git", "status", "--porcelain"], cwd=str(BASE_DIR), capture_output=True, text=True)
    if not st.stdout.strip():
        return {"committed": False, "message": "Working directory clean; nothing to commit."}

    act = get_recent_activity(1)
    today = datetime.date.today().isoformat()

    msg = custom_msg
    if not msg:
        ollama_ok, models = check_ollama()
        if ollama_ok and models:
            model = get_best_model(models)
            prompt = f"Today is {today}. The student logged {act['count']} sessions today. Generate a 1-line git conventional commit message starting with 'Auto-Buddy:'. Max 10 words."
            try:
                resp = query_ollama(model, [{"role": "user", "content": prompt}], timeout=20, temp=0.2)
                msg = resp.replace('"', '').replace('`', '').strip()
            except Exception:
                pass

    if not msg:
        msg = f"Auto-Buddy: Progress sync {today} [{act['count']} sessions]"

    try:
        subprocess.run(["git", "add", "vault", "public/data", "public/app"], cwd=str(BASE_DIR), check=True)
        res = subprocess.run(["git", "commit", "-m", msg], cwd=str(BASE_DIR), capture_output=True, text=True)
        h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(BASE_DIR), capture_output=True, text=True).stdout.strip()
        return {"committed": True, "hash": h, "message": msg, "output": res.stdout}
    except Exception as e:
        return {"committed": False, "error": str(e)}

# ----------------- HTTP Request Handler -----------------
class BuddyRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path.startswith("/media/"):
            self.handle_media_get(path)
            return

        if path == "/api/status":
            self.handle_status()
        elif path == "/api/vault/state":
            self.handle_vault_state()
        elif path == "/api/projects":
            self.handle_projects_get(query)
        elif path == "/api/timeline":
            self.handle_timeline_get(query)
        elif path == "/api/sessions":
            self.handle_sessions_get(query)
        elif path == "/api/calendar/activity":
            self.handle_calendar_activity_get(query)
        elif path == "/api/goals":
            self.handle_goals_get()
        elif path == "/api/rebalance":
            self.handle_rebalance_get()
        elif path == "/api/briefing":
            self.handle_briefing()
        else:
            super().do_GET()

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        if path.startswith("/api/projects"):
            self.handle_projects_delete()
        elif path.startswith("/api/timeline"):
            self.handle_timeline_delete()
        elif path.startswith("/api/goals/task"):
            self.handle_goals_task_delete()
        elif path.startswith("/api/goals"):
            self.handle_goals_delete()
        else:
            self.send_error(404, "Endpoint not found")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/projects":
            self.handle_projects_post()
        elif path == "/api/projects/delete":
            self.handle_projects_delete()
        elif path == "/api/projects/restore":
            self.handle_projects_restore()
        elif path == "/api/timeline":
            self.handle_timeline_post()
        elif path == "/api/timeline/resolve":
            self.handle_timeline_resolve()
        elif path == "/api/timeline/delete":
            self.handle_timeline_delete()
        elif path == "/api/sessions":
            self.handle_sessions_post()
        elif path == "/api/media/upload":
            self.handle_media_upload()
        elif path == "/api/media/cleanup":
            self.handle_media_cleanup()
        elif path == "/api/chat":
            self.handle_chat()
        elif path == "/api/log":
            self.handle_log()
        elif path == "/api/action":
            self.handle_action()
        elif path == "/api/goals":
            self.handle_goals_post()
        elif path == "/api/goals/task":
            self.handle_goals_task_post()
        elif path == "/api/goals/task/delete":
            self.handle_goals_task_delete()
        elif path == "/api/goals/delete":
            self.handle_goals_delete()
        elif path == "/api/goals/pause":
            self.handle_goals_pause()
        elif path == "/api/goals/reschedule":
            self.handle_goals_reschedule()
        elif path == "/api/goals/mode":
            self.handle_goals_mode()
        elif path == "/api/rebalance":
            self.handle_rebalance_post()
        elif path == "/api/git/commit":
            self.handle_git_commit()
        else:
            self.send_error(404, "Endpoint not found")

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw)
        except Exception:
            return {}

    def send_json(self, data, code=200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def handle_status(self):
        ollama_ok, models = check_ollama()
        model = get_best_model(models)
        self.send_json({
            "status": "online",
            "ollama_available": ollama_ok,
            "models": models,
            "selected_model": model,
            "vault_dir": str(VAULT_DIR),
            "mode": get_current_mode(),
            "time": int(time.time() * 1000)
        })

    def handle_vault_state(self):
        prog = json.loads((VAULT_DIR / "progress.json").read_text(encoding="utf-8"))
        settings = json.loads((VAULT_DIR / "settings.json").read_text(encoding="utf-8"))
        events = json.loads((VAULT_DIR / "events" / "events.json").read_text(encoding="utf-8"))
        goals = get_all_goals()
        self.send_json({
            "progress": prog,
            "settings": settings,
            "events": events,
            "goals": goals
        })

    def handle_media_get(self, path):
        # path is like /media/<project_id>/<filename>
        rel_parts = [p for p in path.lstrip("/").split("/") if p]
        file_path = (VAULT_DIR / Path(*rel_parts)).resolve()
        media_root = (VAULT_DIR / "media").resolve()

        try:
            file_path.relative_to(media_root)
        except ValueError:
            self.send_error(403, "Access denied")
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Media file not found")
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, f"Error reading media: {e}")

    def handle_projects_get(self, query):
        category = query.get("category", [None])[0]
        include_deleted = query.get("include_deleted", ["0"])[0] in ("1", "true", "True")
        proj_id = query.get("id", [None])[0]
        if proj_id:
            proj = storage.get_project(proj_id)
            if not proj:
                self.send_json({"error": "Project not found"}, 404)
                return
            self.send_json({"project": proj})
            return
        projects = storage.get_projects(include_deleted=include_deleted, category=category)
        self.send_json({"projects": projects, "total": len(projects)})

    def handle_projects_post(self):
        body = self.read_json_body()
        if not body.get("name"):
            self.send_json({"error": "Project name is required"}, 400)
            return
        try:
            project = storage.save_project(body)
            self.send_json({"success": True, "project": project})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_projects_delete(self):
        body = self.read_json_body()
        proj_id = body.get("id")
        if not proj_id and "?" in self.path:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            proj_id = q.get("id", [None])[0]
        if not proj_id:
            self.send_json({"error": "Project id is required"}, 400)
            return
        hard = body.get("hard", False)
        storage.delete_project(proj_id, hard=hard)
        self.send_json({"success": True, "deleted": proj_id, "hard": hard})

    def handle_projects_restore(self):
        body = self.read_json_body()
        proj_id = body.get("id")
        if not proj_id:
            self.send_json({"error": "Project id is required"}, 400)
            return
        storage.restore_project(proj_id)
        self.send_json({"success": True, "restored": proj_id})

    def handle_timeline_get(self, query):
        proj_id = query.get("project_id", [None])[0]
        entry_type = query.get("type", [None])[0]
        limit = int(query.get("limit", [100])[0])
        offset = int(query.get("offset", [0])[0])
        include_deleted = query.get("include_deleted", ["0"])[0] in ("1", "true", "True")
        entries = storage.get_timeline(
            project_id=proj_id,
            entry_type=entry_type,
            limit=limit,
            offset=offset,
            include_deleted=include_deleted
        )
        self.send_json({"timeline": entries, "count": len(entries)})

    def handle_timeline_post(self):
        body = self.read_json_body()
        if not body.get("title") and not body.get("body"):
            self.send_json({"error": "Title or body is required"}, 400)
            return
        try:
            entry = storage.save_timeline_entry(body)
            self.send_json({"success": True, "entry": entry})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_timeline_resolve(self):
        body = self.read_json_body()
        entry_id = body.get("id")
        notes = body.get("resolution_notes", "")
        if not entry_id:
            self.send_json({"error": "Entry id is required"}, 400)
            return
        entry = storage.resolve_blocker(entry_id, notes)
        if not entry:
            self.send_json({"error": "Timeline entry not found"}, 404)
            return
        self.send_json({"success": True, "entry": entry})

    def handle_timeline_delete(self):
        body = self.read_json_body()
        entry_id = body.get("id")
        if not entry_id and "?" in self.path:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            entry_id = q.get("id", [None])[0]
        if not entry_id:
            self.send_json({"error": "Entry id is required"}, 400)
            return
        hard = body.get("hard", False)
        storage.delete_timeline_entry(entry_id, hard=hard)
        self.send_json({"success": True, "deleted": entry_id, "hard": hard})

    def handle_sessions_get(self, query):
        proj_id = query.get("project_id", [None])[0]
        limit = int(query.get("limit", [50])[0])
        sessions = storage.get_work_sessions(project_id=proj_id, limit=limit)
        self.send_json({"sessions": sessions, "count": len(sessions)})

    def handle_sessions_post(self):
        body = self.read_json_body()
        try:
            sess = storage.save_work_session(body)
            self.send_json({"success": True, "session": sess})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_calendar_activity_get(self, query):
        today = datetime.date.today()
        year = int(query.get("year", [today.year])[0])
        month = int(query.get("month", [today.month])[0])
        activity = storage.get_calendar_activity(year, month)
        self.send_json(activity)

    def handle_media_upload(self):
        body = self.read_json_body()
        proj_id = body.get("project_id", "general")
        filename = body.get("filename", "upload.jpg")
        b64_data = body.get("data_base64", "")
        mime_type = body.get("mime_type", "image/jpeg")
        entry_id = body.get("entry_id")

        if not b64_data:
            self.send_json({"error": "Missing data_base64 payload"}, 400)
            return

        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]

        try:
            file_bytes = base64.b64decode(b64_data)
            saved = storage.save_media_file(
                project_id=proj_id,
                filename=filename,
                file_bytes=file_bytes,
                mime_type=mime_type,
                entry_id=entry_id
            )
            self.send_json({"success": True, "media": saved})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_media_cleanup(self):
        res = storage.cleanup_orphaned_media()
        self.send_json({"success": True, "cleanup": res})

    def handle_goals_get(self):
        goals = get_all_goals()
        self.send_json({
            "goals": goals,
            "mode": get_current_mode()
        })

    def handle_goals_post(self):
        body = self.read_json_body()
        try:
            saved = save_goal(body)
            self.send_json({"success": True, "goal": saved})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 400)

    def handle_goals_delete(self):
        body = self.read_json_body()
        goal_id = body.get("id")
        if not goal_id and "?" in self.path:
            import urllib.parse
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            goal_id = query.get("id", [None])[0]
        if not goal_id:
            self.send_json({"error": "Missing goal id"}, 400)
            return
        try:
            delete_goal(goal_id)
            self.send_json({"success": True, "deleted": goal_id})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_goals_pause(self):
        body = self.read_json_body()
        goal_id = body.get("id")
        active = body.get("active")
        if not goal_id:
            self.send_json({"error": "Missing goal id"}, 400)
            return
        try:
            res = toggle_pause_goal(goal_id, active)
            self.send_json({"success": True, "goal": res})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 400)

    def handle_goals_reschedule(self):
        body = self.read_json_body()
        goal_id = body.get("id")
        action = body.get("action", "push_forward")
        days = int(body.get("days", 30))
        if not goal_id:
            self.send_json({"error": "Missing goal id"}, 400)
            return
        try:
            res = reschedule_goal(goal_id, action, days)
            self.send_json({"success": True, "reschedule": res})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 400)

    def handle_goals_task_post(self):
        body = self.read_json_body()
        goal_id = body.get("goal_id")
        if not goal_id:
            self.send_json({"error": "Missing goal_id"}, 400)
            return
        try:
            res = add_goal_task(goal_id, body)
            self.send_json({"success": True, **res})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 400)

    def handle_goals_task_delete(self):
        body = self.read_json_body()
        goal_id = body.get("goal_id")
        task_id = body.get("task_id")
        if not goal_id or not task_id:
            self.send_json({"error": "Missing goal_id or task_id"}, 400)
            return
        try:
            res = delete_goal_task(goal_id, task_id)
            self.send_json({"success": True, **res})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 400)

    def handle_goals_mode(self):
        body = self.read_json_body()
        mode = body.get("mode", "balanced")
        if mode not in ["balanced", "exam_only", "builder"]:
            self.send_json({"error": "Invalid mode"}, 400)
            return
        updated_mode = set_current_mode(mode)
        self.send_json({"success": True, "mode": updated_mode})

    def handle_rebalance_get(self):
        plan = generate_rebalance_plan()
        self.send_json(plan)

    def handle_rebalance_post(self):
        body = self.read_json_body()
        adjustments = body.get("adjustments", [])
        ev_file = VAULT_DIR / "events" / "events.json"
        ev_data = json.loads(ev_file.read_text(encoding="utf-8")) if ev_file.exists() else {"schema_version": 1, "events": [], "dates": {}}

        applied = []
        for adj in adjustments:
            item_id = adj.get("id")
            new_date = adj.get("suggested_date")
            if item_id and new_date:
                ev_data.setdefault("dates", {})[item_id] = {
                    "date": new_date,
                    "updated": int(time.time() * 1000)
                }
                applied.append({"id": item_id, "new_date": new_date})

        ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
        self.send_json({"success": True, "applied": applied, "count": len(applied)})

    def handle_briefing(self):
        briefing = generate_daily_briefing()
        self.send_json(briefing)

    def handle_log(self):
        entry = self.read_json_body()
        if not entry.get("id"):
            self.send_json({"error": "Missing task/topic id"}, 400)
            return
        result = append_log_entry(entry)
        self.send_json({"success": True, "entry": result})

    def handle_action(self):
        body = self.read_json_body()
        action = body.get("action")
        data = body.get("data", {})

        if action == "LOG_SESSION":
            entry = append_log_entry(data)
            self.send_json({"success": True, "action": action, "entry": entry})
        elif action == "SHIFT_DATE":
            event_id = data.get("id")
            new_date = data.get("date")
            ev_file = VAULT_DIR / "events" / "events.json"
            ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
            ev_data.setdefault("dates", {})[event_id] = {"date": new_date, "updated": int(time.time() * 1000)}
            ev_file.write_text(json.dumps(ev_data, indent=2), encoding="utf-8")
            self.send_json({"success": True, "action": action, "dates": ev_data["dates"]})
        elif action == "IMPORT_GOAL":
            saved = save_goal(data)
            self.send_json({"success": True, "action": action, "goal": saved})
        elif action == "DELETE_GOAL":
            goal_id = data.get("id")
            delete_goal(goal_id)
            self.send_json({"success": True, "action": action, "deleted": goal_id})
        elif action == "PAUSE_GOAL":
            goal_id = data.get("id")
            active = data.get("active")
            res = toggle_pause_goal(goal_id, active)
            self.send_json({"success": True, "action": action, "goal": res})
        elif action == "RESCHEDULE_GOAL":
            goal_id = data.get("id")
            res_act = data.get("reschedule_action", "push_forward")
            days = int(data.get("days", 30))
            res = reschedule_goal(goal_id, res_act, days)
            self.send_json({"success": True, "action": action, "reschedule": res})
        else:
            self.send_json({"error": f"Unknown action {action}"}, 400)

    def handle_chat(self):
        body = self.read_json_body()
        user_msg = body.get("message", "")
        history = body.get("history", [])

        ollama_ok, models = check_ollama()
        if not ollama_ok or not models:
            self.send_json({
                "reply": "Ollama is currently unreachable on localhost:11434. Please ensure Ollama is running (`ollama serve`).",
                "actions": []
            })
            return

        model = body.get("model") or get_best_model(models)
        context = build_system_context()

        system_prompt = f"""You are Roadmap Buddy, an adaptive, calm, and highly practical engineering and learning coach.
You keep the user focused on their roadmaps, goals, exams, and projects.
Respond concisely in plain text (2-4 sentences max).

Current roadmap state:
{context}

If the user wants to log work, mark something done, adjust a deadline, or import a goal/exam, provide an ACTION block at the very end of your response:
ACTION:LOG_SESSION {{"id": "topic_id", "title": "Topic Name", "min": 25, "k": "topic"}}
ACTION:SHIFT_DATE {{"id": "event_or_project_id", "date": "YYYY-MM-DD"}}
ACTION:IMPORT_GOAL {{"name": "Exam Name", "target_date": "YYYY-MM-DD", "type": "exam", "syllabus": [...]}}

Only output an ACTION block when explicitly relevant. Keep guidance actionable and encouraging."""

        messages = [{"role": "system", "content": system_prompt}]
        for h in history[-6:]:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": user_msg})

        try:
            reply = query_ollama(model, messages)
            actions = []
            clean_reply = []
            for line in reply.splitlines():
                if line.startswith("ACTION:"):
                    parts = line.split(" ", 1)
                    if len(parts) == 2:
                        act_name = parts[0].replace("ACTION:", "").strip()
                        try:
                            act_data = json.loads(parts[1].strip())
                            actions.append({"action": act_name, "data": act_data})
                        except Exception:
                            pass
                else:
                    clean_reply.append(line)

            self.send_json({
                "reply": "\n".join(clean_reply).strip(),
                "actions": actions,
                "model": model
            })
        except Exception as e:
            self.send_json({"reply": f"Error communicating with {model}: {str(e)}", "actions": []}, 500)

    def handle_git_commit(self):
        body = self.read_json_body()
        custom_msg = body.get("message")
        result = run_git_auto_commit(custom_msg)
        code = 200 if result.get("committed") or "clean" in result.get("message", "") else 500
        self.send_json(result, code)

if __name__ == "__main__":
    print(f">> Roadmap Buddy Daemon listening on http://localhost:{PORT}")
    server = HTTPServer(("0.0.0.0", PORT), BuddyRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down daemon...")
        server.server_close()
