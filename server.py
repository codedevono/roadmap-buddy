#!/usr/bin/env python3
"""Roadmap Buddy Live Daemon & Copilot Server.
Serves the web client from public/, provides live vault synchronization,
reflexive roadmap rebalancing (Phase 3), daily briefings, and autonomous git commits (Phase 4).
"""

import os
import sys
import json
import time
import datetime
import urllib.request
import urllib.error
import subprocess
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = PUBLIC_DIR / "data"
VAULT_DIR = BASE_DIR / "vault"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PORT = int(os.environ.get("PORT", 8000))

# Ensure vault structure exists
def init_vault():
    VAULT_DIR.mkdir(exist_ok=True)
    (VAULT_DIR / "projects").mkdir(exist_ok=True)
    (VAULT_DIR / "events").mkdir(exist_ok=True)
    (VAULT_DIR / "log").mkdir(exist_ok=True)
    (VAULT_DIR / "ladders").mkdir(exist_ok=True)

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
    """Calculates study velocity and streak over the past N days."""
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

def build_system_context():
    context = []
    proj_path = DATA_DIR / "projects.json"
    if proj_path.exists():
        try:
            pj = json.loads(proj_path.read_text(encoding="utf-8"))
            context.append("Active Projects: " + ", ".join([f"{p['name']} ({p.get('status','active')})" for p in pj.get("projects", [])]))
        except Exception:
            pass

    events_path = DATA_DIR / "events.json"
    if events_path.exists():
        try:
            ev = json.loads(events_path.read_text(encoding="utf-8"))
            context.append("Key Deadlines: " + "; ".join([f"{e['name']} on {e.get('date')}" for e in ev.get("events", [])[:5]]))
        except Exception:
            pass

    cal_path = DATA_DIR / "calendar.json"
    if cal_path.exists():
        try:
            cal = json.loads(cal_path.read_text(encoding="utf-8"))
            context.append("Upcoming External Dates: " + "; ".join([f"{c['name']} on {c.get('date')}" for c in cal.get("events", [])[:5]]))
        except Exception:
            pass

    act = get_recent_activity(7)
    context.append(f"Recent Pace: {act['count']} sessions logged ({act['total_minutes']} mins total, ~{act['avg_minutes_per_day']} m/day)")
    return "\n".join(context)

# ----------------- Phase 3: Reflexive Rebalancer -----------------
def generate_rebalance_plan():
    """Analyzes pace, upcoming events, and generates adaptive schedule proposals."""
    act = get_recent_activity(7)
    today = datetime.date.today()
    proposals = []

    # Check upcoming calendar events within next 14 days
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
                    if 0 <= diff <= 14:
                        high_impact_events.append({"event": e, "days_left": diff})
        except Exception:
            pass

    # Read active projects milestones
    proj_file = DATA_DIR / "projects.json"
    projects = []
    if proj_file.exists():
        try:
            projects = json.loads(proj_file.read_text(encoding="utf-8")).get("projects", [])
        except Exception:
            pass

    # Reflexive Rule 1: If an upcoming event is within 5 days, recommend prep/light day shifts
    for item in high_impact_events:
        ev = item["event"]
        days = item["days_left"]
        if days <= 5:
            proposals.append({
                "id": ev.get("id"),
                "name": ev.get("name"),
                "type": "event_prep",
                "current_date": ev.get("date"),
                "suggested_action": "Throttle study workload 2 days prior to ensure focus",
                "reason": f"High impact event '{ev.get('name')}' is in {days} days"
            })

    # Reflexive Rule 2: If velocity is low (< 20m/day), suggest shifting project targets forward
    if act["avg_minutes_per_day"] < 25:
        for p in projects:
            if p.get("status") == "active" and p.get("deadline"):
                d_curr = datetime.date.fromisoformat(p["deadline"])
                if d_curr >= today:
                    d_new = d_curr + datetime.timedelta(days=7)
                    proposals.append({
                        "id": p.get("id"),
                        "name": p.get("name"),
                        "type": "deadline_extension",
                        "current_date": str(d_curr),
                        "suggested_date": str(d_new),
                        "suggested_action": f"Shift {p.get('name')} target to {d_new}",
                        "reason": f"Current velocity ({act['avg_minutes_per_day']} m/day) indicates high pressure. Extending milestone by 7 days maintains calm consistency."
                    })

    # Enhance proposal with Ollama if online
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
    """Generates an inspiring, grounded morning/daily briefing from local Ollama."""
    act = get_recent_activity(7)
    today = datetime.date.today()
    ollama_ok, models = check_ollama()

    context = build_system_context()

    if not ollama_ok or not models:
        return {
            "title": f"Daily Briefing - {today.strftime('%A, %b %d')}",
            "focus": "Review your active project topics in Roadmap Buddy.",
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
                "focus": data.get("focus", "Keep momentum on active topics."),
                "radar": data.get("radar", "Check upcoming deadlines on the calendar."),
                "insight": data.get("insight", "Consistency beats intensity."),
                "model": model
            }
    except Exception:
        pass

    return {
        "date": today.strftime('%A, %b %d'),
        "focus": "Maintain focus on your active project milestone.",
        "radar": "Review calendar events on the Month tab.",
        "insight": "Every 25-minute focus session builds real compound skill."
    }

# ----------------- Phase 4: Autonomous Git Committer -----------------
def run_git_auto_commit(custom_msg=None):
    """Gathers changes in vault and data, generates an AI commit message, and commits."""
    # Check git status
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
            prompt = f"Today is {today}. The student logged {act['count']} sessions today. Generate a 1-line git conventional commit message starting with 'Auto-Buddy:'. Max 10 words. Example: Auto-Buddy: Logged 2 study sessions and updated vault progress"
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
        # Get latest commit hash
        h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(BASE_DIR), capture_output=True, text=True).stdout.strip()
        return {"committed": True, "hash": h, "message": msg, "output": res.stdout}
    except Exception as e:
        return {"committed": False, "error": str(e)}

# ----------------- HTTP Request Handler -----------------
class BuddyRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self.handle_status()
        elif self.path == "/api/vault/state":
            self.handle_vault_state()
        elif self.path == "/api/rebalance":
            self.handle_rebalance_get()
        elif self.path == "/api/briefing":
            self.handle_briefing()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/chat":
            self.handle_chat()
        elif self.path == "/api/log":
            self.handle_log()
        elif self.path == "/api/action":
            self.handle_action()
        elif self.path == "/api/rebalance":
            self.handle_rebalance_post()
        elif self.path == "/api/git/commit":
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
            "time": int(time.time() * 1000)
        })

    def handle_vault_state(self):
        prog = json.loads((VAULT_DIR / "progress.json").read_text(encoding="utf-8"))
        settings = json.loads((VAULT_DIR / "settings.json").read_text(encoding="utf-8"))
        events = json.loads((VAULT_DIR / "events" / "events.json").read_text(encoding="utf-8"))
        self.send_json({
            "progress": prog,
            "settings": settings,
            "events": events
        })

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
You keep the user focused on their roadmaps, projects, and deadlines.
Respond concisely in plain text (2-4 sentences max).

Current roadmap state:
{context}

If the user wants to log work, mark something done, or adjust a deadline, provide an ACTION block at the very end of your response:
ACTION:LOG_SESSION {{"id": "topic_id", "title": "Topic Name", "min": 25, "k": "topic"}}
ACTION:SHIFT_DATE {{"id": "event_or_project_id", "date": "YYYY-MM-DD"}}

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
