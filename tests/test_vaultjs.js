/* Tests for vault.js (the app side of the vault). Run: node test_vaultjs.js
   Same fixture and scenarios as test_vault.py (the Python tools), so the two sides are held to the same spec. */
'use strict';
const assert = require('assert');
const V = require('../public/app/vault.js');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const T0 = 1793500000000, DAY = 86400000;
const SEED = [
  { id: 'arglasses', name: 'AR glasses', priority: 3, status: 'active', needs: ['m2', 'v1', 'c1'], note: 'Optics and tracking pages in AR/VR Resources are not imported yet.' },
  { id: 'buddy', name: 'Roadmap Buddy', priority: 2, status: 'active', needs: ['py1', 'py2', 'py3'] }];
const mkS = () => JSON.parse(JSON.stringify({
  done: { c1: T0 - 5 * DAY, 'pt:u1:t1': T0 - DAY, hack1: T0 - 2 * DAY }, later: { c2: T0 + DAY }, last: { c: T0 - DAY }, pin: null, badges: { first: T0 }, lvl: 2,
  ms: { 'm-boss1': T0 - 3 * DAY },
  log: [
    { id: 'c1', lad: 'c', title: 'Pointers', ts: T0 - 5 * DAY, k: 'topic' },
    { id: 'c2', lad: 'c', title: 'Structs', ts: T0 - 2 * DAY, k: 'session' },
    { id: 'c2', lad: 'c', title: 'Structs', ts: T0 - 2 * DAY, k: 'session' },
    { id: 'hack1', lad: 'hack', title: 'Recon', ts: T0 - 40 * DAY, k: 'tiny' }],
  projects: [
    { id: 'u1', name: 'Roadmap Buddy', goal: 'Ship it', done: 'Repo and demo', deadline: '2027-01-15', priority: 2, type: 'web', needs: ['c1'], ladders: ['hack'], status: 'active',
      tasks: [{ id: 't1', t: 'Write spec' }, { id: 't2', t: 'Build tool', min: 45 }],
      ms: [{ id: 'm1', t: 'Spec done', date: '2026-11-10', done: true }, { id: 'm2', t: 'Demo', date: '', done: false }], next: 'finish validator', state: 'active' },
    { id: 'u2', name: 'Café & Münze: Ünïcode!', goal: '', done: '', deadline: '', priority: 1, type: 'other', needs: [], ladders: [], status: 'paused', tasks: [], state: 'done',
      proof: { url: 'https://example.com/post', note: 'learned to ship small' }, doneAt: T0 - 9 * DAY },
    { id: 'u3', name: 'Roadmap Buddy', goal: 'same name as u1', done: '', deadline: '', priority: 3, type: 'game', needs: [], ladders: [], status: 'paused', tasks: [], state: 'blocked', why: 'display arrives on the 12th' }],
  fpx: { arglasses: { state: 'active', next: 'wire the I2C test', ms: [{ id: 'm9', t: 'First light', date: '2026-12-01', done: false }] } },
  focus: 'u1',
  events: [{ id: 'e1', name: 'CTF night', type: 'ctf', date: '2026-11-14', end: '2026-11-15', time: '18:00', etime: '02:00', note: 'team of 3' },
    { id: 'e2', name: 'IELTS mock', type: 'exam', date: '2026-12-05' }],
  evDate: { gsoc27: '2027-03-31' }, planner: 'rules', hideStrip: true, goal: 'gsoc27', tm: null,
  ladders: [{ id: 'hack', name: 'Hacker', floor: 2, nodes: [{ id: 'hack1', t: 'Recon', min: 25, needs: [] }, { id: 'hack2', t: 'Scanning', min: 25, needs: ['hack1'] }] }]
}));
const ctx = (shadow, device, now) => ({ seed: SEED, shadow: shadow || null, device: device || 'phone', now: now || T0 });
const shadowOf = (m, device) => { const s = Object.assign({}, m); delete s.log; delete s.warn; const dev = {}; for (const u of Object.keys(m.log)) if (m.log[u].device !== device) dev[u] = m.log[u].device; return { model: s, dev }; };
const files = m => V.toFiles(m);
const load = f => { const r = V.fromFiles(Object.assign({}, f)); assert.deepStrictEqual(r.errors, []); return r.model; };

let n = 0, bad = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); } };
const edit = (f, p, fn) => { f[p] = fn(f[p]); return f; };
const errs = f => V.fromFiles(Object.assign({}, f)).errors;
const has = (f, text) => { const e = errs(f); assert.ok(e.some(x => x.includes(text)), text + ' not in ' + JSON.stringify(e)); };

(async () => {
  const m0 = V.fromS(mkS(), ctx()), F0 = files(m0);

  await t('export is valid and has the spec layout', () => {
    const r = V.fromFiles(Object.assign({}, F0)); assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(r.warnings, []);
    for (const p of ['vault.json', 'progress.json', 'settings.json', 'events/events.json', 'ladders/hack.json']) assert.ok(p in F0, p);
    assert.strictEqual(Object.keys(F0).filter(k => k.startsWith('log/')).length, 2);
    const pr = Object.keys(F0).filter(k => k.startsWith('projects/')).sort();
    assert.strictEqual(pr.length, 5);
    for (const s of ['projects/roadmap-buddy.md', 'projects/roadmap-buddy-2.md', 'projects/roadmap-buddy-3.md', 'projects/cafe-munze-unicode.md', 'projects/ar-glasses.md']) assert.ok(pr.includes(s), s + ' in ' + pr);
    assert.ok(F0['projects/ar-glasses.md'].includes('Optics and tracking pages'));
    assert.strictEqual(V.slugify('!!!', new Set()), 'project');
  });
  await t('front matter is key: JSON and the body is kept', () => {
    const f = F0['projects/cafe-munze-unicode.md'];
    assert.ok(f.startsWith('---\nid: "u2"\norigin: "own"\nname: "Café & Münze: Ünïcode!"\nstate: "done"\n'), f);
    assert.ok(f.includes('proof_url: "https://example.com/post"'));
  });
  await t('log uids are unique and old lines keep their fields', () => {
    assert.strictEqual(Object.keys(m0.log).length, 4);
    assert.ok((T0 - 2 * DAY) + '-c2' in m0.log && (T0 - 2 * DAY) + '-c2-2' in m0.log);
    for (const e of Object.values(m0.log)) assert.strictEqual(e.device, 'phone');
  });
  await t('round trip S -> vault -> S keeps what the app needs', () => {
    const S0 = mkS(), S1 = V.toS(load(F0), Object.assign(mkS(), { done: {}, log: [], projects: [], events: [], ladders: [] }), SEED);
    assert.deepStrictEqual(S1.done, S0.done); assert.deepStrictEqual(S1.ms, S0.ms);
    assert.deepStrictEqual(S1.log, S0.log.slice().sort((a, b) => a.ts - b.ts));
    assert.deepStrictEqual(S1.events.map(e => e.id), ['e1', 'e2']);
    assert.deepStrictEqual(S1.events[0], S0.events[0]);
    assert.deepStrictEqual(S1.events[1], { id: 'e2', name: 'IELTS mock', type: 'exam', date: '2026-12-05', end: '', time: '', etime: '', note: '' });
    assert.deepStrictEqual(S1.evDate, S0.evDate); assert.strictEqual(S1.focus, 'u1'); assert.strictEqual(S1.goal, 'gsoc27');
    assert.deepStrictEqual(S1.ladders, S0.ladders);
    assert.strictEqual(S1.last.c, T0 - 2 * DAY); assert.strictEqual(S1.last.hack, T0 - 40 * DAY);
    const by = Object.fromEntries(S1.projects.map(p => [p.id, p]));
    for (const p0 of S0.projects) {
      const a = by[p0.id], b = Object.assign({}, p0);
      assert.strictEqual(a.name, b.name); assert.strictEqual(a.state, b.state); assert.strictEqual(a.status, b.status);
      assert.deepStrictEqual(a.proof, b.proof); assert.deepStrictEqual(a.ms, b.ms); assert.deepStrictEqual(a.tasks, b.tasks); assert.strictEqual(a.why, b.why);
      assert.strictEqual(a.next, b.next); assert.strictEqual(a.doneAt, b.doneAt); assert.strictEqual(a.deadline, b.deadline); assert.deepStrictEqual(a.needs, b.needs);
    }
    assert.deepStrictEqual(S1.fpx.arglasses, { next: S0.fpx.arglasses.next, ms: S0.fpx.arglasses.ms });   // a bare 'active' is not stored
    assert.ok(!('buddy' in S1.fpx), 'a bare active built-in project adds nothing to fpx');
    // device-only keys untouched
    assert.strictEqual(S1.planner, 'rules'); assert.strictEqual(S1.hideStrip, true); assert.deepStrictEqual(S1.later, S0.later); assert.strictEqual(S1.tm, null);
    // and a second export from the restored S is identical (updated stays: nothing changed)
    const sh = shadowOf(load(F0), 'phone'), F2 = files(V.fromS(S1, ctx(sh, 'phone', T0 + 99999)));
    assert.deepStrictEqual(F2, F0);
  });
  await t('a changed fact gets a new updated, an unchanged one keeps its date', () => {
    const sh = shadowOf(m0, 'phone'), S = mkS(); S.projects[0].next = 'changed'; S.events[0].note = 'edited';
    const m = V.fromS(S, ctx(sh, 'phone', T0 + 5000));
    assert.strictEqual(m.projects.u1.updated, T0 + 5000); assert.strictEqual(m.projects.u2.updated, T0);
    assert.strictEqual(m.events.e1.updated, T0 + 5000); assert.strictEqual(m.events.e2.updated, T0);
    assert.strictEqual(m.settings.updated, T0);
  });
  await t('undo of a topic becomes on:false, a deleted event becomes a tombstone', () => {
    const sh = shadowOf(m0, 'phone'), S = mkS(); delete S.done.c1; S.events = S.events.filter(e => e.id !== 'e2');
    const m = V.fromS(S, ctx(sh, 'phone', T0 + 7000));
    assert.deepStrictEqual(m.done.c1, { ts: T0 + 7000, on: false });
    assert.deepStrictEqual(m.events.e2, { id: 'e2', deleted: true, updated: T0 + 7000 });
    const F = files(m); assert.deepStrictEqual(errs(F), []);
    assert.ok(!V.toS(load(F), mkS(), SEED).events.some(e => e.id === 'e2'));
  });
  await t('a never-touched built-in project does not beat real data on another device', () => {
    const S = mkS(); S.fpx = {};                                   // fresh laptop: built-ins at their defaults, no shadow
    const lap = V.fromS(S, ctx(null, 'laptop', T0 + 99999)), ph = V.fromS(mkS(), ctx(null, 'phone', T0));
    assert.strictEqual(lap.projects.arglasses.updated, 0); assert.strictEqual(lap.projects.buddy.updated, 0);
    const m = V.merge(lap, ph); assert.strictEqual(m.projects.arglasses.next, 'wire the I2C test');
    const back = V.merge(ph, lap); assert.strictEqual(back.projects.arglasses.next, 'wire the I2C test');
    const S2 = V.toS(m, S, SEED); assert.strictEqual(S2.fpx.arglasses.next, 'wire the I2C test');
  });
  await t('first export on an empty device does not carry a fresh settings date', () => {
    const m = V.fromS({ log: [], done: {}, ms: {}, projects: [], events: [], evDate: {}, focus: null, goal: null, ladders: [] }, ctx());
    assert.strictEqual(m.settings.updated, 0);
  });
  await t('unknown own-project key is reported, not lost silently', () => {
    const S = mkS(); S.projects[0].colour = 'teal';
    const m = V.fromS(S, ctx()); assert.ok(m.warn.some(w => w.includes('colour')), m.warn);
  });

  /* validator */
  const P = 'projects/roadmap-buddy.md';
  await t('validator: done without proof', () => { const f = edit(Object.assign({}, F0), P, x => x.replace('state: "active"', 'state: "done"')); has(f, 'Done project needs proof_url'); has(f, 'needs one line in "learned"'); });
  await t('validator: bad state, priority, deadline', () => { const f = edit(Object.assign({}, F0), P, x => x.replace('state: "active"', 'state: "finished"').replace('priority: 2', 'priority: 5').replace('"2027-01-15"', '"2026-13-40"')); has(f, 'state must be one of'); has(f, 'priority must be 1, 2 or 3'); has(f, 'deadline must be null or YYYY-MM-DD'); });
  await t('validator: duplicate project id', () => { const f = edit(Object.assign({}, F0), 'projects/roadmap-buddy-3.md', x => x.replace(/^id: ".*"$/m, 'id: "u1"')); const f2 = V.fromFiles(Object.assign({}, f)).errors; assert.ok(f2.some(e => e.includes('duplicate project id'))); });
  await t('validator: front matter must be JSON', () => { const f = edit(Object.assign({}, F0), P, x => x.replace('"Roadmap Buddy"', 'Roadmap Buddy')); has(f, 'is not JSON'); });
  await t('validator: duplicate uid, wrong month, unknown kind', () => {
    const lp = Object.keys(F0).find(k => k.startsWith('log/')), line = F0[lp].split('\n')[0];
    const f = Object.assign({}, F0); f[lp] += line + '\n'; has(f, 'duplicate uid');
    const g = Object.assign({}, F0); g['log/2020-01.jsonl'] = line + '\n'; has(g, 'but the line is in 2020-01.jsonl');
    const h = Object.assign({}, F0); h[lp] += JSON.stringify(Object.assign(JSON.parse(line), { uid: 'x-1', k: 'mark' })) + '\n'; has(h, 'k must be one of');
  });
  await t('validator: event errors', () => {
    const f = edit(Object.assign({}, F0), 'events/events.json', x => { const j = JSON.parse(x); j.events[0].date = 'yesterday'; j.events[0].time = '6pm'; j.events[1].end = '2026-01-01'; return JSON.stringify(j); });
    has(f, 'date must be YYYY-MM-DD'); has(f, 'time must be HH:MM'); has(f, 'end must be a date on or after the start');
  });
  await t('validator: secrets are refused', () => {
    const f = edit(Object.assign({}, F0), P, x => x + '\nmy key is ghp_' + 'a'.repeat(30) + '\n'); has(f, 'holds a secret');
    const g = edit(Object.assign({}, F0), 'settings.json', x => { const j = JSON.parse(x); j.token = 'abc'; return JSON.stringify(j); }); has(g, 'holds a secret');
  });
  await t('validator: progress shape, schema, ladder file name', () => {
    const f = edit(Object.assign({}, F0), 'progress.json', x => { const j = JSON.parse(x); j.done.c9 = 5; j.schema_version = 2; return JSON.stringify(j); });
    has(f, 'must be {"ts": ms, "on": true/false}'); has(f, 'schema_version must be 1');
    const g = Object.assign({}, F0); g['ladders/other.json'] = g['ladders/hack.json']; delete g['ladders/hack.json']; has(g, 'id must equal the file name');
  });
  await t('validator: focus and task warnings', () => {
    const f = edit(Object.assign({}, F0), 'settings.json', x => { const j = JSON.parse(x); j.focus = 'gone'; return JSON.stringify(j); });
    const r = V.fromFiles(f); assert.deepStrictEqual(r.errors, []); assert.ok(r.warnings.some(w => w.includes('focus gone has no project file')));
    const g = edit(Object.assign({}, F0), 'progress.json', x => { const j = JSON.parse(x); j.done['pt:u1:zzz'] = { ts: 5, on: true }; return JSON.stringify(j); });
    assert.ok(V.fromFiles(g).warnings.some(w => w.includes('pt:u1:zzz')));
  });

  /* merge: phone + laptop */
  const mkPhone = () => {
    const m = load(F0);
    for (let i = 0; i < 3; i++) m.log['p' + i] = { uid: 'p' + i, id: 'c3', lad: 'c', title: 'Arrays', ts: T0 + (i + 1) * 3600000, k: 'session', device: 'phone' };
    m.done.c2 = { ts: T0 + 5000, on: true }; m.projects.u1.next = 'phone note'; m.projects.u1.updated = T0 + 1000; m.events.e1.note = 'phone edit'; m.events.e1.updated = T0 + 1000; return m;
  };
  const mkLaptop = () => {
    const m = load(F0);
    for (let i = 0; i < 2; i++) m.log['l' + i] = { uid: 'l' + i, id: 'py1', lad: 'py', title: 'Loops', ts: T0 + 7200000 + i * 3600000, k: 'topic', device: 'laptop' };
    m.done.hack1 = { ts: T0 + 9000, on: false }; m.projects.u1.next = 'laptop old note'; m.projects.u1.updated = T0 + 500;
    m.events.e2 = { id: 'e2', deleted: true, updated: T0 + 2000 };
    m.projects.u9 = { id: 'u9', origin: 'own', name: 'Laptop idea', state: 'idea', priority: 2, type: null, goal: '', done_looks_like: '', deadline: null, needs: [], ladders: [], tasks: [], milestones: [], blocked_by: '', next: '', proof_url: '', learned: '', done_at: null, updated: T0 + 100, _slug: 'laptop-idea', _body: '' };
    m.ladders.py = { id: 'py', name: 'Python', nodes: [{ id: 'py1', t: 'Loops' }] }; return m;
  };
  await t('merge result: nothing lost, newest wins, tombstone beats old copy', () => {
    const m = V.merge(mkPhone(), mkLaptop());
    assert.deepStrictEqual(errs(files(m)), []);
    assert.strictEqual(Object.keys(m.log).length, 4 + 3 + 2);
    assert.deepStrictEqual(m.done.c2, { ts: T0 + 5000, on: true }); assert.strictEqual(m.done.hack1.on, false);
    assert.strictEqual(m.projects.u1.next, 'phone note'); assert.ok('u9' in m.projects); assert.strictEqual(m.events.e1.note, 'phone edit');
    assert.ok(m.events.e2.deleted); assert.ok('py' in m.ladders && 'hack' in m.ladders);
  });
  await t('merge is commutative and repeatable', () => {
    const ab = V.merge(mkPhone(), mkLaptop()), ba = V.merge(mkLaptop(), mkPhone());
    for (const k of ['log', 'done', 'ms', 'events', 'dates', 'settings', 'ladders']) assert.deepStrictEqual(ab[k], ba[k], k);
    for (const id of Object.keys(ab.projects)) assert.ok(V.same(ab.projects[id], ba.projects[id]), id);
    const again = V.merge(ab, mkPhone());
    for (const k of ['log', 'done', 'ms', 'events', 'dates', 'settings']) assert.deepStrictEqual(again[k], ab[k], k);
  });
  await t('merged vault gives the app a clean S', () => {
    const S = V.toS(V.merge(mkPhone(), mkLaptop()), mkS(), SEED);
    assert.strictEqual(S.log.length, 9); assert.ok(!('hack1' in S.done)); assert.ok('c2' in S.done); assert.deepStrictEqual(S.events.map(e => e.id), ['e1']);
    assert.ok(S.projects.some(p => p.id === 'u9' && p.status === 'paused'));
    assert.strictEqual(S.last.py, T0 + 3 * 3600000);
  });
  await t('diff counts what an import changes', () => {
    const local = V.fromS(mkS(), ctx()), merged = V.merge(local, mkLaptop()), d = V.diff(local, merged);
    assert.strictEqual(d.log, 2); assert.strictEqual(d.undone, 1); assert.strictEqual(d.projects, 1); assert.strictEqual(d.removedEvents, 1); assert.strictEqual(d.ladders, 1);
    assert.strictEqual(V.diff(local, local).log, 0);
  });
  await t('two merged projects never share a slug', () => {
    const a = load(F0), b = load(F0); b.projects.u1._slug = 'taken'; a.projects.u2._slug = 'taken'; b.projects.u3 = Object.assign({}, b.projects.u3, { _slug: 'taken', updated: 1 });
    const m = V.merge(a, b), slugs = Object.values(m.projects).map(p => p._slug); assert.strictEqual(new Set(slugs).size, slugs.length);
  });

  /* zip */
  await t('zip: write then read gives the same files (and unicode names/text)', async () => {
    const z = V.makeZip(F0, 'buddy-vault/'), back = await V.readZip(await z.arrayBuffer());
    assert.deepStrictEqual(back, F0);
  });
  await t('zip: reads a deflated zip made by another tool and strips the top folder', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vz-')), root = path.join(d, 'myvault');
    for (const p of Object.keys(F0)) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), F0[p]); }
    const zp = path.join(d, 'v.zip');
    const py = process.platform === 'win32' ? 'python' : 'python3';
    execFileSync(py, ['-I', '-c', 'import zipfile,os,sys\nr,z=sys.argv[1],sys.argv[2]\nzf=zipfile.ZipFile(z,"w",zipfile.ZIP_DEFLATED)\nfor b,_,fs_ in os.walk(r):\n  for f in fs_:\n    p=os.path.join(b,f); zf.write(p, os.path.join("myvault", os.path.relpath(p,r).replace(chr(92),"/")))\nzf.close()', root, zp]);
    const buf = fs.readFileSync(zp), back = await V.readZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    assert.deepStrictEqual(back, F0);
  });
  await t('zip: unsafe names and non-zip input are refused', async () => {
    const z = V.makeZip({ '../evil.txt': 'x', 'vault.json': '{}' }, '');
    await assert.rejects(V.readZip(await z.arrayBuffer()), /unsafe/);
    await assert.rejects(V.readZip(new TextEncoder().encode('hello world, not a zip file at all').buffer), /not a zip/);
  });
  await t('readAny: bundle json works, bad json is refused', async () => {
    const f = new Blob([JSON.stringify({ buddy: 'vault', files: F0 })]); assert.deepStrictEqual(await V.readAny(f), F0);
    await assert.rejects(V.readAny(new Blob(['{"a":1}'])), /not a vault/);
    await assert.rejects(V.readAny(new Blob([JSON.stringify({ buddy: 'vault', files: { '../x': 'y' } })])), /unsafe/);
  });

  console.log('\n' + n + ' passed, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})();
