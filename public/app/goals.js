/* goals.js: First-class Goals & Exams Engine for Roadmap Buddy.
   Supports AI-generated roadmaps, file uploads (.json), auto-calendar injection,
   full lifecycle management (view/expand syllabus, pause/resume, push forward/reschedule, cascade delete),
   and the "Exam-Only Mode" project muting toggle.
   Aesthetic strictly follows space.css (Chakra Petch, #0A1119, #7CC4CC, sharp cyber borders).
*/
(function(){
  'use strict';

  // Inject styles for Goals & Mode HUD
  const style = document.createElement('style');
  style.textContent = `
    /* Top Strip Mode Switcher */
    .cyber-mode-switcher {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px;
      background: rgba(15, 27, 38, 0.85);
      border: 1px solid var(--line, #1F3547);
      border-radius: 6px;
      margin-left: 8px;
    }
    .cyber-mode-btn {
      min-height: 26px;
      padding: 0 8px;
      border-radius: 4px;
      font: 600 10px 'Chakra Petch', sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border: 1px solid transparent;
      color: var(--mute, #93A9B8);
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }
    .cyber-mode-btn:hover {
      color: var(--ink, #E6EFF4);
      background: rgba(124, 196, 204, 0.08);
    }
    .cyber-mode-btn[aria-selected="true"] {
      background: rgba(124, 196, 204, 0.18);
      color: var(--accent, #7CC4CC);
      border-color: var(--hot, #3C8F99);
      box-shadow: 0 0 10px rgba(124, 196, 204, 0.25);
    }

    /* Enhanced Goal Card in Home View */
    .goal-mission-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .goal-tabs-strip {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 2px;
    }
    .goal-tabs-strip::-webkit-scrollbar { display: none; }
    .goal-tab-pill {
      font: 600 10px 'Chakra Petch', sans-serif;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--edge, #2A4357);
      background: rgba(10, 17, 25, 0.6);
      color: var(--mute, #93A9B8);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .goal-tab-pill:hover {
      color: var(--ink, #E6EFF4);
      border-color: var(--accent, #7CC4CC);
    }
    .goal-tab-pill.active {
      background: rgba(124, 196, 204, 0.15);
      color: var(--accent, #7CC4CC);
      border-color: var(--accent, #7CC4CC);
    }
    .goal-add-pill {
      font: 600 10px 'Chakra Petch', sans-serif;
      padding: 3px 6px;
      border-radius: 4px;
      border: 1px dashed var(--edge, #2A4357);
      background: transparent;
      color: var(--accent, #7CC4CC);
      cursor: pointer;
    }
    .goal-add-pill:hover {
      background: rgba(124, 196, 204, 0.12);
      border-color: var(--accent, #7CC4CC);
    }

    .goal-mission-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: center;
    }
    .goal-mission-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .goal-mission-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 2px;
    }
    .goal-mission-head .kick {
      font: 600 10px 'Chakra Petch', sans-serif;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent, #7CC4CC);
    }
    .goal-mission-head .status-tag {
      font: 600 9px 'Chakra Petch', sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid currentColor;
    }
    .status-tag.active { color: var(--accent, #7CC4CC); }
    .status-tag.paused { color: var(--mute, #93A9B8); }
    .status-tag.exam { color: var(--c-sec, #F2958A); }

    .goal-mission-title {
      font: 600 16px 'Chakra Petch', sans-serif;
      color: var(--ink, #E6EFF4);
      margin: 0 0 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .goal-mission-sub {
      font: 500 12px 'Chakra Petch', sans-serif;
      color: var(--mute, #93A9B8);
      margin: 0 0 6px;
    }

    /* Action Buttons Bar inside Goal Card */
    .goal-actions-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin-top: 6px;
    }
    .goal-act-btn {
      min-height: 28px;
      font: 600 10px 'Chakra Petch', sans-serif;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 2px 4px;
      border-radius: 4px;
      border: 1px solid var(--edge, #2A4357);
      background: rgba(10, 17, 25, 0.7);
      color: var(--ink, #E6EFF4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      transition: all 0.15s ease;
    }
    .goal-act-btn:hover {
      border-color: var(--accent, #7CC4CC);
      color: var(--accent, #7CC4CC);
      background: rgba(124, 196, 204, 0.1);
    }
    .goal-act-btn.danger:hover {
      border-color: var(--c-sec, #F2958A);
      color: var(--c-sec, #F2958A);
      background: rgba(242, 149, 138, 0.1);
    }

    /* Modals */
    #goal-modal, #goal-syllabus-modal, #goal-reschedule-modal {
      position: fixed;
      inset: 0;
      z-index: 300;
      background: rgba(5, 10, 15, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: grid;
      place-items: center;
      padding: 16px;
    }
    #goal-modal[hidden], #goal-syllabus-modal[hidden], #goal-reschedule-modal[hidden] {
      display: none !important;
    }
    .cyber-modal-box {
      width: min(34rem, 100%);
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      background: #0F1B26;
      border: 1px solid var(--edge, #2A4357);
      border-radius: 8px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(124, 196, 204, 0.1);
      overflow: hidden;
    }
    .cyber-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      background: rgba(10, 17, 25, 0.8);
      border-bottom: 1px solid var(--line, #1F3547);
    }
    .cyber-modal-head h2 {
      margin: 0;
      font: 600 14px 'Chakra Petch', sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent, #7CC4CC);
    }
    .cyber-modal-close {
      background: transparent;
      border: none;
      color: var(--mute, #93A9B8);
      font-size: 16px;
      cursor: pointer;
      min-height: auto;
      padding: 4px;
    }
    .cyber-modal-close:hover { color: #fff; }
    .cyber-modal-body {
      padding: 16px 18px;
      overflow-y: auto;
      flex: 1;
    }

    /* Dropzone */
    .file-dropzone {
      border: 1.5px dashed var(--edge, #2A4357);
      border-radius: 6px;
      padding: 16px;
      text-align: center;
      margin-bottom: 12px;
      background: rgba(10, 17, 25, 0.5);
      cursor: pointer;
      transition: all 0.2s;
    }
    .file-dropzone:hover, .file-dropzone.dragover {
      border-color: var(--accent, #7CC4CC);
      background: rgba(124, 196, 204, 0.08);
    }
    .file-dropzone b {
      display: block;
      font: 600 13px 'Chakra Petch', sans-serif;
      color: var(--accent, #7CC4CC);
      margin-bottom: 4px;
    }
    .file-dropzone span {
      font-size: 11px;
      color: var(--mute, #93A9B8);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .field-label {
      display: block;
      font: 600 11px 'Chakra Petch', sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mute, #93A9B8);
      margin-bottom: 4px;
    }
    .cyber-input {
      width: 100%;
      background: #0A1119;
      border: 1px solid var(--edge, #2A4357);
      border-radius: 6px;
      padding: 8px 10px;
      color: var(--ink, #E6EFF4);
      font: 500 13px 'Chakra Petch', sans-serif;
      box-sizing: border-box;
    }
    .cyber-input:focus {
      outline: 1.5px solid var(--accent, #7CC4CC);
    }
    textarea.cyber-input {
      font-family: var(--mono, monospace);
      font-size: 11px;
      min-height: 120px;
      line-height: 1.4;
      resize: vertical;
    }

    /* Live Preview Banner in Modal */
    .import-preview-box {
      background: rgba(10, 17, 25, 0.7);
      border: 1px solid var(--line, #1F3547);
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 10px;
      font-size: 12px;
      color: var(--mute, #93A9B8);
    }
    .import-preview-box b {
      color: var(--accent, #7CC4CC);
    }

    /* Syllabus List */
    .syllabus-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 480px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .syllabus-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 8px 10px;
      background: rgba(10, 17, 25, 0.6);
      border: 1px solid var(--track, #1B2F40);
      border-radius: 6px;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    .syllabus-item:hover {
      border-color: rgba(124, 196, 204, 0.35);
      background: rgba(10, 17, 25, 0.85);
    }
    .syllabus-item.done {
      opacity: 0.6;
    }
    .syllabus-item.done .s-title {
      text-decoration: line-through;
      color: var(--mute, #93A9B8);
    }
    .syllabus-item .s-due {
      font-family: var(--mono, monospace);
      font-size: 11px;
      color: var(--mute, #93A9B8);
    }
    .syllabus-item .s-due.overdue {
      color: var(--c-sec, #F2958A);
      font-weight: 600;
    }

    /* Add Task Box inside Goal Drawer */
    .goal-add-task-box {
      background: rgba(124, 196, 204, 0.05);
      border: 1px dashed rgba(124, 196, 204, 0.3);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .task-act-btns {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .task-focus-btn {
      font: 600 11px 'Chakra Petch', sans-serif;
      padding: 2px 7px;
      border-radius: 3px;
      border: 1px solid var(--accent, #7CC4CC);
      background: rgba(124, 196, 204, 0.12);
      color: var(--accent, #7CC4CC);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .task-focus-btn:hover {
      background: var(--accent, #7CC4CC);
      color: #0A1119;
    }
    .task-del-btn {
      font: 600 11px 'Chakra Petch', sans-serif;
      padding: 2px 5px;
      border-radius: 3px;
      border: 1px solid rgba(242, 149, 138, 0.3);
      background: transparent;
      color: var(--c-sec, #F2958A);
      cursor: pointer;
    }
    .task-del-btn:hover {
      background: rgba(242, 149, 138, 0.2);
    }
  `;
  document.head.append(style);

  // Cached state
  let cachedGoals = [];
  try {
    const raw = localStorage.getItem('cached_goals_data');
    if (raw) cachedGoals = JSON.parse(raw);
  } catch(e) {}
  let currentMode = localStorage.getItem('study_mode') || 'balanced';
  let selectedGoalIndex = 0;

  // Expose Goal & Pause helpers globally immediately
  window.getActiveGoals = function() {
    return (cachedGoals || []).filter(g => g.active !== false);
  };
  window.getPausedGoals = function() {
    return (cachedGoals || []).filter(g => g.active === false);
  };
  window.isGoalPaused = function(goalId) {
    return (cachedGoals || []).some(g => g.id === goalId && g.active === false);
  };
  window.isTopicPaused = function(topicId, ladderId) {
    const paused = (cachedGoals || []).filter(g => g.active === false);
    for (const g of paused) {
      if (g.id === ladderId) return true;
      if (g.prep_ids && g.prep_ids.includes(topicId)) return true;
      if (g.syllabus && g.syllabus.some(s => s.id === topicId)) return true;
    }
    return false;
  };
  window.getCurrentMode = function() {
    return currentMode || 'balanced';
  };

  // ----------------- Modal Creation -----------------

  // 1. Add Goal / Roadmap Modal
  const modal = document.createElement('div');
  modal.id = 'goal-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="cyber-modal-box">
      <div class="cyber-modal-head">
        <h2>🎯 Add Goal or AI Roadmap</h2>
        <button class="cyber-modal-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cyber-modal-body">
        <div class="file-dropzone" id="g-dropzone">
          <input type="file" id="g-file" accept=".json,application/json" hidden>
          <b>📁 (Optional) Upload or Drag Roadmap .json File</b>
          <span>Upload an AI roadmap bundle, or leave blank to create a clean goal and add tasks as you go</span>
        </div>

        <form id="goal-form">
          <div class="form-row">
            <div>
              <label class="field-label">Goal / Exam Name</label>
              <input type="text" class="cyber-input" id="g-name" placeholder="e.g. Ausbildung Plan, Gate Exam" required>
            </div>
            <div>
              <label class="field-label">Target Date</label>
              <input type="date" class="cyber-input" id="g-date">
            </div>
          </div>
          <div class="form-row">
            <div>
              <label class="field-label">Goal Type</label>
              <select class="cyber-input" id="g-type">
                <option value="exam">Exam (High Priority)</option>
                <option value="target">Target / Roadmap</option>
                <option value="certification">Certification</option>
                <option value="test">Mock Test</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;">
              <button type="button" class="goal-act-btn" id="g-load-tpl" style="width:100%;min-height:36px;">
                Load Template
              </button>
            </div>
          </div>

          <label class="field-label" style="display:flex;justify-content:space-between;margin-top:8px;">
            <span>Roadmap JSON or Syllabus Text (Optional)</span>
            <span id="g-detect-summary" style="color:var(--accent,#7CC4CC);font-weight:600;"></span>
          </label>
          <textarea class="cyber-input" id="g-payload" placeholder="Optional: Paste roadmap JSON or leave blank to start with an empty goal and add tasks manually..."></textarea>

          <div class="import-preview-box" id="g-preview" hidden>
            <b>Detected:</b> <span id="g-prev-text"></span>
          </div>

          <div style="display:flex;gap:8px;margin-top:14px;">
            <button type="submit" class="mini go" style="flex:1;min-height:42px;background:var(--accent,#7CC4CC);color:#0A1119;font:700 13px 'Chakra Petch',sans-serif;letter-spacing:0.08em;text-transform:uppercase;border:none;cursor:pointer;border-radius:6px;">
              Save & Sync Calendar
            </button>
            <button type="button" class="cyber-modal-close-btn" style="min-height:42px;padding:0 14px;border:1px solid var(--edge,#2A4357);background:transparent;color:var(--mute,#93A9B8);cursor:pointer;border-radius:6px;font:600 12px 'Chakra Petch',sans-serif;">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.append(modal);

  // 2. Syllabus Drawer Modal
  const syllabusModal = document.createElement('div');
  syllabusModal.id = 'goal-syllabus-modal';
  syllabusModal.hidden = true;
  syllabusModal.innerHTML = `
    <div class="cyber-modal-box" style="max-width:680px; width:95%;">
      <div class="cyber-modal-head">
        <h2 id="syl-modal-title">🎯 Goal Tasks & Plan</h2>
        <button class="cyber-modal-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cyber-modal-body">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
          <span id="syl-modal-stats" style="color:var(--mute,#93A9B8);font-size:13px;"></span>
          <span id="syl-modal-target" style="font-family:var(--mono,monospace);color:var(--accent,#7CC4CC);font-size:12px;"></span>
        </div>

        <!-- Inline Add Task Card -->
        <div class="goal-add-task-box">
          <div style="font-weight:600; font-size:11px; color:var(--accent,#7CC4CC); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>+ Add Task or Subtopic</span>
            <span style="color:var(--mute,#93A9B8); font-weight:400; text-transform:none;">Added to this goal and synced to calendar</span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 80px 130px auto; gap:6px; align-items:center;">
            <input type="text" id="g-new-task-title" class="cyber-input" placeholder="Task name (e.g. OverTheWire Bandit 0-5, Practice Test 1)" style="height:34px; font-size:12px;">
            <input type="number" id="g-new-task-min" class="cyber-input" placeholder="Mins" value="30" min="5" max="180" style="height:34px; font-size:12px;">
            <input type="date" id="g-new-task-due" class="cyber-input" style="height:34px; font-size:11px;" title="Optional Due Date">
            <button type="button" id="g-btn-add-task" class="goal-act-btn" style="height:34px; background:var(--accent,#7CC4CC); color:#0A1119; font-weight:700; padding:0 12px; border:none; cursor:pointer;">
              Add Task
            </button>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-top:6px;">
            <input type="text" id="g-new-task-tiny" class="cyber-input" placeholder="Smallest start (optional, e.g. Open terminal and ssh into level 0)" style="height:28px; font-size:11px;">
            <input type="url" id="g-new-task-link" class="cyber-input" placeholder="Resource link URL (optional, https://...)" style="height:28px; font-size:11px;">
          </div>
        </div>

        <div class="syllabus-list" id="syl-modal-list"></div>
      </div>
    </div>
  `;
  document.body.append(syllabusModal);

  // 3. Reschedule / Push Forward Modal
  const rescheduleModal = document.createElement('div');
  rescheduleModal.id = 'goal-reschedule-modal';
  rescheduleModal.hidden = true;
  rescheduleModal.innerHTML = `
    <div class="cyber-modal-box">
      <div class="cyber-modal-head">
        <h2>⏩ Reschedule & Push Dates</h2>
        <button class="cyber-modal-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cyber-modal-body">
        <p style="color:var(--mute,#93A9B8);font-size:13px;margin:0 0 14px;">
          Keep your schedule realistic and uncluttered. Choose how to handle overdue dates for <b id="resched-goal-name" style="color:var(--ink,#E6EFF4)"></b>:
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="goal-act-btn" id="btn-resched-push" style="min-height:46px;justify-content:flex-start;padding:10px 14px;">
            <b style="color:var(--accent,#7CC4CC);">⏩ Push Overdue Dates Forward</b>
            <span style="display:block;font-size:11px;color:var(--mute,#93A9B8);font-weight:400;margin-top:2px;">
              Redistributes all past uncompleted topics starting from tomorrow up to the target date.
            </span>
          </button>
          <button type="button" class="goal-act-btn" id="btn-resched-extend" style="min-height:46px;justify-content:flex-start;padding:10px 14px;">
            <b style="color:var(--c-gfx,#E6B95F);">📅 Extend Target Date (+30 Days)</b>
            <span style="display:block;font-size:11px;color:var(--mute,#93A9B8);font-weight:400;margin-top:2px;">
              Pushes the exam / final target date and shifts all upcoming topic due dates forward.
            </span>
          </button>
          <button type="button" class="goal-act-btn danger" id="btn-resched-clear" style="min-height:46px;justify-content:flex-start;padding:10px 14px;">
            <b style="color:var(--c-sec,#F2958A);">🧹 Clear Past Overdue Dates</b>
            <span style="display:block;font-size:11px;color:var(--mute,#93A9B8);font-weight:400;margin-top:2px;">
              Removes due dates that already passed without modifying future milestones.
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.append(rescheduleModal);

  // Wire close buttons
  document.querySelectorAll('#goal-modal .cyber-modal-close, #goal-modal .cyber-modal-close-btn').forEach(b => {
    b.onclick = () => { modal.hidden = true; };
  });
  document.querySelectorAll('#goal-syllabus-modal .cyber-modal-close').forEach(b => {
    b.onclick = () => { syllabusModal.hidden = true; };
  });
  document.querySelectorAll('#goal-reschedule-modal .cyber-modal-close').forEach(b => {
    b.onclick = () => { rescheduleModal.hidden = true; };
  });

  // Example template
  const EXAMPLE_TEMPLATE = {
    "goal": "Operating Systems & Concurrency Exam",
    "target_date": "2027-01-20",
    "type": "exam",
    "priority": "urgent",
    "syllabus": [
      {"id": "os-1", "title": "Processes, Threads & CPU Scheduling", "target_date": "2026-11-20", "min": 45, "resources": [{"title": "OSTEP Ch 4-9", "url": "https://pages.cs.wisc.edu/~remzi/OSTEP/", "kind": "book"}]},
      {"id": "os-2", "title": "Locks, Semaphores & Concurrency", "target_date": "2026-12-05", "min": 45, "needs": ["os-1"], "resources": [{"title": "OSTEP Ch 28-32", "url": "https://pages.cs.wisc.edu/~remzi/OSTEP/", "kind": "book"}]},
      {"id": "os-3", "title": "Virtual Memory, Paging & TLBs", "target_date": "2026-12-20", "min": 45, "needs": ["os-2"], "resources": [{"title": "OSTEP Ch 18-20", "url": "https://pages.cs.wisc.edu/~remzi/OSTEP/", "kind": "docs"}]}
    ],
    "mock_tests": [
      {"title": "Full Final Simulation Exam", "date": "2027-01-12"}
    ]
  };

  modal.querySelector('#g-load-tpl').onclick = () => {
    modal.querySelector('#g-name').value = EXAMPLE_TEMPLATE.goal;
    modal.querySelector('#g-date').value = EXAMPLE_TEMPLATE.target_date;
    modal.querySelector('#g-type').value = EXAMPLE_TEMPLATE.type;
    modal.querySelector('#g-payload').value = JSON.stringify(EXAMPLE_TEMPLATE, null, 2);
    updatePreview(EXAMPLE_TEMPLATE);
  };

  // Dropzone & File Loader
  const dropzone = modal.querySelector('#g-dropzone');
  const fileInput = modal.querySelector('#g-file');
  dropzone.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (file) loadFile(file);
    fileInput.value = '';
  };
  dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('dragover'); };
  dropzone.ondragleave = () => dropzone.classList.remove('dragover');
  dropzone.ondrop = e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadFile(e.dataTransfer.files[0]);
    }
  };

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      modal.querySelector('#g-payload').value = text;
      try {
        const parsed = JSON.parse(text);
        updatePreview(parsed);
      } catch (err) {
        modal.querySelector('#g-preview').hidden = false;
        modal.querySelector('#g-prev-text').textContent = 'Plain text loaded (' + text.length + ' chars)';
      }
    };
    reader.readAsText(file);
  }

  modal.querySelector('#g-payload').oninput = e => {
    const text = e.target.value.trim();
    if (!text) {
      modal.querySelector('#g-preview').hidden = true;
      modal.querySelector('#g-detect-summary').textContent = '';
      return;
    }
    try {
      const parsed = JSON.parse(text);
      updatePreview(parsed);
    } catch {
      modal.querySelector('#g-preview').hidden = true;
      modal.querySelector('#g-detect-summary').textContent = 'Text mode';
    }
  };

  function updatePreview(data) {
    const prev = modal.querySelector('#g-preview');
    const prevText = modal.querySelector('#g-prev-text');
    const summary = modal.querySelector('#g-detect-summary');

    let name = '';
    let target = '';
    let nodesCount = 0;
    let eventsCount = 0;

    if (data.ladders && Array.isArray(data.ladders) && data.ladders[0]) {
      const l0 = data.ladders[0];
      name = l0.name || '';
      target = l0.target || '';
      nodesCount = (l0.nodes || []).length;
      eventsCount = (data.events || []).length;
    } else if (data.nodes && Array.isArray(data.nodes)) {
      name = data.name || '';
      target = data.target || '';
      nodesCount = data.nodes.length;
      eventsCount = (data.events || []).length;
    } else if (data.syllabus || data.goal) {
      name = data.goal || data.name || '';
      target = data.target_date || data.date || '';
      nodesCount = (data.syllabus || []).length;
      eventsCount = (data.mock_tests || []).length;
    }

    if (name && !modal.querySelector('#g-name').value) {
      modal.querySelector('#g-name').value = name;
    }
    if (target && !modal.querySelector('#g-date').value) {
      modal.querySelector('#g-date').value = target;
    }

    prev.hidden = false;
    prevText.textContent = `${name || 'Goal'} · ${nodesCount} topics · ${eventsCount} events · Target: ${target || 'TBD'}`;
    summary.textContent = `✓ ${nodesCount} topics detected`;
  }

  function openGoalModal() {
    modal.hidden = false;
    modal.querySelector('#g-name').focus();
  }
  window.openGoalModal = openGoalModal;

  // Form Submit
  const goalForm = modal.querySelector('#goal-form');
  goalForm.onsubmit = e => {
    e.preventDefault();
    const name = modal.querySelector('#g-name').value.trim();
    const date = modal.querySelector('#g-date').value;
    const type = modal.querySelector('#g-type').value;
    const rawPayload = modal.querySelector('#g-payload').value.trim();

    let payload = {};
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = { text: rawPayload };
      }
    }
    if (name) payload.name = name;
    if (date) payload.target_date = date;
    if (type) payload.type = type;

    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(res => {
        if (!res.success) throw new Error(res.error || 'Failed to save goal');
        modal.hidden = true;
        goalForm.reset();
        modal.querySelector('#g-preview').hidden = true;
        modal.querySelector('#g-detect-summary').textContent = '';
        if (typeof toast === 'function') toast('🎯 Goal & roadmap saved! Calendar & topics synced.');
        syncGoalsAndRender(true);
      })
      .catch(err => {
        alert('Error saving goal: ' + err.message);
      });
  };

  // ----------------- Goal Lifecycle Management -----------------

  function deleteGoalCascade(goalId, goalName) {
    if (!confirm(`Delete goal "${goalName}"?\n\nThis will completely remove this goal, its ladder topics, and all associated exam/milestone events from your calendar. No orphan dates will be left.`)) {
      return;
    }

    fetch('/api/goals/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: goalId })
    })
      .then(r => r.json())
      .then(res => {
        if (!res.success) throw new Error(res.error || 'Failed to delete');
        if (typeof toast === 'function') toast(`🗑️ Goal "${goalName}" and all associated events deleted.`);
        
        // Remove from local memory if present
        if (typeof S !== 'undefined' && S.ladders) {
          S.ladders = S.ladders.filter(l => l.id !== goalId);
        }
        if (typeof D !== 'undefined' && D.ladders) {
          D.ladders = D.ladders.filter(l => l.id !== goalId);
          D.events = D.events.filter(e => e.goal_id !== goalId && !String(e.id || '').startsWith(`goal-${goalId}`));
        }
        selectedGoalIndex = 0;
        syncGoalsAndRender(true);
      })
      .catch(err => alert('Error deleting goal: ' + err.message));
  }

  function togglePauseGoal(goalId, currentActive) {
    fetch('/api/goals/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: goalId, active: !currentActive })
    })
      .then(r => r.json())
      .then(res => {
        if (!res.success) throw new Error(res.error || 'Failed to toggle pause');
        const isNowActive = res.goal.active;
        if (typeof toast === 'function') {
          toast(isNowActive ? `▶️ Goal resumed and active` : `⏸️ Goal paused`);
        }
        syncGoalsAndRender();
      })
      .catch(err => alert('Error: ' + err.message));
  }

  function openRescheduleDialog(goal) {
    rescheduleModal.querySelector('#resched-goal-name').textContent = goal.name;
    rescheduleModal.hidden = false;

    rescheduleModal.querySelector('#btn-resched-push').onclick = () => executeReschedule(goal.id, 'push_forward');
    rescheduleModal.querySelector('#btn-resched-extend').onclick = () => executeReschedule(goal.id, 'extend_target');
    rescheduleModal.querySelector('#btn-resched-clear').onclick = () => executeReschedule(goal.id, 'clear_passed');
  }

  function executeReschedule(goalId, action) {
    fetch('/api/goals/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: goalId, action: action, days: 30 })
    })
      .then(r => r.json())
      .then(res => {
        if (!res.success) throw new Error(res.error || 'Failed to reschedule');
        rescheduleModal.hidden = true;
        const count = res.reschedule.updated_nodes || 0;
        if (typeof toast === 'function') {
          toast(`⏩ Rescheduled! ${count} topic dates updated.`);
        }
        syncGoalsAndRender(true);
      })
      .catch(err => alert('Error rescheduling: ' + err.message));
  }

  function openSyllabusDrawer(goal) {
    syllabusModal.querySelector('#syl-modal-title').textContent = `🎯 ${goal.name} · Tasks & Plan`;
    const prepIds = goal.prep_ids || [];
    const doneCount = prepIds.filter(id => (typeof S !== 'undefined' && S.done && S.done[id])).length;
    const pct = prepIds.length ? Math.round((doneCount / prepIds.length) * 100) : 0;
    
    syllabusModal.querySelector('#syl-modal-stats').textContent = `${doneCount} of ${prepIds.length} tasks completed (${pct}%)`;
    syllabusModal.querySelector('#syl-modal-target').textContent = goal.target_date ? `Target: ${goal.target_date}` : '';

    // Wire Add Task button in drawer
    const btnAddTask = syllabusModal.querySelector('#g-btn-add-task');
    btnAddTask.onclick = async () => {
      const titleInput = syllabusModal.querySelector('#g-new-task-title');
      const minInput = syllabusModal.querySelector('#g-new-task-min');
      const dueInput = syllabusModal.querySelector('#g-new-task-due');
      const tinyInput = syllabusModal.querySelector('#g-new-task-tiny');
      const linkInput = syllabusModal.querySelector('#g-new-task-link');

      const title = (titleInput.value || '').trim();
      if (!title) {
        alert('Please enter a task title');
        titleInput.focus();
        return;
      }

      btnAddTask.disabled = true;
      btnAddTask.textContent = 'Adding...';

      try {
        const res = await fetch('/api/goals/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal_id: goal.id,
            title: title,
            min: parseInt(minInput.value) || 30,
            due: dueInput.value || '',
            tiny: (tinyInput.value || '').trim(),
            links: (linkInput.value || '').trim() ? [
              { t: 'Resource', u: linkInput.value.trim(), kind: 'docs', free: true }
            ] : []
          })
        }).then(r => r.json());

        if (!res.success) throw new Error(res.error || 'Failed to add task');

        titleInput.value = '';
        tinyInput.value = '';
        linkInput.value = '';
        dueInput.value = '';

        if (typeof toast === 'function') toast(`✓ Added task: ${title}`);
        goal = res.goal;
        
        // Refresh local cache and UI
        syncGoalsAndRender(true);
        if (typeof window.hubLoadCalendar === 'function') window.hubLoadCalendar();
        openSyllabusDrawer(goal);
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btnAddTask.disabled = false;
        btnAddTask.textContent = 'Add Task';
      }
    };

    const listEl = syllabusModal.querySelector('#syl-modal-list');
    listEl.innerHTML = '';

    const today = new Date().toISOString().slice(0, 10);
    const syllabus = goal.syllabus || [];

    if (!syllabus.length) {
      listEl.innerHTML = '<div style="color:var(--mute,#93A9B8);font-size:13px;padding:12px 4px;text-align:center;">No tasks added yet. Use the form above to add your first task!</div>';
    } else {
      syllabus.forEach((n) => {
        const isDone = typeof S !== 'undefined' && S.done && S.done[n.id];
        const isOverdue = n.due && n.due < today && !isDone;

        const row = document.createElement('div');
        row.className = 'syllabus-item' + (isDone ? ' done' : '');
        row.innerHTML = `
          <input type="checkbox" ${isDone ? 'checked' : ''} style="cursor:pointer;" aria-label="Mark task done">
          <div style="min-width:0;">
            <div class="s-title" style="font-weight:600;color:var(--ink,#E6EFF4);">${escapeHtml(n.t || n.title)}</div>
            <div style="font-size:11px;color:var(--mute,#93A9B8);display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">
              <span>⏱ ${n.min || 30} min</span>
              ${n.due ? `<span class="s-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️ Overdue: ' : 'Due: '}${n.due}</span>` : ''}
              ${n.tiny ? `<span style="color:var(--ink,#E6EFF4)">⚡ ${escapeHtml(n.tiny)}</span>` : ''}
              ${n.links && n.links.length ? `<a href="${n.links[0].u}" target="_blank" rel="noopener" style="color:var(--accent,#7CC4CC);text-decoration:none;">Resource ↗</a>` : ''}
            </div>
          </div>
          <div class="task-act-btns">
            <button type="button" class="task-focus-btn" data-tid="${n.id}">⏱ Focus</button>
            <button type="button" class="task-del-btn" data-tid="${n.id}" title="Remove task">✕</button>
          </div>
        `;

        const chk = row.querySelector('input[type="checkbox"]');
        chk.onchange = () => {
          if (typeof S !== 'undefined') {
            if (chk.checked) {
              S.done[n.id] = Date.now();
              if (typeof toast === 'function') toast(`✓ Completed: ${n.t || n.title}`);
            } else {
              delete S.done[n.id];
            }
            if (typeof save === 'function') save();
            if (typeof renderAll === 'function') renderAll();
            openSyllabusDrawer(goal);
            renderEnhancedGoal();
          }
        };

        // Wire Focus button
        const focusBtn = row.querySelector('.task-focus-btn');
        focusBtn.onclick = () => {
          if (typeof S !== 'undefined') {
            S.pin = n.id;
            if (typeof save === 'function') save();
            syllabusModal.hidden = true;
            if (typeof setView === 'function') setView('home');
            if (typeof renderAll === 'function') renderAll();
            if (typeof toast === 'function') toast(`⏱ Focus target: ${n.t || n.title}`);
          }
        };

        // Wire Delete button
        const delBtn = row.querySelector('.task-del-btn');
        delBtn.onclick = async () => {
          if (!confirm(`Remove task "${n.t || n.title}" from this goal?`)) return;
          try {
            const res = await fetch('/api/goals/task/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ goal_id: goal.id, task_id: n.id })
            }).then(r => r.json());
            if (!res.success) throw new Error(res.error || 'Failed to remove task');
            if (typeof toast === 'function') toast(`🗑️ Task removed`);
            goal = res.goal;
            syncGoalsAndRender(true);
            if (typeof window.hubLoadCalendar === 'function') window.hubLoadCalendar();
            openSyllabusDrawer(goal);
          } catch (e) {
            alert('Error: ' + e.message);
          }
        };

        listEl.append(row);
      });
    }

    syllabusModal.hidden = false;
  }

  // ----------------- Operating Mode Logic -----------------

  function applyModeEffects(mode) {
    currentMode = mode;
    if (typeof S !== 'undefined') {
      S.mode = mode;
      if (mode === 'exam_only' && S.projects) {
        for (const p of S.projects) p.status = 'paused';
      }
      if (typeof save === 'function') save();
    }
    document.querySelectorAll('.cyber-mode-btn').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
    });
  }

  function switchMode(newMode) {
    applyModeEffects(newMode);
    fetch('/api/goals/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode })
    }).catch(() => {});

    if (typeof renderAll === 'function') renderAll();
    if (typeof toast === 'function') {
      const label = newMode === 'exam_only' ? '🎓 Exam-Only Mode: Side projects muted' : newMode === 'builder' ? '🛠️ Builder Mode' : '🚀 Balanced Mode';
      toast(label);
    }
  }

  // ----------------- Seamless UI Injection -----------------

  function renderModeSwitcher() {
    let modeContainer = document.getElementById('cyber-mode-switcher');
    if (!modeContainer) {
      modeContainer = document.createElement('div');
      modeContainer.id = 'cyber-mode-switcher';
      modeContainer.className = 'cyber-mode-switcher';
      modeContainer.innerHTML = `
        <button class="cyber-mode-btn" type="button" data-mode="balanced" aria-selected="${currentMode === 'balanced'}">🚀 Balanced</button>
        <button class="cyber-mode-btn" type="button" data-mode="exam_only" aria-selected="${currentMode === 'exam_only'}">🎓 Exam Focus</button>
        <button class="cyber-mode-btn" type="button" data-mode="builder" aria-selected="${currentMode === 'builder'}">🛠️ Builder</button>
      `;

      // Mount into top strip if present
      const topStrip = document.querySelector('.top');
      if (topStrip) {
        topStrip.append(modeContainer);
      } else {
        const main = document.querySelector('main');
        if (main) main.prepend(modeContainer);
      }

      modeContainer.querySelectorAll('.cyber-mode-btn').forEach(btn => {
        btn.onclick = () => switchMode(btn.dataset.mode);
      });
    } else {
      modeContainer.querySelectorAll('.cyber-mode-btn').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.mode === currentMode));
      });
    }
  }

  function renderEnhancedGoal() {
    const goalEl = document.getElementById('goal');
    if (!goalEl) return;

    if (!cachedGoals || cachedGoals.length === 0) {
      // If no goals, render default or fallback
      goalEl.innerHTML = `
        <div class="gring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="276.46"/></svg><b>0%</b></div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <p class="sub" style="margin:0;">No Goal Active</p>
            <button type="button" class="goal-add-pill" id="empty-add-goal-btn">+ Add Goal</button>
          </div>
          <h2 style="font-size:18px;margin:3px 0;">Set an Exam or Target</h2>
          <p class="sub">Add a roadmap JSON or syllabus to track rigid deadlines.</p>
        </div>
      `;
      const btn = goalEl.querySelector('#empty-add-goal-btn');
      if (btn) btn.onclick = openGoalModal;
      return;
    }

    if (selectedGoalIndex >= cachedGoals.length) {
      selectedGoalIndex = 0;
    }
    const currentGoal = cachedGoals[selectedGoalIndex];
    const prepIds = currentGoal.prep_ids || [];
    const doneCount = prepIds.filter(id => (typeof S !== 'undefined' && S.done && S.done[id])).length;
    const frac = prepIds.length ? doneCount / prepIds.length : 0;
    const pct = Math.round(frac * 100);
    const isActive = currentGoal.active !== false;
    const daysLeft = currentGoal.target_date && typeof daysTo === 'function' ? daysTo(currentGoal.target_date) : null;

    goalEl.innerHTML = `
      <div class="goal-mission-box">
        ${cachedGoals.length > 1 ? `
          <div class="goal-tabs-strip">
            ${cachedGoals.map((g, idx) => `
              <button type="button" class="goal-tab-pill ${idx === selectedGoalIndex ? 'active' : ''}" data-idx="${idx}">
                🎯 ${g.name.length > 20 ? g.name.slice(0, 19) + '…' : g.name}
              </button>
            `).join('')}
            <button type="button" class="goal-add-pill" id="strip-add-goal-btn" title="Add another goal">+</button>
          </div>
        ` : ''}

        <div class="goal-mission-card">
          <div class="gring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="bg" cx="50" cy="50" r="44"/>
              <circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="${(276.46 * (1 - frac)).toFixed(2)}"/>
            </svg>
            <b>${pct}%</b>
          </div>

          <div class="goal-mission-info">
            <div class="goal-mission-head">
              <span class="kick">TARGET GOAL</span>
              <div style="display:flex;gap:4px;">
                <span class="status-tag ${currentGoal.type || 'exam'}">${currentGoal.type || 'exam'}</span>
                <span class="status-tag ${isActive ? 'active' : 'paused'}">${isActive ? 'ACTIVE' : 'PAUSED'}</span>
              </div>
            </div>

            <h2 class="goal-mission-title" title="${currentGoal.name}">
              🎯 ${currentGoal.name}
            </h2>

            <div class="goal-mission-sub">
              ${prepIds.length ? `${doneCount} of ${prepIds.length} topics done` : 'Syllabus active'}
              ${currentGoal.target_date ? ` · <span style="font-family:var(--mono,monospace);color:${daysLeft !== null && daysLeft <= 14 ? 'var(--c-sec,#F2958A)' : 'var(--accent,#7CC4CC)'}">${daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft}d left` : 'date passed') : currentGoal.target_date}</span>` : ''}
            </div>

            <div class="goal-actions-row">
              <button type="button" class="goal-act-btn" id="card-btn-syl">
                📋 Tasks & Plan
              </button>
              <button type="button" class="goal-act-btn" id="card-btn-pause">
                ${isActive ? '⏸️ Pause' : '▶️ Resume'}
              </button>
              <button type="button" class="goal-act-btn" id="card-btn-resched">
                ⏩ Shift
              </button>
              <button type="button" class="goal-act-btn danger" id="card-btn-del">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire goal tabs
    goalEl.querySelectorAll('.goal-tab-pill').forEach(btn => {
      btn.onclick = () => {
        selectedGoalIndex = parseInt(btn.dataset.idx, 10) || 0;
        renderEnhancedGoal();
      };
    });
    const addBtn = goalEl.querySelector('#strip-add-goal-btn');
    if (addBtn) addBtn.onclick = openGoalModal;

    // Wire actions
    goalEl.querySelector('#card-btn-syl').onclick = () => openSyllabusDrawer(currentGoal);
    goalEl.querySelector('#card-btn-pause').onclick = () => togglePauseGoal(currentGoal.id, isActive);
    goalEl.querySelector('#card-btn-resched').onclick = () => openRescheduleDialog(currentGoal);
    goalEl.querySelector('#card-btn-del').onclick = () => deleteGoalCascade(currentGoal.id, currentGoal.name);
  }

  // Hook into renderGoal so it replaces default goal when goals exist
  if (typeof renderGoal === 'function') {
    const _origRenderGoal = renderGoal;
    window.renderGoal = function() {
      if (cachedGoals && cachedGoals.length > 0) {
        renderEnhancedGoal();
      } else {
        _origRenderGoal();
      }
    };
  }

  // ----------------- Sync & Startup -----------------

  function syncGoalsAndRender(fullRebuild) {
    const fetchFreshData = fullRebuild ? Promise.all([
      fetch('data/skills.json', { cache: 'no-cache' }).then(r => r.json()),
      fetch('data/events.json', { cache: 'no-cache' }).then(r => r.json())
    ]).then(([sk, ev]) => {
      if (typeof D !== 'undefined' && D) {
        D.ladders = sk.ladders || [];
        D.events = ev.events || [];
        if (typeof build === 'function') build();
        if (typeof renderAll === 'function') renderAll();
      }
    }).catch(() => {}) : Promise.resolve();

    fetchFreshData.then(() => {
      fetch('/api/goals')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          cachedGoals = data.goals || [];
          try { localStorage.setItem('cached_goals_data', JSON.stringify(cachedGoals)); } catch(e){}
          currentMode = data.mode || 'balanced';
          applyModeEffects(currentMode);
          renderModeSwitcher();
          renderEnhancedGoal();
          if (typeof renderAll === 'function') {
            renderAll();
          }
          if (location.hash === '#tasks-drawer' && typeof window.openSyllabusDrawer === 'function') {
            window.openSyllabusDrawer();
          }
          if (typeof window.hubLoadCalendar === 'function') {
            window.hubLoadCalendar();
          }
        })
        .catch(() => {});
    });
  }

  // Enable URL hash navigation
  window.addEventListener('hashchange', () => {
    let h = location.hash.replace(/^#/, '');
    if (h === 'tasks-drawer') {
      if (typeof setView === 'function') setView('home');
      setTimeout(() => window.openSyllabusDrawer(), 150);
      return;
    }
    if (!h || h === 'undefined' || h === 'null') h = 'home';
    if (typeof setView === 'function') setView(h);
  });
  if (location.hash) {
    let h = location.hash.replace(/^#/, '');
    if (h === 'tasks-drawer') {
      if (typeof setView === 'function') setView('home');
      setTimeout(() => window.openSyllabusDrawer(), 250);
    } else {
      if (!h || h === 'undefined' || h === 'null') h = 'home';
      if (typeof setView === 'function') setTimeout(() => setView(h), 50);
    }
  }

  window.openSyllabusDrawer = function(goalId) {
    const g = goalId ? (cachedGoals.find(x => x.id === goalId) || cachedGoals[0]) : (cachedGoals[selectedGoalIndex] || cachedGoals[0]);
    if (g) openSyllabusDrawer(g);
  };

  // Expose Goal & Pause helpers globally
  window.getActiveGoals = function() {
    return (cachedGoals || []).filter(g => g.active !== false);
  };
  window.getPausedGoals = function() {
    return (cachedGoals || []).filter(g => g.active === false);
  };
  window.isGoalPaused = function(goalId) {
    return (cachedGoals || []).some(g => g.id === goalId && g.active === false);
  };
  window.isTopicPaused = function(topicId, ladderId) {
    const paused = (cachedGoals || []).filter(g => g.active === false);
    for (const g of paused) {
      if (g.id === ladderId) return true;
      if (g.prep_ids && g.prep_ids.includes(topicId)) return true;
      if (g.syllabus && g.syllabus.some(s => s.id === topicId)) return true;
    }
    return false;
  };
  window.getCurrentMode = function() {
    return currentMode || 'balanced';
  };

  // Hook into client startup
  const initInterval = setInterval(() => {
    if (typeof D !== 'undefined' && D && typeof S !== 'undefined') {
      clearInterval(initInterval);
      syncGoalsAndRender();
    }
  }, 100);

})();
