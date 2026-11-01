#!/usr/bin/env python3
"""Roadmap Buddy vault tools. Standard library only. Spec: README.md (schema_version 1).

  python3 -I vault.py validate DIR
  python3 -I vault.py import-backup BACKUP.json OUTDIR [--projects-json FILE] [--device phone]
  python3 -I vault.py export-backup DIR OUT.json
  python3 -I vault.py merge A B OUT
"""
import argparse
import datetime
import json
import os
import re
import sys
import unicodedata

SCHEMA = 1
STATES = ['idea', 'planned', 'active', 'paused', 'blocked', 'done']
LOG_KINDS = ['session', 'tiny', 'topic']
EVENT_TYPES = ['milestone', 'hackathon', 'ctf', 'contest', 'gsoc', 'internship', 'personal',
               'exam', 'test', 'competition', 'application']
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME = re.compile(r'^\d{2}:\d{2}$')
SLUG = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*\.md$')
IDRE = re.compile(r'^[A-Za-z0-9_.:-]+$')
MONTHFILE = re.compile(r'^(\d{4})-(\d{2})\.jsonl$')
URLRE = re.compile(r'^https?://\S+$', re.I)
SECRETS = [
    re.compile(r'ghp_[A-Za-z0-9]{20,}'), re.compile(r'github_pat_[A-Za-z0-9_]{20,}'),
    re.compile(r'sk-[A-Za-z0-9_-]{20,}'), re.compile(r'AKIA[0-9A-Z]{16}'),
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    re.compile(r'"(password|passwd|api[_-]?key|token|secret)"\s*:', re.I),
    re.compile(r'^(password|passwd|api_?key|token|secret):', re.I | re.M),
]
PROJ_KEYS = ['id', 'origin', 'name', 'state', 'priority', 'type', 'goal', 'done_looks_like', 'deadline',
             'needs', 'ladders', 'tasks', 'milestones', 'blocked_by', 'next', 'proof_url', 'learned',
             'done_at', 'updated']
# keys of an own project in S that this tool knows how to keep (anything else is reported, not silently dropped)
KNOWN_OWN = {'id', 'name', 'goal', 'done', 'deadline', 'priority', 'type', 'needs', 'ladders', 'tasks',
             'status', 'state', 'why', 'next', 'ms', 'proof', 'doneAt'}
BLANK_S = {'done': {}, 'later': {}, 'last': {}, 'log': [], 'pin': None, 'badges': {}, 'lvl': 1, 'ms': {},
           'projects': [], 'focus': None, 'events': [], 'evDate': {}, 'planner': 'rules', 'hideStrip': False,
           'goal': None, 'tm': None}


# ---------------------------------------------------------------- small helpers
def is_date(s):
    if not isinstance(s, str) or not ISO.match(s):
        return False
    try:
        datetime.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def month_of(ts):
    return datetime.datetime.fromtimestamp(ts / 1000, datetime.timezone.utc).strftime('%Y-%m')


def to_ms(v):
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        try:
            return int(datetime.datetime.fromisoformat(v.replace('Z', '+00:00')).timestamp() * 1000)
        except ValueError:
            return 0
    return 0


def slugify(name, taken):
    folded = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')   # é -> e, ü -> u
    s = re.sub(r'[^a-z0-9]+', '-', folded.lower()).strip('-') or 'project'
    out, n = s, 2
    while out in taken:
        out = '%s-%d' % (s, n)
        n += 1
    taken.add(out)
    return out


def dump_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(obj, indent=1, ensure_ascii=False) + '\n')


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def fm_write(fields, body=''):
    lines = ['---'] + ['%s: %s' % (k, json.dumps(v, ensure_ascii=False)) for k, v in fields.items()] + ['---', '']
    return '\n'.join(lines) + body


def fm_read(text):
    if not text.startswith('---\n'):
        raise ValueError('missing front matter')
    end = text.find('\n---\n', 3)
    if end < 0:
        raise ValueError('front matter not closed')
    head, body = text[4:end], text[end + 5:]
    out = {}
    for ln in head.split('\n') if head else []:
        m = re.match(r'^([a-z_][a-z0-9_]*): (.*)$', ln)
        if not m:
            raise ValueError('bad front matter line: %r' % ln[:60])
        if m.group(1) in out:
            raise ValueError('duplicate key: ' + m.group(1))
        try:
            out[m.group(1)] = json.loads(m.group(2))
        except json.JSONDecodeError:
            raise ValueError('value of %s is not JSON' % m.group(1))
    return out, body


# ---------------------------------------------------------------- project mapping
def project_record(p, x, origin, updated):
    st = x.get('state') or ('paused' if p.get('status') == 'paused' else 'active')
    pr = x.get('proof') or {}
    return {
        'id': p['id'], 'origin': origin, 'name': p.get('name') or p['id'], 'state': st,
        'priority': int(p.get('priority') or 2), 'type': p.get('type') or None, 'goal': p.get('goal') or '',
        'done_looks_like': p.get('done') or '', 'deadline': p.get('deadline') or None,
        'needs': list(p.get('needs') or []), 'ladders': list(p.get('ladders') or []),
        'tasks': [dict(t) for t in (p.get('tasks') or [])], 'milestones': [dict(m) for m in (x.get('ms') or [])],
        'blocked_by': x.get('why') or '', 'next': x.get('next') or '',
        'proof_url': pr.get('url') or '', 'learned': pr.get('note') or '',
        'done_at': x.get('doneAt') or None, 'updated': updated,
    }


def record_to_s(rec):
    """Vault record -> (project dict for S.projects or None, fpx entry or None)."""
    state = {'state': rec['state']}
    if rec.get('blocked_by'):
        state['why'] = rec['blocked_by']
    if rec.get('next'):
        state['next'] = rec['next']
    if rec.get('milestones'):
        state['ms'] = [dict(m) for m in rec['milestones']]
    if rec.get('proof_url') or rec.get('learned'):
        state['proof'] = {'url': rec.get('proof_url', ''), 'note': rec.get('learned', '')}
    if rec.get('done_at'):
        state['doneAt'] = rec['done_at']
    if rec['origin'] == 'builtin':
        return None, state
    p = {'id': rec['id'], 'name': rec['name'], 'goal': rec.get('goal', ''), 'done': rec.get('done_looks_like', ''),
         'deadline': rec.get('deadline') or '', 'priority': rec['priority'], 'type': rec.get('type') or 'web',
         'needs': list(rec.get('needs') or []), 'ladders': list(rec.get('ladders') or []),
         'tasks': [dict(t) for t in (rec.get('tasks') or [])],
         'status': 'active' if rec['state'] == 'active' else 'paused'}
    p.update(state)
    return p, None


# ---------------------------------------------------------------- vault model (strict load / write)
def write_vault(out, m):
    os.makedirs(out, exist_ok=True)
    dump_json(os.path.join(out, 'vault.json'), {'schema_version': SCHEMA})
    dump_json(os.path.join(out, 'settings.json'), dict(m['settings'], schema_version=SCHEMA))
    dump_json(os.path.join(out, 'progress.json'), {'schema_version': SCHEMA, 'done': m['done'], 'ms': m['ms']})
    dump_json(os.path.join(out, 'events', 'events.json'),
              {'schema_version': SCHEMA, 'events': sorted(m['events'].values(), key=lambda e: e['id']),
               'dates': m['dates']})
    taken = set()
    pdir = os.path.join(out, 'projects')
    os.makedirs(pdir, exist_ok=True)
    for old in os.listdir(pdir):                      # rewrite from the model; keep existing slugs stable
        if old.endswith('.md'):
            os.remove(os.path.join(pdir, old))
    recs = sorted(m['projects'].values(), key=lambda r: r['id'])
    taken.update(r['_slug'] for r in recs if r.get('_slug'))     # existing slugs stay stable
    for rec in recs:
        slug = rec.get('_slug') or slugify(rec['name'], taken)
        fields = {k: rec[k] for k in PROJ_KEYS if k in rec}
        with open(os.path.join(pdir, slug + '.md'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(fm_write(fields, rec.get('_body') or ('## Notes\n\n')))
    ldir = os.path.join(out, 'log')
    os.makedirs(ldir, exist_ok=True)
    for old in os.listdir(ldir):
        if MONTHFILE.match(old):
            os.remove(os.path.join(ldir, old))
    by = {}
    for e in m['log'].values():
        by.setdefault(month_of(e['ts']), []).append(e)
    for mon, es in by.items():
        es.sort(key=lambda e: (e['ts'], e['uid']))
        with open(os.path.join(ldir, mon + '.jsonl'), 'w', encoding='utf-8', newline='\n') as f:
            for e in es:
                f.write(json.dumps(e, ensure_ascii=False, separators=(',', ':')) + '\n')
    ladir = os.path.join(out, 'ladders')
    if m['ladders']:
        os.makedirs(ladir, exist_ok=True)
    for lid, lad in m['ladders'].items():
        dump_json(os.path.join(ladir, lid + '.json'), lad)


def load_vault(d):
    m = {'settings': {}, 'done': {}, 'ms': {}, 'events': {}, 'dates': {}, 'projects': {}, 'log': {}, 'ladders': {}}
    p = os.path.join(d, 'settings.json')
    if os.path.exists(p):
        m['settings'] = {k: v for k, v in read_json(p).items() if k != 'schema_version'}
    p = os.path.join(d, 'progress.json')
    if os.path.exists(p):
        j = read_json(p)
        m['done'], m['ms'] = j.get('done', {}), j.get('ms', {})
    p = os.path.join(d, 'events', 'events.json')
    if os.path.exists(p):
        j = read_json(p)
        m['events'] = {e['id']: e for e in j.get('events', [])}
        m['dates'] = j.get('dates', {})
    pd = os.path.join(d, 'projects')
    if os.path.isdir(pd):
        for fn in sorted(os.listdir(pd)):
            if fn.endswith('.md'):
                with open(os.path.join(pd, fn), encoding='utf-8') as f:
                    rec, body = fm_read(f.read())
                rec['_slug'], rec['_body'] = fn[:-3], body
                m['projects'][rec['id']] = rec
    ld = os.path.join(d, 'log')
    if os.path.isdir(ld):
        for fn in sorted(os.listdir(ld)):
            if MONTHFILE.match(fn):
                with open(os.path.join(ld, fn), encoding='utf-8') as f:
                    for ln in f:
                        if ln.strip():
                            e = json.loads(ln)
                            m['log'][e['uid']] = e
    lad = os.path.join(d, 'ladders')
    if os.path.isdir(lad):
        for fn in sorted(os.listdir(lad)):
            if fn.endswith('.json'):
                m['ladders'][fn[:-5]] = read_json(os.path.join(lad, fn))
    return m


# ---------------------------------------------------------------- import-backup
def import_backup(backup, outdir, projects_seed=None, device='phone'):
    warns = []
    S = backup['S'] if isinstance(backup, dict) and isinstance(backup.get('S'), dict) else backup
    at = to_ms(backup.get('at')) if isinstance(backup, dict) else 0
    m = {'settings': {}, 'done': {}, 'ms': {}, 'events': {}, 'dates': {}, 'projects': {}, 'log': {}, 'ladders': {}}
    for k, v in (S.get('done') or {}).items():
        m['done'][k] = {'ts': to_ms(v), 'on': True}
    for k, v in (S.get('ms') or {}).items():
        m['ms'][k] = {'ts': to_ms(v), 'on': True}
    seen = {}
    for l in S.get('log') or []:
        base = '%d-%s' % (l['ts'], l['id'])
        seen[base] = seen.get(base, 0) + 1
        uid = base if seen[base] == 1 else '%s-%d' % (base, seen[base])
        e = dict(l)
        extra = set(e) - {'id', 'lad', 'title', 'ts', 'k'}
        if extra:
            warns.append('log line %s has extra keys kept as they are: %s' % (uid, sorted(extra)))
        e.update({'uid': uid, 'device': device})
        m['log'][uid] = e
    for e in S.get('events') or []:
        rec = {'id': e['id'], 'name': e['name'], 'type': e.get('type') or 'personal', 'date': e['date'],
               'end': e.get('end') or '', 'time': e.get('time') or '', 'etime': e.get('etime') or '',
               'note': e.get('note') or '', 'updated': at}
        m['events'][rec['id']] = rec
    for k, v in (S.get('evDate') or {}).items():
        m['dates'][k] = {'date': v, 'updated': at}
    for p in S.get('projects') or []:
        unknown = set(p) - KNOWN_OWN
        if unknown:
            warns.append('own project %s has keys that the vault does not keep: %s' % (p.get('id'), sorted(unknown)))
        m['projects'][p['id']] = project_record(p, p, 'own', at)
    fpx = S.get('fpx') or {}
    seed = {p['id']: p for p in (projects_seed or {}).get('projects', [])} if projects_seed else {}
    for pid in sorted(set(fpx) | set(seed)):
        base = seed.get(pid) or {'id': pid, 'name': pid}
        if pid not in seed:
            warns.append('built-in project %s has saved state but no projects.json entry: name set to its id' % pid)
        m['projects'][pid] = project_record(base, fpx.get(pid) or {}, 'builtin', at)
        if base.get('note'):                                   # the repo's note for the project goes into the free text
            m['projects'][pid]['_body'] = '## Notes\n\n%s\n' % base['note']
    st = {'focus': S.get('focus'), 'goal': S.get('goal'), 'updated': at}
    if 'floors' in S:
        st['floors'] = bool(S['floors'])
    m['settings'] = st
    for lad in S.get('ladders') or []:
        m['ladders'][lad['id']] = lad
    write_vault(outdir, m)
    return warns


# ---------------------------------------------------------------- export-backup
def export_backup(d, outpath):
    errs, _ = validate(d)
    if errs:
        raise SystemExit('Refusing to export: the vault has %d errors (run validate).' % len(errs))
    m = load_vault(d)
    S = json.loads(json.dumps(BLANK_S))
    S['done'] = {k: v['ts'] for k, v in m['done'].items() if v['on']}
    S['ms'] = {k: v['ts'] for k, v in m['ms'].items() if v['on']}
    log = sorted(m['log'].values(), key=lambda e: (e['ts'], e['uid']))
    S['log'] = [{k: v for k, v in e.items() if k not in ('uid', 'device')} for e in log]
    for e in log:
        S['last'][e['lad']] = max(S['last'].get(e['lad'], 0), e['ts'])
    S['events'] = [{k: v for k, v in e.items() if k != 'updated'} for e in m['events'].values() if not e.get('deleted')]
    S['evDate'] = {k: v['date'] for k, v in m['dates'].items()}
    fpx = {}
    for rec in m['projects'].values():
        p, x = record_to_s(rec)
        if p is not None:
            S['projects'].append(p)
        elif x != {'state': 'active'}:                          # a bare "active" is the app's default: do not invent it
            fpx[rec['id']] = x
    if fpx:
        S['fpx'] = fpx
    S['focus'] = m['settings'].get('focus')
    S['goal'] = m['settings'].get('goal')
    if 'floors' in m['settings']:
        S['floors'] = m['settings']['floors']
    if m['ladders']:
        S['ladders'] = list(m['ladders'].values())
    at = max([0] + [v.get('updated', 0) for v in m['projects'].values()] + [m['settings'].get('updated', 0)])
    dump_json(outpath, {'buddy': 'backup', 'v': 1, 'at': at, 'S': S})


# ---------------------------------------------------------------- merge
def newer(a, b, key):
    return b if b.get(key, 0) > a.get(key, 0) else a


def merge(da, db, out):
    for d in (da, db):
        errs, _ = validate(d)
        if errs:
            raise SystemExit('Refusing to merge: %s has %d errors (run validate).' % (d, len(errs)))
    a, b = load_vault(da), load_vault(db)
    warns = []
    m = {'log': dict(b['log'])}
    m['log'].update(a['log'])                                   # same uid = same line
    for key in ('done', 'ms'):
        m[key] = dict(a[key])
        for k, v in b[key].items():
            m[key][k] = v if k not in a[key] or v['ts'] > a[key][k]['ts'] else a[key][k]
    m['events'], m['projects'], m['dates'] = {}, {}, {}
    for key in ('events', 'projects'):
        for k in set(a[key]) | set(b[key]):
            m[key][k] = newer(a[key][k], b[key][k], 'updated') if k in a[key] and k in b[key] else (a[key].get(k) or b[key][k])
    for k in set(a['dates']) | set(b['dates']):
        m['dates'][k] = newer(a['dates'][k], b['dates'][k], 'updated') if k in a['dates'] and k in b['dates'] else (a['dates'].get(k) or b['dates'][k])
    m['settings'] = newer(a['settings'], b['settings'], 'updated')
    m['ladders'] = dict(b['ladders'])
    for lid, lad in a['ladders'].items():
        if lid in b['ladders'] and b['ladders'][lid] != lad:
            warns.append('ladder %s differs in the two vaults: the first one was kept' % lid)
        m['ladders'][lid] = lad
    write_vault(out, m)
    return warns


# ---------------------------------------------------------------- validate
def validate(d):
    E, W = [], []
    err = lambda where, msg: E.append('%s: %s' % (where, msg))
    warn = lambda where, msg: W.append('%s: %s' % (where, msg))
    if not os.path.isdir(d):
        return ['%s: not a folder' % d], []

    def jload(rel, required=False):
        p = os.path.join(d, rel)
        if not os.path.exists(p):
            if required:
                err(rel, 'missing')
            return None
        try:
            return read_json(p)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            err(rel, 'not valid JSON (%s)' % e)
            return None

    def schema(rel, j):
        if isinstance(j, dict) and j.get('schema_version') != SCHEMA:
            err(rel, 'schema_version must be %d' % SCHEMA)

    v = jload('vault.json', True)
    if v is not None and v.get('schema_version') != SCHEMA:
        err('vault.json', 'schema_version must be %d' % SCHEMA)

    for fn in sorted(os.listdir(d)):
        if fn not in ('vault.json', 'README.md', 'context.md', 'settings.json', 'progress.json', 'projects', 'events',
                      'log', 'ladders', 'proposals'):
            warn(fn, 'unknown file or folder in the vault root')

    # secrets in every text file
    for root, _, files in os.walk(d):
        for fn in files:
            p = os.path.join(root, fn)
            rel = os.path.relpath(p, d)
            try:
                with open(p, encoding='utf-8') as f:
                    txt = f.read()
            except (UnicodeDecodeError, OSError):
                err(rel, 'not readable as UTF-8 text')
                continue
            for pat in SECRETS:
                if pat.search(txt):
                    err(rel, 'looks like it holds a secret (password, key or token): never store those')
                    break

    # projects
    pids, ptasks = {}, {}
    pd = os.path.join(d, 'projects')
    for fn in sorted(os.listdir(pd)) if os.path.isdir(pd) else []:
        rel = 'projects/' + fn
        if not SLUG.match(fn):
            err(rel, 'file name must be lowercase letters, digits and single hyphens, ending .md')
            continue
        try:
            with open(os.path.join(pd, fn), encoding='utf-8') as f:
                r, _ = fm_read(f.read())
        except (ValueError, UnicodeDecodeError) as e:
            err(rel, str(e))
            continue
        for k in ('id', 'origin', 'name', 'state', 'priority', 'updated'):
            if k not in r:
                err(rel, 'missing key ' + k)
        for k in r:
            if k not in PROJ_KEYS:
                warn(rel, 'unknown key ' + k)
        if not isinstance(r.get('id'), str) or not IDRE.match(r.get('id') or ''):
            err(rel, 'id must be a string of letters, digits and _ . : -')
            continue
        if r['id'] in pids:
            err(rel, 'duplicate project id %s (also in %s)' % (r['id'], pids[r['id']]))
        pids[r['id']] = fn
        if r.get('origin') not in ('own', 'builtin'):
            err(rel, 'origin must be "own" or "builtin"')
        if not isinstance(r.get('name'), str) or not r['name'].strip():
            err(rel, 'name must be a non-empty string')
        if r.get('state') not in STATES:
            err(rel, 'state must be one of %s' % STATES)
        if r.get('priority') not in (1, 2, 3) or isinstance(r.get('priority'), bool):
            err(rel, 'priority must be 1, 2 or 3')
        if not isinstance(r.get('updated'), int) or isinstance(r.get('updated'), bool):
            err(rel, 'updated must be an integer (ms)')
        if r.get('deadline') is not None and not is_date(r['deadline']):
            err(rel, 'deadline must be null or YYYY-MM-DD')
        for k in ('goal', 'done_looks_like', 'blocked_by', 'next', 'proof_url', 'learned'):
            if k in r and not isinstance(r[k], str):
                err(rel, k + ' must be a string')
        for k in ('needs', 'ladders'):
            if k in r and not (isinstance(r[k], list) and all(isinstance(x, str) for x in r[k])):
                err(rel, k + ' must be a list of strings')
        tids = set()
        if 'tasks' in r:
            if not isinstance(r['tasks'], list):
                err(rel, 'tasks must be a list')
            else:
                for t in r['tasks']:
                    if not (isinstance(t, dict) and isinstance(t.get('id'), str) and isinstance(t.get('t'), str) and t['t'].strip()):
                        err(rel, 'every task needs a string id and a title t')
                    elif t['id'] in tids:
                        err(rel, 'duplicate task id ' + t['id'])
                    else:
                        tids.add(t['id'])
                    if isinstance(t, dict) and 'min' in t and not (isinstance(t['min'], int) and t['min'] > 0):
                        err(rel, 'task min must be a positive integer')
        ptasks[r['id']] = tids
        mids = set()
        if 'milestones' in r:
            if not isinstance(r['milestones'], list):
                err(rel, 'milestones must be a list')
            else:
                for ms in r['milestones']:
                    ok = isinstance(ms, dict) and isinstance(ms.get('id'), str) and isinstance(ms.get('t'), str) and ms['t'].strip() \
                        and isinstance(ms.get('done'), bool) and (ms.get('date') in ('', None) or is_date(ms.get('date')))
                    if not ok:
                        err(rel, 'every milestone needs id, title t, done (true/false) and date ("" or YYYY-MM-DD)')
                    elif ms['id'] in mids:
                        err(rel, 'duplicate milestone id ' + ms['id'])
                    else:
                        mids.add(ms['id'])
        if r.get('state') == 'done':
            if not URLRE.match(r.get('proof_url') or ''):
                err(rel, 'a Done project needs proof_url starting with http:// or https://')
            if not (r.get('learned') or '').strip():
                err(rel, 'a Done project needs one line in "learned"')
        if r.get('proof_url') and not URLRE.match(r['proof_url']):
            err(rel, 'proof_url must start with http:// or https://')

    # events
    eids = set()
    j = jload('events/events.json')
    if j is not None:
        schema('events/events.json', j)
        for e in j.get('events', []):
            w = 'events/events.json'
            if not isinstance(e, dict) or not isinstance(e.get('id'), str):
                err(w, 'every event needs a string id')
                continue
            if e['id'] in eids:
                err(w, 'duplicate event id ' + e['id'])
            eids.add(e['id'])
            if not isinstance(e.get('updated'), int):
                err(w, 'event %s: updated must be an integer (ms)' % e['id'])
            if e.get('deleted') is True:
                continue
            if not isinstance(e.get('name'), str) or not e['name'].strip():
                err(w, 'event %s: name missing' % e['id'])
            if not is_date(e.get('date')):
                err(w, 'event %s: date must be YYYY-MM-DD' % e['id'])
            if e.get('type') not in EVENT_TYPES:
                warn(w, 'event %s: unknown type %r (the app shows it as personal)' % (e['id'], e.get('type')))
            if e.get('end') and (not is_date(e['end']) or e['end'] < (e.get('date') or '')):
                err(w, 'event %s: end must be a date on or after the start' % e['id'])
            for k in ('time', 'etime'):
                if e.get(k) and not TIME.match(e[k]):
                    err(w, 'event %s: %s must be HH:MM' % (e['id'], k))
        for k, dv in (j.get('dates') or {}).items():
            if not (isinstance(dv, dict) and is_date(dv.get('date')) and isinstance(dv.get('updated'), int)):
                err('events/events.json', 'dates[%s] must be {"date": YYYY-MM-DD, "updated": ms}' % k)

    # log
    uids = {}
    ld = os.path.join(d, 'log')
    for fn in sorted(os.listdir(ld)) if os.path.isdir(ld) else []:
        rel = 'log/' + fn
        mm = MONTHFILE.match(fn)
        if not mm:
            warn(rel, 'unknown file in log/')
            continue
        with open(os.path.join(ld, fn), encoding='utf-8') as f:
            for n, ln in enumerate(f, 1):
                if not ln.strip():
                    continue
                w = '%s line %d' % (rel, n)
                try:
                    e = json.loads(ln)
                except json.JSONDecodeError:
                    err(w, 'not valid JSON')
                    continue
                if not isinstance(e, dict):
                    err(w, 'must be a JSON object')
                    continue
                for k in ('uid', 'id', 'lad', 'title', 'device'):
                    if not isinstance(e.get(k), str) or not e[k]:
                        err(w, k + ' must be a non-empty string')
                if not isinstance(e.get('ts'), int) or isinstance(e.get('ts'), bool) or e['ts'] <= 0:
                    err(w, 'ts must be a positive integer (ms)')
                elif month_of(e['ts']) != fn[:-6]:
                    err(w, 'ts is in %s (UTC) but the line is in %s' % (month_of(e['ts']), fn))
                if e.get('k') not in LOG_KINDS:
                    err(w, 'k must be one of %s (any other kind is counted as a session by the app)' % LOG_KINDS)
                if isinstance(e.get('uid'), str):
                    if e['uid'] in uids:
                        err(w, 'duplicate uid %s (also %s)' % (e['uid'], uids[e['uid']]))
                    uids[e['uid']] = w

    # progress
    j = jload('progress.json')
    if j is not None:
        schema('progress.json', j)
        for sec in ('done', 'ms'):
            for k, v in (j.get(sec) or {}).items():
                if not (isinstance(v, dict) and isinstance(v.get('ts'), int) and isinstance(v.get('on'), bool)):
                    err('progress.json', '%s[%s] must be {"ts": ms, "on": true/false}' % (sec, k))
        for k, v in (j.get('done') or {}).items():
            mt = re.match(r'^pt:([^:]+):(.+)$', k)
            if mt and isinstance(v, dict) and v.get('on'):
                if mt.group(1) not in pids:
                    warn('progress.json', '%s refers to a project that has no file' % k)
                elif mt.group(2) not in ptasks.get(mt.group(1), set()):
                    warn('progress.json', '%s refers to a task that is not in the project file' % k)

    # settings
    j = jload('settings.json')
    if j is not None:
        schema('settings.json', j)
        for k in ('focus', 'goal'):
            if j.get(k) is not None and not isinstance(j[k], str):
                err('settings.json', k + ' must be a string or null')
        if 'floors' in j and not isinstance(j['floors'], bool):
            err('settings.json', 'floors must be true or false')
        if not isinstance(j.get('updated'), int):
            err('settings.json', 'updated must be an integer (ms)')
        if isinstance(j.get('focus'), str) and j['focus'] not in pids:
            warn('settings.json', 'focus %s has no project file' % j['focus'])

    # ladders
    lad = os.path.join(d, 'ladders')
    for fn in sorted(os.listdir(lad)) if os.path.isdir(lad) else []:
        rel = 'ladders/' + fn
        if not fn.endswith('.json'):
            warn(rel, 'unknown file in ladders/')
            continue
        j = jload(rel)
        if j is None:
            continue
        if j.get('id') != fn[:-5]:
            err(rel, 'id must equal the file name')
        if not isinstance(j.get('nodes'), list):
            err(rel, 'nodes must be a list')
            continue
        seen = set()
        for n in j['nodes']:
            if not (isinstance(n, dict) and isinstance(n.get('id'), str) and isinstance(n.get('t'), str)):
                err(rel, 'every node needs a string id and a title t')
            elif n['id'] in seen:
                err(rel, 'duplicate node id ' + n['id'])
            else:
                seen.add(n['id'])
    return E, W


# ---------------------------------------------------------------- CLI
def main(argv):
    ap = argparse.ArgumentParser(prog='vault.py')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('validate'); s.add_argument('dir')
    s = sub.add_parser('import-backup'); s.add_argument('backup'); s.add_argument('out')
    s.add_argument('--projects-json'); s.add_argument('--device', default='phone')
    s = sub.add_parser('export-backup'); s.add_argument('dir'); s.add_argument('out')
    s = sub.add_parser('merge'); s.add_argument('a'); s.add_argument('b'); s.add_argument('out')
    a = ap.parse_args(argv)
    if a.cmd == 'validate':
        E, W = validate(a.dir)
        for w in W:
            print('warning:', w)
        for e in E:
            print('ERROR:', e)
        print('%d errors, %d warnings' % (len(E), len(W)))
        return 1 if E else 0
    if a.cmd == 'import-backup':
        seed = read_json(a.projects_json) if a.projects_json else None
        warns = import_backup(read_json(a.backup), a.out, seed, a.device)
        for w in warns:
            print('warning:', w)
        E, W = validate(a.out)
        for e in E:
            print('ERROR:', e)
        print('wrote %s: %d errors, %d warnings' % (a.out, len(E), len(W)))
        return 1 if E else 0
    if a.cmd == 'export-backup':
        export_backup(a.dir, a.out)
        print('wrote', a.out)
        return 0
    if a.cmd == 'merge':
        for w in merge(a.a, a.b, a.out):
            print('warning:', w)
        E, W = validate(a.out)
        for e in E:
            print('ERROR:', e)
        print('merged into %s: %d errors, %d warnings' % (a.out, len(E), len(W)))
        return 1 if E else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
