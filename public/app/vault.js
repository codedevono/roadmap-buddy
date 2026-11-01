/* Roadmap Buddy: Vault export and import (vault.js).
   Reads the app's data (S) into the plain-text vault format of README.md (schema_version 1) and back.
   Same layer pattern as pstate.js: loaded by space.js, index.html is not touched.
   Two parts: a pure core (no DOM, runs in node for the tests) and a small screen at the bottom of the Home tools box.
   Export  -> buddy-vault-YYYY-MM-DD.zip (open it in Obsidian, or give it to another device).
   Import  -> a vault .zip (or a bundle .json) is MERGED into this device with the rules of the spec: nothing is thrown away.
   Own storage keys only: buddy.v2.vault (what was last exported or imported, to date the changes) and buddy.v2.vault.prev (S before the last import).
   Never stores secrets: a vault with a token or key in it is refused. */
(function (root) {
'use strict';
const SV = 1, STATES = ['idea', 'planned', 'active', 'paused', 'blocked', 'done'], KINDS = ['session', 'tiny', 'topic'];
const ISO = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, IDRE = /^[A-Za-z0-9_.:-]+$/;
const SECRET = /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const SECRET_KEY = /^(password|passwd|token|secret|api[_-]?key|access[_-]?token)$/i;
const PKEYS = ['id', 'origin', 'name', 'state', 'priority', 'type', 'goal', 'done_looks_like', 'deadline', 'needs', 'ladders', 'tasks', 'milestones', 'blocked_by', 'next', 'proof_url', 'learned', 'done_at', 'updated'];
const KNOWN_OWN = ['id', 'name', 'goal', 'done', 'deadline', 'priority', 'type', 'needs', 'ladders', 'tasks', 'status', 'state', 'ms', 'why', 'next', 'proof', 'doneAt', 'file'];

const clone = x => JSON.parse(JSON.stringify(x));
function canon(x) {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) if (k[0] !== '_') o[k] = canon(x[k]); return o; }
  return x;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const strip = r => { const o = clone(r); delete o.updated; return o; };
const sortedObj = o => { const r = {}; for (const k of Object.keys(o).sort()) r[k] = o[k]; return r; };
const monthOf = ts => new Date(ts).toISOString().slice(0, 7);
const jtext = (o, ind) => JSON.stringify(o, null, ind === undefined ? 2 : ind) + '\n';

function slugify(name, taken) {
  let s = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) s = 'project';
  let out = s, n = 2;
  while (taken.has(out)) out = s + '-' + n++;
  taken.add(out);
  return out;
}

/* ---------- front matter: every line is  key: <JSON value>  ---------- */
function fmWrite(rec, body) {
  const keys = PKEYS.filter(k => k in rec);
  let t = '---\n';
  for (const k of keys) t += k + ': ' + JSON.stringify(rec[k]) + '\n';
  t += '---\n';
  body = (body || '').replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return t + (body ? '\n' + body + '\n' : '');
}
function fmRead(text, where, errs) {
  const L = String(text).replace(/\r\n/g, '\n').split('\n');
  if (L[0] !== '---') { errs.push(where + ': must start with a --- line'); return null; }
  let i = 1; const rec = {};
  for (; i < L.length && L[i] !== '---'; i++) {
    if (!L[i].trim()) continue;
    const k = L[i].indexOf(': ');
    if (k < 1) { errs.push(where + ': line ' + (i + 1) + ' is not "key: value"'); return null; }
    const key = L[i].slice(0, k);
    try { rec[key] = JSON.parse(L[i].slice(k + 2)); }
    catch (e) { errs.push(where + ': value of "' + key + '" is not JSON (strings need double quotes)'); return null; }
  }
  if (i >= L.length) { errs.push(where + ': front matter is not closed with ---'); return null; }
  return { rec, body: L.slice(i + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, '') };
}

/* ---------- S  ->  model ---------- */
const evRec = e => ({ id: e.id, name: e.name || '', type: e.type || '', date: e.date || '', end: e.end || '', time: e.time || '', etime: e.etime || '', note: e.note || '' });

function ownRecord(p, warn) {
  for (const k of Object.keys(p)) if (!KNOWN_OWN.includes(k)) warn.push('project ' + p.id + ': the field "' + k + '" is not part of the vault format and was left out');
  const pr = p.proof || {};
  return {
    id: p.id, origin: 'own', name: p.name || '', state: p.state || (p.status === 'paused' ? 'paused' : 'active'),
    priority: p.priority || 2, type: p.type || null, goal: p.goal || '', done_looks_like: p.done || '', deadline: p.deadline || null,
    needs: clone(p.needs || []), ladders: clone(p.ladders || []), tasks: clone(p.tasks || []), milestones: clone(p.ms || []),
    blocked_by: p.why || '', next: p.next || '', proof_url: pr.url || '', learned: pr.note || '', done_at: p.doneAt || null
  };
}
function builtinRecord(seed, x) {
  x = x || {}; const pr = x.proof || {};
  return {
    id: seed.id, origin: 'builtin', name: seed.name || '', state: x.state || 'active', priority: seed.priority || 2, type: null,
    goal: '', done_looks_like: '', deadline: null, needs: clone(seed.needs || []), ladders: [], tasks: [], milestones: clone(x.ms || []),
    blocked_by: x.why || '', next: x.next || '', proof_url: pr.url || '', learned: pr.note || '', done_at: x.doneAt || null
  };
}

/* ctx: {seed:[projects.json items], shadow:{model,dev}|null, device, now}. The shadow is what was last exported or imported:
   a fact that differs from it gets updated = now, a fact that does not keeps its old date. That is how changes are dated without touching index.html. */
function fromS(S, ctx) {
  const now = ctx.now, dev = ctx.device, sh = (ctx.shadow && ctx.shadow.model) || {}, shdev = (ctx.shadow && ctx.shadow.dev) || {};
  const m = { log: {}, done: {}, ms: {}, projects: {}, events: {}, dates: {}, settings: {}, ladders: {} }, warn = [];
  /* history: uid = <ts>-<topicId>, a -2, -3 suffix when that repeats */
  const lines = (S.log || []).map((e, i) => ({ e, i })).sort((a, b) => a.e.ts - b.e.ts || a.i - b.i), cnt = {};
  for (const { e } of lines) {
    const base = e.ts + '-' + e.id; cnt[base] = (cnt[base] || 0) + 1;
    const uid = cnt[base] === 1 ? base : base + '-' + cnt[base];
    m.log[uid] = { uid, id: e.id, lad: e.lad, title: e.title, ts: e.ts, k: KINDS.includes(e.k) ? e.k : 'session', device: shdev[uid] || dev };
  }
  /* progress: marks, and undo as on:false */
  for (const [key, from, to] of [['done', S.done || {}, m.done], ['ms', S.ms || {}, m.ms]]) {
    for (const id of Object.keys(from)) to[id] = { ts: from[id], on: true };
    const old = sh[key] || {};
    for (const id of Object.keys(old)) if (!(id in to)) to[id] = old[id].on ? { ts: now, on: false } : old[id];
  }
  /* projects: own ones from S, built-in ones from projects.json plus S.fpx */
  const slugs = new Set(), oldP = sh.projects || {};
  const put = (rec, body) => {
    const o = oldP[rec.id], bare = rec.origin === 'builtin' && rec.state === 'active' && !rec.next && !rec.blocked_by && !rec.proof_url && !rec.learned && !rec.done_at && !(rec.milestones || []).length;
    const u = o && same(strip(o), strip(rec)) ? o.updated : (!o && bare ? 0 : now);    // a never-touched built-in project says nothing yet, so it must not beat real data from another device
    const slug = o && o._slug && !slugs.has(o._slug) ? (slugs.add(o._slug), o._slug) : slugify(rec.name, slugs);
    m.projects[rec.id] = Object.assign({}, rec, { updated: u, _slug: slug, _body: o ? o._body : body || '' });
  };
  for (const p of S.projects || []) put(ownRecord(p, warn), '');
  for (const s of ctx.seed || []) put(builtinRecord(s, (S.fpx || {})[s.id]), s.note || '');
  /* events: own events (edited or deleted in the app) and the dates chosen for events from the repo */
  const oldE = sh.events || {};
  for (const e of S.events || []) {
    const r = evRec(e), o = oldE[e.id];
    m.events[e.id] = Object.assign(r, { updated: o && !o.deleted && same(strip(o), r) ? o.updated : now });
  }
  for (const id of Object.keys(oldE)) if (!(id in m.events)) m.events[id] = oldE[id].deleted ? oldE[id] : { id, deleted: true, updated: now };
  const oldD = sh.dates || {};
  for (const id of Object.keys(S.evDate || {})) {
    const d = S.evDate[id], o = oldD[id];
    m.dates[id] = { date: d, updated: o && o.date === d ? o.updated : now };
  }
  /* settings */
  const set = { focus: S.focus || null, goal: S.goal || null };
  if (typeof S.floors === 'boolean') set.floors = S.floors;
  const os = sh.settings;
  m.settings = Object.assign(set, { updated: os && same(strip(os), set) ? os.updated : (!set.focus && !set.goal && set.floors === undefined ? 0 : now) });
  for (const l of S.ladders || []) m.ladders[l.id] = clone(l);
  m.warn = warn;
  return m;
}

/* ---------- model  ->  S (keeps the keys that stay on the device) ---------- */
function toS(m, S0, seed) {
  const S = Object.assign({}, S0);
  S.done = {}; S.ms = {};
  for (const id of Object.keys(m.done)) if (m.done[id].on) S.done[id] = m.done[id].ts;
  for (const id of Object.keys(m.ms)) if (m.ms[id].on) S.ms[id] = m.ms[id].ts;
  const log = Object.values(m.log).sort((a, b) => a.ts - b.ts || (a.uid < b.uid ? -1 : 1));
  S.log = log.map(e => ({ id: e.id, lad: e.lad, title: e.title, ts: e.ts, k: e.k }));
  S.last = {}; for (const e of S.log) if (!(S.last[e.lad] > e.ts)) S.last[e.lad] = e.ts;
  const seedIds = new Set((seed || []).map(s => s.id)), fpx = Object.assign({}, S0.fpx || {}), own = [], oldOrder = (S0.projects || []).map(p => p.id);
  for (const r of Object.values(m.projects)) {
    const pr = (r.proof_url || r.learned) ? { url: r.proof_url || '', note: r.learned || '' } : null;
    if (r.origin === 'builtin') {
      if (!seedIds.has(r.id)) continue;
      const x = {};
      if (r.state !== 'active') x.state = r.state;
      if (r.milestones && r.milestones.length) x.ms = clone(r.milestones);
      if (r.next) x.next = r.next;
      if (r.blocked_by) x.why = r.blocked_by;
      if (pr) x.proof = pr;
      if (r.done_at) x.doneAt = r.done_at;
      if (Object.keys(x).length) fpx[r.id] = x; else delete fpx[r.id];
      continue;
    }
    const p = { id: r.id, name: r.name, goal: r.goal || '', done: r.done_looks_like || '', deadline: r.deadline || '', priority: r.priority, type: r.type || '',
      needs: clone(r.needs || []), ladders: clone(r.ladders || []), tasks: clone(r.tasks || []), status: r.state === 'active' ? 'active' : 'paused', state: r.state };
    if (r.milestones && r.milestones.length) p.ms = clone(r.milestones);
    if (r.blocked_by) p.why = r.blocked_by;
    if (r.next) p.next = r.next;
    if (pr) p.proof = pr;
    if (r.done_at) p.doneAt = r.done_at;
    own.push(p);
  }
  own.sort((a, b) => { const x = oldOrder.indexOf(a.id), y = oldOrder.indexOf(b.id); return (x < 0 ? 1e9 : x) - (y < 0 ? 1e9 : y) || (a.id < b.id ? -1 : 1); });
  S.projects = own; S.fpx = fpx;
  S.events = Object.values(m.events).filter(e => !e.deleted).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id < b.id ? -1 : 1)).map(e => { const o = clone(e); delete o.updated; return o; });
  S.evDate = {}; for (const id of Object.keys(m.dates)) S.evDate[id] = m.dates[id].date;
  S.focus = m.settings.focus || null; S.goal = m.settings.goal || null;
  if (typeof m.settings.floors === 'boolean') S.floors = m.settings.floors;
  S.ladders = Object.values(m.ladders).sort((a, b) => (a.id < b.id ? -1 : 1)).map(clone);
  S.tm = null;
  return S;
}

/* ---------- model  <->  files ---------- */
function toFiles(m) {
  const f = {};
  f['vault.json'] = jtext({ schema_version: SV });
  f['settings.json'] = jtext(Object.assign({ schema_version: SV }, sortedObj(m.settings)));
  f['progress.json'] = jtext({ schema_version: SV, done: sortedObj(m.done), ms: sortedObj(m.ms) });
  f['events/events.json'] = jtext({ schema_version: SV, events: Object.values(m.events).sort((a, b) => (a.id < b.id ? -1 : 1)), dates: sortedObj(m.dates) });
  const months = {};
  for (const e of Object.values(m.log).sort((a, b) => a.ts - b.ts || (a.uid < b.uid ? -1 : 1))) {
    (months[monthOf(e.ts)] = months[monthOf(e.ts)] || []).push(JSON.stringify({ uid: e.uid, id: e.id, lad: e.lad, title: e.title, ts: e.ts, k: e.k, device: e.device }));
  }
  for (const k of Object.keys(months)) f['log/' + k + '.jsonl'] = months[k].join('\n') + '\n';
  for (const id of Object.keys(m.ladders)) f['ladders/' + id + '.json'] = jtext(m.ladders[id]);
  for (const r of Object.values(m.projects)) f['projects/' + r._slug + '.md'] = fmWrite(r, r._body);
  return f;
}

function checkRec(r, where, errs) {
  if (typeof r.id !== 'string' || !IDRE.test(r.id)) errs.push(where + ': id must be a string of letters, digits and _ . : -');
  if (typeof r.name !== 'string' || !r.name.trim()) errs.push(where + ': name is required');
  if (!STATES.includes(r.state)) errs.push(where + ': state must be one of ' + STATES.join(', '));
  if (![1, 2, 3].includes(r.priority)) errs.push(where + ': priority must be 1, 2 or 3');
  if (r.origin !== 'own' && r.origin !== 'builtin') errs.push(where + ': origin must be "own" or "builtin"');
  if (r.deadline != null && !(typeof r.deadline === 'string' && ISO.test(r.deadline) && !isNaN(new Date(r.deadline + 'T00:00:00Z')) && new Date(r.deadline + 'T00:00:00Z').toISOString().slice(0, 10) === r.deadline)) errs.push(where + ': deadline must be null or YYYY-MM-DD');
  if (!Number.isInteger(r.updated)) errs.push(where + ': updated must be a number (ms)');
  for (const k of ['needs', 'ladders', 'tasks', 'milestones']) if (k in r && !Array.isArray(r[k])) errs.push(where + ': ' + k + ' must be a list');
  if (r.state === 'done') {
    if (!/^https?:\/\/\S+$/i.test(r.proof_url || '')) errs.push(where + ': Done project needs proof_url (http or https)');
    if (!String(r.learned || '').trim()) errs.push(where + ': Done project needs one line in "learned"');
  }
  if (r.proof_url && !/^https?:\/\/\S+$/i.test(r.proof_url)) errs.push(where + ': proof_url must start with http:// or https://');
}

/* parse + validate a files map. Returns {model, errors, warnings}; the model is null when there are errors. */
function fromFiles(files) {
  const errs = [], warns = [];
  const jparse = (p, optional) => {
    if (!(p in files)) { if (!optional) errs.push(p + ': missing'); return null; }
    try { return JSON.parse(files[p]); } catch (e) { errs.push(p + ': is not valid JSON'); return null; }
  };
  const secretKeys = (o, where) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (SECRET_KEY.test(k)) errs.push(where + ' holds a secret (key "' + k + '"): a vault never stores keys or passwords'); secretKeys(o[k], where); } };
  for (const p of Object.keys(files)) if (SECRET.test(files[p])) errs.push(p + ' holds a secret (token or key pattern): a vault never stores keys or passwords');
  const v = jparse('vault.json'); if (v && v.schema_version !== SV) errs.push('vault.json: schema_version must be 1');
  const m = { log: {}, done: {}, ms: {}, projects: {}, events: {}, dates: {}, settings: {}, ladders: {} };
  const st = jparse('settings.json');
  if (st) {
    secretKeys(st, 'settings.json');
    if (st.schema_version !== SV) errs.push('settings.json: schema_version must be 1');
    m.settings = { focus: st.focus || null, goal: st.goal || null, updated: Number.isInteger(st.updated) ? st.updated : 0 };
    if (typeof st.floors === 'boolean') m.settings.floors = st.floors;
  }
  const pg = jparse('progress.json');
  if (pg) {
    if (pg.schema_version !== SV) errs.push('progress.json: schema_version must be 1');
    for (const k of ['done', 'ms']) for (const id of Object.keys(pg[k] || {})) {
      const e = pg[k][id];
      if (!e || !Number.isInteger(e.ts) || typeof e.on !== 'boolean') errs.push('progress.json: ' + k + '.' + id + ' must be {"ts": ms, "on": true/false}');
      else m[k][id] = { ts: e.ts, on: e.on };
    }
  }
  const ev = jparse('events/events.json');
  if (ev) {
    if (ev.schema_version !== SV) errs.push('events/events.json: schema_version must be 1');
    for (const e of ev.events || []) {
      const w = 'events/events.json: event ' + (e && e.id);
      if (!e || typeof e.id !== 'string' || !IDRE.test(e.id)) { errs.push('events/events.json: an event has no valid id'); continue; }
      if (!Number.isInteger(e.updated)) errs.push(w + ': updated must be a number (ms)');
      if (!e.deleted) {
        if (!String(e.name || '').trim()) errs.push(w + ': name is required');
        if (!ISO.test(e.date || '')) errs.push(w + ': date must be YYYY-MM-DD');
        if (e.end && (!ISO.test(e.end) || e.end < e.date)) errs.push(w + ': end must be a date on or after the start');
        if (e.time && !TIME.test(e.time)) errs.push(w + ': time must be HH:MM');
        if (e.etime && !TIME.test(e.etime)) errs.push(w + ': etime must be HH:MM');
      }
      if (m.events[e.id]) errs.push('events/events.json: duplicate event id ' + e.id);
      m.events[e.id] = e.deleted ? { id: e.id, deleted: true, updated: e.updated } : Object.assign(evRec(e), { updated: e.updated });
    }
    for (const id of Object.keys(ev.dates || {})) {
      const d = ev.dates[id];
      if (!d || !ISO.test(d.date || '') || !Number.isInteger(d.updated)) errs.push('events/events.json: dates.' + id + ' must be {"date": YYYY-MM-DD, "updated": ms}');
      else m.dates[id] = { date: d.date, updated: d.updated };
    }
  }
  for (const p of Object.keys(files)) {
    let mt;
    if ((mt = /^log\/(\d{4}-\d{2})\.jsonl$/.exec(p))) {
      files[p].split('\n').forEach((line, i) => {
        if (!line.trim()) return;
        let e; try { e = JSON.parse(line); } catch (x) { errs.push(p + ': line ' + (i + 1) + ' is not JSON'); return; }
        const w = p + ': line ' + (i + 1);
        if (typeof e.uid !== 'string' || !e.uid) { errs.push(w + ': uid is required'); return; }
        if (!KINDS.includes(e.k)) errs.push(w + ': k must be one of ' + KINDS.join(', '));
        if (!Number.isInteger(e.ts)) { errs.push(w + ': ts must be a number (ms)'); return; }
        if (monthOf(e.ts) !== mt[1]) errs.push(w + ': ts is in ' + monthOf(e.ts) + ' but the line is in ' + p.slice(4));
        if (m.log[e.uid]) { errs.push(w + ': duplicate uid ' + e.uid); return; }
        m.log[e.uid] = { uid: e.uid, id: e.id, lad: e.lad, title: e.title, ts: e.ts, k: KINDS.includes(e.k) ? e.k : 'session', device: e.device || 'phone' };
      });
    } else if ((mt = /^ladders\/([^/]+)\.json$/.exec(p))) {
      let l; try { l = JSON.parse(files[p]); } catch (x) { errs.push(p + ': is not valid JSON'); continue; }
      if (!l || l.id !== mt[1]) errs.push(p + ': id must equal the file name');
      else if (!Array.isArray(l.nodes)) errs.push(p + ': nodes must be a list');
      else m.ladders[l.id] = l;
    } else if (/^projects\/[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(p)) {
      const r = fmRead(files[p], p, errs); if (!r) continue;
      const rec = r.rec; checkRec(rec, p, errs);
      if (m.projects[rec.id]) { errs.push(p + ': duplicate project id ' + rec.id); continue; }
      m.projects[rec.id] = Object.assign({}, rec, { _slug: p.slice(9, -3), _body: r.body });
    } else if (/^projects\//.test(p)) errs.push(p + ': project files are lowercase a-z, 0-9 and single hyphens, ending in .md');
  }
  if (m.settings.focus && !m.projects[m.settings.focus]) warns.push('settings.json: focus ' + m.settings.focus + ' has no project file');
  for (const id of Object.keys(m.done)) { const t = /^pt:([^:]+):(.+)$/.exec(id); if (t && m.done[id].on) { const r = m.projects[t[1]]; if (r && !(r.tasks || []).some(x => x.id === t[2])) warns.push('progress.json: ' + id + ' is done but project ' + t[1] + ' has no such task'); } }
  return { model: errs.length ? null : m, errors: errs, warnings: warns };
}

/* ---------- merge (spec: Merge rules) ---------- */
function merge(a, b) {
  const o = { log: {}, done: {}, ms: {}, projects: {}, events: {}, dates: {}, settings: {}, ladders: {} }, warn = [];
  Object.assign(o.log, b.log, a.log);                                              // union by uid, first vault wins a clash
  for (const k of ['done', 'ms']) { Object.assign(o[k], b[k], a[k]); for (const id of Object.keys(b[k])) if (id in a[k] && b[k][id].ts > a[k][id].ts) o[k][id] = b[k][id]; }
  for (const k of ['projects', 'events', 'dates']) { Object.assign(o[k], b[k], a[k]); for (const id of Object.keys(b[k])) if (id in a[k] && b[k][id].updated > a[k][id].updated) o[k][id] = b[k][id]; }
  o.settings = b.settings.updated > a.settings.updated ? b.settings : a.settings;
  Object.assign(o.ladders, b.ladders, a.ladders);
  for (const id of Object.keys(a.ladders)) if (id in b.ladders && !same(a.ladders[id], b.ladders[id])) warn.push('ladder ' + id + ' differs on the two sides; this device\'s copy was kept');
  /* two projects must not share one slug */
  const used = new Set();
  for (const r of Object.values(o.projects)) { if (used.has(r._slug)) r._slug = slugify(r.name, used); else used.add(r._slug); }
  o.warn = warn;
  return o;
}

/* a short summary of what an import changes on this device, for the confirm box */
function diff(local, merged) {
  const d = { log: 0, done: 0, undone: 0, projects: 0, changedProjects: 0, events: 0, removedEvents: 0, ladders: 0, settings: false };
  for (const u of Object.keys(merged.log)) if (!(u in local.log)) d.log++;
  for (const id of Object.keys(merged.done)) { const n = merged.done[id], o = local.done[id]; if (!o || o.ts !== n.ts || o.on !== n.on) { if (n.on) d.done++; else if (o && o.on) d.undone++; } }
  for (const id of Object.keys(merged.projects)) { if (!local.projects[id]) d.projects++; else if (!same(local.projects[id], merged.projects[id])) d.changedProjects++; }
  for (const id of Object.keys(merged.events)) { const n = merged.events[id], o = local.events[id]; if (n.deleted) { if (o && !o.deleted) d.removedEvents++; } else if (!o || o.deleted || !same(o, n)) d.events++; }
  for (const id of Object.keys(merged.ladders)) if (!local.ladders[id]) d.ladders++;
  d.settings = !same(local.settings, merged.settings);
  return d;
}

/* ---------- zip (store only to write; store and deflate to read) ---------- */
const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
let CT = null;
function crc32(u8) {
  if (!CT) { CT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CT[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files, prefix, when) {
  const d = when || new Date(), dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const parts = [], cds = []; let off = 0;
  const u16 = (v, n) => { v.push(n & 255, (n >> 8) & 255); }, u32 = (v, n) => { v.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255); };
  for (const p of Object.keys(files).sort()) {
    const name = enc.encode((prefix || '') + p), data = enc.encode(files[p]), crc = crc32(data), h = [];
    u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, tt); u16(h, dd); u32(h, crc); u32(h, data.length); u32(h, data.length); u16(h, name.length); u16(h, 0);
    parts.push(new Uint8Array(h), name, data);
    const c = []; u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, tt); u16(c, dd); u32(c, crc); u32(c, data.length); u32(c, data.length);
    u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, off);
    cds.push(new Uint8Array(c), name);
    off += h.length + name.length + data.length;
  }
  let cdlen = 0; for (const x of cds) cdlen += x.length;
  const e = []; u32(e, 0x06054b50); u16(e, 0); u16(e, 0); u16(e, cds.length / 2); u16(e, cds.length / 2); u32(e, cdlen); u32(e, off); u16(e, 0);
  return new Blob(parts.concat(cds, [new Uint8Array(e)]), { type: 'application/zip' });
}
async function readZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), LIMIT = 8e6;
  let e = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65600); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('That is not a zip file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true), total = 0;
  if (n > 2000) throw new Error('That zip has too many files for a vault');
  const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The zip is damaged');
    const flags = dv.getUint16(p + 8, true), meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/') || /^__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name)) continue;
    if (/(^|\/)\.\.(\/|$)/.test(name) || name[0] === '/' || name.includes('\\')) throw new Error('The zip has an unsafe file name: ' + name);
    if (flags & 1) throw new Error('The zip is password protected');
    total += us; if (total > LIMIT) throw new Error('That zip is too big for a vault');
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    let data = u8.subarray(ds, ds + cs);
    if (meth === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed zips. Re-zip with "store" or use the .json bundle');
      data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else if (meth !== 0) throw new Error('Unsupported zip compression in ' + name);
    files[name] = dec.decode(data);
  }
  return stripTop(files);
}
function stripTop(files) {                                 // buddy-vault/vault.json  ->  vault.json
  const names = Object.keys(files);
  if (names.includes('vault.json')) return files;
  const t = names.find(x => /^[^/]+\/vault\.json$/.test(x)); if (!t) return files;
  const pre = t.slice(0, t.indexOf('/') + 1), out = {};
  for (const k of names) if (k.startsWith(pre)) out[k.slice(pre.length)] = files[k];
  return out;
}
async function readAny(file) {                             // File -> files map
  const buf = await file.arrayBuffer();
  if (new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b) return readZip(buf);
  let j; try { j = JSON.parse(dec.decode(new Uint8Array(buf))); } catch (e) { throw new Error('That is not a vault zip or bundle'); }
  if (!j || j.buddy !== 'vault' || !j.files || typeof j.files !== 'object') throw new Error('That is not a vault zip or bundle');
  for (const k of Object.keys(j.files)) if (typeof j.files[k] !== 'string' || /(^|\/)\.\.(\/|$)/.test(k) || k[0] === '/') throw new Error('The bundle has an unsafe entry: ' + k);
  return stripTop(j.files);
}

const core = { slugify, fmWrite, fmRead, fromS, toS, toFiles, fromFiles, merge, diff, makeZip, readZip, readAny, crc32, same };
if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }
root.BuddyVault = core;

/* ================= the screen: bottom of the Home tools box ================= */
if (typeof document === 'undefined' || typeof S === 'undefined' || !document.getElementById('reset')) return;
const SK = 'buddy.v2.vault', PK = 'buddy.v2.vault.prev';
const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const device = () => { const s = jget(SK); return (s && s.device) || (/Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'phone' : 'laptop'); };
const ymdNow = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const seed = () => (typeof D !== 'undefined' && D && D.projects) || [];
function local() { const s = jget(SK); return fromS(S, { seed: seed(), shadow: s, device: device(), now: Date.now() }); }
function remember(m) {
  const s = jget(SK) || {};
  const dev = {}; for (const u of Object.keys(m.log)) if (m.log[u].device !== device()) dev[u] = m.log[u].device;
  const model = Object.assign({}, m); delete model.log; delete model.warn;
  jset(SK, { v: 1, device: device(), at: Date.now(), model, dev });
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

function exportVault() {
  try {
    const m = local(), files = toFiles(m), chk = fromFiles(Object.assign({}, files));
    if (chk.errors.length) { toast('The vault did not pass its own check: ' + chk.errors[0]); return; }
    download(makeZip(files, 'buddy-vault/'), 'buddy-vault-' + ymdNow() + '.zip');
    remember(m);
    toast('Vault saved: ' + Object.keys(files).length + ' files in a zip.' + (m.warn.length ? ' Note: ' + m.warn[0] : ''));
  } catch (e) { toast('Vault export failed: ' + e.message); }
}
async function importVault(file) {
  let files; try { files = await readAny(file); } catch (e) { toast(e.message); return; }
  const r = fromFiles(files);
  if (r.errors.length) { alert('This vault was not imported. Nothing on this device changed.\n\n' + r.errors.slice(0, 8).join('\n') + (r.errors.length > 8 ? '\n…and ' + (r.errors.length - 8) + ' more' : '')); return; }
  const mine = local(), merged = merge(mine, r.model), d = diff(mine, merged), n = d.log + d.done + d.undone + d.projects + d.changedProjects + d.events + d.removedEvents + d.ladders + (d.settings ? 1 : 0);
  if (!n) { toast('Nothing new in that vault: this device already has everything in it.'); remember(merged); return; }
  const parts = [];
  if (d.log) parts.push(d.log + ' new session' + (d.log > 1 ? 's' : ''));
  if (d.done) parts.push(d.done + ' topic' + (d.done > 1 ? 's' : '') + ' marked done');
  if (d.undone) parts.push(d.undone + ' topic' + (d.undone > 1 ? 's' : '') + ' set back to open');
  if (d.projects) parts.push(d.projects + ' new project' + (d.projects > 1 ? 's' : ''));
  if (d.changedProjects) parts.push(d.changedProjects + ' project' + (d.changedProjects > 1 ? 's' : '') + ' updated');
  if (d.events) parts.push(d.events + ' event' + (d.events > 1 ? 's' : '') + ' added or changed');
  if (d.removedEvents) parts.push(d.removedEvents + ' event' + (d.removedEvents > 1 ? 's' : '') + ' removed');
  if (d.ladders) parts.push(d.ladders + ' roadmap' + (d.ladders > 1 ? 's' : ''));
  if (d.settings) parts.push('focus or goal changed');
  const w = r.warnings.concat(merged.warn);
  if (!confirm('Merge this vault into this device?\n\n' + parts.join('\n') + (w.length ? '\n\nNotes:\n' + w.slice(0, 4).join('\n') : '') + '\n\nNothing is deleted that you did not delete on the other side. You can undo this import right after.')) return;
  if (!jset(PK, { at: Date.now(), S })) toast('Could not keep an undo copy (storage is full). Continuing.');
  S = toS(merged, S, seed()); save(); remember(merged);
  toast('Vault merged. Reloading.'); setTimeout(() => location.reload(), 700);
}
function undoImport() {
  const p = jget(PK); if (!p || !p.S) { toast('Nothing to undo'); return; }
  if (!confirm('Put this device back to how it was before the last vault import (' + new Date(p.at).toLocaleString() + ')? Anything done since then is lost.')) return;
  S = Object.assign(blank(), p.S); S.tm = null; save();
  try { localStorage.removeItem(PK); localStorage.removeItem(SK); } catch (e) { }
  toast('Import undone. Reloading.'); setTimeout(() => location.reload(), 700);
}
const foot = document.getElementById('reset').parentNode;
const row = document.createElement('div'); row.className = 'foot';
const mkb = (t, f) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = f; return b; };
const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,.json,application/zip,application/json'; inp.hidden = true;
inp.onchange = () => { const f = inp.files[0]; if (f) importVault(f); inp.value = ''; };
row.append(mkb('Vault export', exportVault), mkb('Vault import', () => inp.click()), inp);
if (jget(PK)) row.append(mkb('Undo last import', undoImport));
(foot.nextSibling && foot.nextSibling.classList && foot.nextSibling.classList.contains('foot') ? foot.nextSibling : foot).after(row);
})(typeof window !== 'undefined' ? window : globalThis);
