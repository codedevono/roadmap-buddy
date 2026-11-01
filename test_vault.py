import copy
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vault as V

T0 = 1793500000000          # 2026-11-01 (ms)
DAY = 86400000

SEED = {'projects': [{'id': 'ar', 'name': 'AR glasses', 'priority': 3, 'needs': ['c1', 'o1'], 'goal': 'Prototype'}]}

BACKUP = {
    'buddy': 'backup', 'v': 1, 'at': T0,
    'S': {
        'done': {'c1': T0 - 5 * DAY, 'pt:u1:t1': T0 - DAY, 'hack1': T0 - 2 * DAY},
        'later': {'c2': T0 + DAY}, 'last': {'c': T0 - DAY}, 'pin': None, 'badges': {'first': T0}, 'lvl': 2,
        'ms': {'m-boss1': T0 - 3 * DAY},
        'log': [
            {'id': 'c1', 'lad': 'c', 'title': 'Pointers', 'ts': T0 - 5 * DAY, 'k': 'topic'},
            {'id': 'c2', 'lad': 'c', 'title': 'Structs', 'ts': T0 - 2 * DAY, 'k': 'session'},
            {'id': 'c2', 'lad': 'c', 'title': 'Structs', 'ts': T0 - 2 * DAY, 'k': 'session'},      # same ts and id twice
            {'id': 'hack1', 'lad': 'hack', 'title': 'Recon', 'ts': T0 - 40 * DAY, 'k': 'tiny'},      # an older month
        ],
        'projects': [
            {'id': 'u1', 'name': 'Roadmap Buddy', 'goal': 'Ship it', 'done': 'Repo and demo', 'deadline': '2027-01-15',
             'priority': 2, 'type': 'web', 'needs': ['c1'], 'ladders': ['hack'], 'status': 'active',
             'tasks': [{'id': 't1', 't': 'Write spec'}, {'id': 't2', 't': 'Build tool', 'min': 45}],
             'ms': [{'id': 'm1', 't': 'Spec done', 'date': '2026-11-10', 'done': True},
                    {'id': 'm2', 't': 'Demo', 'date': '', 'done': False}],
             'next': 'finish validator', 'state': 'active'},
            {'id': 'u2', 'name': 'Café & Münze: Ünïcode!', 'goal': '', 'done': '', 'deadline': '', 'priority': 1,
             'type': 'other', 'needs': [], 'ladders': [], 'status': 'paused', 'tasks': [], 'state': 'done',
             'proof': {'url': 'https://example.com/post', 'note': 'learned to ship small'}, 'doneAt': T0 - 9 * DAY},
            {'id': 'u3', 'name': 'Roadmap Buddy', 'goal': 'same name as u1', 'done': '', 'deadline': '', 'priority': 3,
             'type': 'game', 'needs': [], 'ladders': [], 'status': 'paused', 'tasks': [], 'state': 'blocked',
             'why': 'display arrives on the 12th'},
        ],
        'fpx': {'ar': {'state': 'active', 'next': 'wire the I2C test',
                       'ms': [{'id': 'm9', 't': 'First light', 'date': '2026-12-01', 'done': False}]}},
        'focus': 'u1',
        'events': [{'id': 'e1', 'name': 'CTF night', 'type': 'ctf', 'date': '2026-11-14', 'end': '2026-11-15',
                    'time': '18:00', 'etime': '02:00', 'note': 'team of 3'},
                   {'id': 'e2', 'name': 'IELTS mock', 'type': 'exam', 'date': '2026-12-05'}],
        'evDate': {'gsoc27': '2027-03-31'},
        'planner': 'rules', 'hideStrip': True, 'goal': 'gsoc27', 'tm': None,
        'ladders': [{'id': 'hack', 'name': 'Hacker', 'floor': 2,
                     'nodes': [{'id': 'hack1', 't': 'Recon', 'min': 25, 'needs': []},
                               {'id': 'hack2', 't': 'Scanning', 'min': 25, 'needs': ['hack1']}]}],
    },
}


def mk(tmp, name='v'):
    d = os.path.join(tmp, name)
    V.import_backup(copy.deepcopy(BACKUP), d, SEED, 'phone')
    return d


def tree(d):
    out = {}
    for root, _, files in os.walk(d):
        for fn in files:
            p = os.path.join(root, fn)
            with open(p, encoding='utf-8') as f:
                out[os.path.relpath(p, d)] = f.read()
    return out


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class ImportExport(Base):
    def test_import_is_valid(self):
        d = mk(self.tmp)
        E, W = V.validate(d)
        self.assertEqual(E, [], E)
        self.assertEqual(W, [], W)

    def test_files_exist(self):
        d = mk(self.tmp)
        t = tree(d)
        self.assertIn('vault.json', t)
        self.assertIn('progress.json', t)
        self.assertIn('settings.json', t)
        self.assertIn('events/events.json', t)
        self.assertIn('ladders/hack.json', t)
        months = sorted(k for k in t if k.startswith('log/'))
        self.assertEqual(len(months), 2, months)               # the 40-day-old line sits in an older month
        projects = sorted(k for k in t if k.startswith('projects/'))
        self.assertEqual(len(projects), 4)                     # u1, u2, u3 and the builtin ar
        self.assertEqual(len(set(projects)), 4)
        self.assertIn('projects/roadmap-buddy.md', projects)
        self.assertIn('projects/roadmap-buddy-2.md', projects)  # same name: unique slug, ids stay the identity
        self.assertIn('projects/cafe-munze-unicode.md', projects)  # accents folded to plain letters
        self.assertEqual(V.slugify('!!!', set()), 'project')

    def test_log_uids_unique_and_old_lines_keep_fields(self):
        d = mk(self.tmp)
        m = V.load_vault(d)
        self.assertEqual(len(m['log']), 4)
        for e in m['log'].values():
            self.assertEqual(e['device'], 'phone')
        self.assertIn('%d-c2' % (T0 - 2 * DAY), m['log'])
        self.assertIn('%d-c2-2' % (T0 - 2 * DAY), m['log'])

    def test_roundtrip_keeps_everything_the_app_needs(self):
        d = mk(self.tmp)
        out = os.path.join(self.tmp, 'back.json')
        V.export_backup(d, out)
        b = json.load(open(out, encoding='utf-8'))
        S, S0 = b['S'], BACKUP['S']
        self.assertEqual(b['buddy'], 'backup')
        self.assertEqual(b['v'], 1)
        self.assertEqual(S['done'], S0['done'])
        self.assertEqual(S['ms'], S0['ms'])
        self.assertEqual(S['log'], sorted(S0['log'], key=lambda e: e['ts']))      # same lines, same keys, no uid/device
        self.assertEqual(sorted(S['events'], key=lambda e: e['id']),
                         [{'id': 'e1', 'name': 'CTF night', 'type': 'ctf', 'date': '2026-11-14', 'end': '2026-11-15',
                           'time': '18:00', 'etime': '02:00', 'note': 'team of 3'},
                          {'id': 'e2', 'name': 'IELTS mock', 'type': 'exam', 'date': '2026-12-05', 'end': '',
                           'time': '', 'etime': '', 'note': ''}])
        self.assertEqual(S['evDate'], S0['evDate'])
        self.assertEqual(S['focus'], 'u1')
        self.assertEqual(S['goal'], 'gsoc27')
        self.assertEqual(S['ladders'], S0['ladders'])
        # projects: compare through the same record function (priority, state, proof, milestones, notes all survive)
        got = {p['id']: p for p in S['projects']}
        for p0 in S0['projects']:
            self.assertEqual(V.project_record(got[p0['id']], got[p0['id']], 'own', 0),
                             V.project_record(p0, p0, 'own', 0), p0['id'])
        self.assertEqual(V.project_record(SEED['projects'][0], S['fpx']['ar'], 'builtin', 0),
                         V.project_record(SEED['projects'][0], S0['fpx']['ar'], 'builtin', 0))
        # keys a restore needs even when the app replaces S outright
        for k in V.BLANK_S:
            self.assertIn(k, S, k)
        self.assertEqual(S['last']['c'], T0 - 2 * DAY)          # derived from the log
        self.assertEqual(S['last']['hack'], T0 - 40 * DAY)

    def test_second_import_is_byte_identical(self):
        d1 = mk(self.tmp, 'v1')
        out = os.path.join(self.tmp, 'back.json')
        V.export_backup(d1, out)
        d2 = os.path.join(self.tmp, 'v2')
        V.import_backup(json.load(open(out, encoding='utf-8')), d2, SEED, 'phone')
        a, b = tree(d1), tree(d2)
        self.assertEqual(sorted(a), sorted(b))
        for k in a:
            if k.startswith('projects/') or k.startswith('events/') or k == 'settings.json':
                continue                                        # `updated` differs: it carries the backup time
            self.assertEqual(a[k], b[k], k)

    def test_unknown_project_key_is_reported_not_lost_silently(self):
        b = copy.deepcopy(BACKUP)
        b['S']['projects'][0]['colour'] = 'teal'
        warns = V.import_backup(b, os.path.join(self.tmp, 'w'), SEED)
        self.assertTrue(any('colour' in w for w in warns), warns)

    def test_builtin_without_seed_warns(self):
        warns = V.import_backup(copy.deepcopy(BACKUP), os.path.join(self.tmp, 'n'), None)
        self.assertTrue(any('ar' in w and 'no projects.json' in w for w in warns), warns)


class Validator(Base):
    def setUp(self):
        super().setUp()
        self.d = mk(self.tmp)

    def edit_project(self, slug, fn):
        p = os.path.join(self.d, 'projects', slug + '.md')
        r, body = V.fm_read(open(p, encoding='utf-8').read())
        fn(r)
        open(p, 'w', encoding='utf-8').write(V.fm_write(r, body))

    def errors(self):
        return V.validate(self.d)[0]

    def has(self, text):
        self.assertTrue(any(text in e for e in self.errors()), (text, self.errors()))

    def test_done_without_proof(self):
        self.edit_project('roadmap-buddy', lambda r: r.update(state='done', proof_url='', learned=''))
        self.has('Done project needs proof_url')
        self.has('needs one line in "learned"')

    def test_bad_state_priority_deadline(self):
        self.edit_project('roadmap-buddy', lambda r: r.update(state='finished', priority=5, deadline='2026-13-40'))
        self.has('state must be one of')
        self.has('priority must be 1, 2 or 3')
        self.has('deadline must be null or YYYY-MM-DD')

    def test_duplicate_project_id(self):
        self.edit_project('roadmap-buddy-2', lambda r: r.update(id='u1'))
        self.has('duplicate project id u1')

    def test_front_matter_must_be_json(self):
        p = os.path.join(self.d, 'projects', 'roadmap-buddy.md')
        t = open(p, encoding='utf-8').read().replace('"Roadmap Buddy"', 'Roadmap Buddy', 1)
        open(p, 'w', encoding='utf-8').write(t)
        self.has('is not JSON')

    def test_log_duplicate_uid_and_wrong_month(self):
        f = [x for x in os.listdir(os.path.join(self.d, 'log'))][0]
        p = os.path.join(self.d, 'log', f)
        lines = open(p, encoding='utf-8').read().splitlines()
        open(p, 'a', encoding='utf-8').write(lines[0] + '\n')
        self.has('duplicate uid')
        wrong = os.path.join(self.d, 'log', '2020-01.jsonl')
        open(wrong, 'w', encoding='utf-8').write(lines[0] + '\n')
        self.has('but the line is in 2020-01.jsonl')

    def test_log_unknown_kind(self):
        f = os.path.join(self.d, 'log', sorted(os.listdir(os.path.join(self.d, 'log')))[-1])
        e = json.loads(open(f, encoding='utf-8').readline())
        e.update(uid='x-1', k='mark')
        open(f, 'a', encoding='utf-8').write(json.dumps(e) + '\n')
        self.has('k must be one of')

    def test_event_errors(self):
        p = os.path.join(self.d, 'events', 'events.json')
        j = json.load(open(p, encoding='utf-8'))
        j['events'][0].update(date='yesterday', time='6pm')
        j['events'][1].update(end='2026-01-01')
        json.dump(j, open(p, 'w', encoding='utf-8'))
        self.has('date must be YYYY-MM-DD')
        self.has('time must be HH:MM')
        self.has('end must be a date on or after the start')

    def test_secret_is_rejected(self):
        p = os.path.join(self.d, 'projects', 'roadmap-buddy.md')
        open(p, 'a', encoding='utf-8').write('\nmy key is ghp_' + 'a' * 30 + '\n')
        self.has('holds a secret')
        p2 = os.path.join(self.d, 'settings.json')
        j = json.load(open(p2, encoding='utf-8'))
        j['token'] = 'abc'
        json.dump(j, open(p2, 'w', encoding='utf-8'))
        self.has('holds a secret')

    def test_progress_shape_and_missing_schema(self):
        p = os.path.join(self.d, 'progress.json')
        j = json.load(open(p, encoding='utf-8'))
        j['done']['c9'] = 5
        j['schema_version'] = 2
        json.dump(j, open(p, 'w', encoding='utf-8'))
        self.has('must be {"ts": ms, "on": true/false}')
        self.has('schema_version must be 1')

    def test_focus_points_nowhere_is_a_warning(self):
        p = os.path.join(self.d, 'settings.json')
        j = json.load(open(p, encoding='utf-8'))
        j['focus'] = 'gone'
        json.dump(j, open(p, 'w', encoding='utf-8'))
        E, W = V.validate(self.d)
        self.assertEqual(E, [])
        self.assertTrue(any('focus gone has no project file' in w for w in W), W)

    def test_task_done_for_missing_task_is_a_warning(self):
        p = os.path.join(self.d, 'progress.json')
        j = json.load(open(p, encoding='utf-8'))
        j['done']['pt:u1:zzz'] = {'ts': 5, 'on': True}
        json.dump(j, open(p, 'w', encoding='utf-8'))
        E, W = V.validate(self.d)
        self.assertEqual(E, [])
        self.assertTrue(any('pt:u1:zzz' in w for w in W), W)

    def test_ladder_id_must_match_filename(self):
        os.rename(os.path.join(self.d, 'ladders', 'hack.json'), os.path.join(self.d, 'ladders', 'other.json'))
        self.has('id must equal the file name')


class Merge(Base):
    def setUp(self):
        super().setUp()
        self.base = mk(self.tmp, 'base')
        self.phone = os.path.join(self.tmp, 'phone')
        self.laptop = os.path.join(self.tmp, 'laptop')
        shutil.copytree(self.base, self.phone)
        shutil.copytree(self.base, self.laptop)
        # phone: new sessions, marks c2 done (later than base), edits the note of u1, edits event e1
        m = V.load_vault(self.phone)
        for i in range(3):
            ts = T0 + (i + 1) * 3600000
            m['log']['p%d' % i] = {'uid': 'p%d' % i, 'id': 'c3', 'lad': 'c', 'title': 'Arrays', 'ts': ts, 'k': 'session', 'device': 'phone'}
        m['done']['c2'] = {'ts': T0 + 5000, 'on': True}
        m['projects']['u1']['next'] = 'phone note'
        m['projects']['u1']['updated'] = T0 + 1000
        m['events']['e1']['note'] = 'phone edit'
        m['events']['e1']['updated'] = T0 + 1000
        V.write_vault(self.phone, m)
        # laptop: its own sessions, undoes hack1 (later than base), edits u1 note OLDER than the phone, deletes e2,
        # a new project, and a laptop-only ladder
        m = V.load_vault(self.laptop)
        for i in range(2):
            ts = T0 + 7200000 + i * 3600000
            m['log']['l%d' % i] = {'uid': 'l%d' % i, 'id': 'py1', 'lad': 'py', 'title': 'Loops', 'ts': ts, 'k': 'topic', 'device': 'laptop'}
        m['done']['hack1'] = {'ts': T0 + 9000, 'on': False}
        m['projects']['u1']['next'] = 'laptop old note'
        m['projects']['u1']['updated'] = T0 + 500
        m['events']['e2'] = {'id': 'e2', 'deleted': True, 'updated': T0 + 2000}
        rec = V.project_record({'id': 'u9', 'name': 'Laptop idea', 'priority': 2}, {'state': 'idea'}, 'own', T0 + 100)
        m['projects']['u9'] = rec
        m['ladders']['py'] = {'id': 'py', 'name': 'Python', 'nodes': [{'id': 'py1', 't': 'Loops'}]}
        V.write_vault(self.laptop, m)

    def merged(self, a, b, name):
        out = os.path.join(self.tmp, name)
        V.merge(a, b, out)
        return out

    def test_both_inputs_are_valid(self):
        self.assertEqual(V.validate(self.phone)[0], [])
        self.assertEqual(V.validate(self.laptop)[0], [])

    def test_merge_result(self):
        out = self.merged(self.phone, self.laptop, 'm1')
        E, W = V.validate(out)
        self.assertEqual(E, [], E)
        m = V.load_vault(out)
        self.assertEqual(len(m['log']), 4 + 3 + 2)                         # nothing lost, nothing doubled
        self.assertTrue(m['done']['c2']['on'] and m['done']['c2']['ts'] == T0 + 5000)   # phone mark kept
        self.assertFalse(m['done']['hack1']['on'])                          # laptop undo (newer) wins
        self.assertEqual(m['projects']['u1']['next'], 'phone note')         # newer `updated` wins
        self.assertIn('u9', m['projects'])                                  # laptop-only project kept
        self.assertEqual(m['events']['e1']['note'], 'phone edit')
        self.assertTrue(m['events']['e2'].get('deleted'))                   # tombstone beats the old copy
        self.assertIn('py', m['ladders'])
        self.assertIn('hack', m['ladders'])

    def test_merge_is_commutative_and_idempotent(self):
        ab = V.load_vault(self.merged(self.phone, self.laptop, 'ab'))
        ba = V.load_vault(self.merged(self.laptop, self.phone, 'ba'))
        for k in ('log', 'done', 'ms', 'events', 'dates', 'settings', 'ladders'):
            self.assertEqual(ab[k], ba[k], k)
        for pid in ab['projects']:
            a = {k: v for k, v in ab['projects'][pid].items() if not k.startswith('_')}
            b = {k: v for k, v in ba['projects'][pid].items() if not k.startswith('_')}
            self.assertEqual(a, b, pid)
        again = V.load_vault(self.merged(os.path.join(self.tmp, 'ab'), self.phone, 'abp'))
        for k in ('log', 'done', 'ms', 'events', 'dates', 'settings'):
            self.assertEqual(again[k], ab[k], k)

    def test_merged_vault_exports_a_backup(self):
        out = self.merged(self.phone, self.laptop, 'm2')
        bk = os.path.join(self.tmp, 'merged-backup.json')
        V.export_backup(out, bk)
        S = json.load(open(bk, encoding='utf-8'))['S']
        self.assertEqual(len(S['log']), 9)
        self.assertNotIn('hack1', S['done'])                                # undone on the laptop
        self.assertIn('c2', S['done'])
        self.assertEqual([e['id'] for e in S['events']], ['e1'])           # deleted event is not exported

    def test_merge_refuses_invalid_input(self):
        open(os.path.join(self.phone, 'progress.json'), 'w').write('{broken')
        with self.assertRaises(SystemExit):
            V.merge(self.phone, self.laptop, os.path.join(self.tmp, 'bad'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
