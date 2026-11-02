/* hub.js: Personal Project Hub (GitHub for Personal Projects) Engine */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const escapeHtml = str => (str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));

  // Global Hub State
  const App = {
    projects: [],
    timeline: [],
    sessions: [],
    activeTab: 'timeline',
    filterProjectId: '',
    filterType: '',
    filterSearch: '',
    showDeleted: false,
    
    // Commit form state
    commitType: 'progress',
    commitMediaFiles: [], // array of { file, data_base64, mime_type, name }

    // Timer state
    timer: {
      projectId: '',
      running: false,
      secondsLeft: 25 * 60,
      totalSeconds: 25 * 60,
      startTime: null,
      intervalId: null,
      pipWin: null
    },

    // Calendar state
    calendar: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      data: { days: {} },
      selectedDate: new Date().toISOString().slice(0, 10)
    },

    // Lightbox
    lightbox: {
      open: false,
      url: '',
      isVideo: false,
      caption: ''
    }
  };

  // ----------------- API Helpers -----------------
  async function apiGet(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function apiPost(path, data) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ----------------- Data Loading -----------------
  async function loadProjects() {
    try {
      const data = await apiGet('/api/projects');
      App.projects = data.projects || [];
      renderMetrics();
      renderProjects();
      populateProjectDropdowns();
      return App.projects;
    } catch (e) {
      console.error('Failed to load projects:', e);
      return [];
    }
  }

  async function loadTimeline() {
    try {
      let q = `/api/timeline?limit=150`;
      if (App.filterProjectId) q += `&project_id=${encodeURIComponent(App.filterProjectId)}`;
      if (App.filterType) q += `&type=${encodeURIComponent(App.filterType)}`;
      if (App.showDeleted) q += `&include_deleted=1`;
      
      const data = await apiGet(q);
      App.timeline = data.timeline || [];
      renderTimeline();
      return App.timeline;
    } catch (e) {
      console.error('Failed to load timeline:', e);
      return [];
    }
  }

  async function loadCalendar() {
    try {
      const data = await apiGet(`/api/calendar/activity?year=${App.calendar.year}&month=${App.calendar.month}`);
      App.calendar.data = data || { days: {} };
      renderCalendar();
    } catch (e) {
      console.error('Failed to load calendar:', e);
    }
  }

  async function loadSessions() {
    try {
      let q = `/api/sessions?limit=20`;
      if (App.timer.projectId) q += `&project_id=${encodeURIComponent(App.timer.projectId)}`;
      const data = await apiGet(q);
      App.sessions = data.sessions || [];
      renderRecentSessions();
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }

  // ----------------- Header & Metrics -----------------
  function renderMetrics() {
    const totalProjects = App.projects.filter(p => !p.deleted).length;
    let totalMinutes = 0;
    let openBlockers = 0;

    for (const p of App.projects) {
      if (!p.deleted) {
        totalMinutes += (p.total_minutes || 0);
        openBlockers += (p.open_blockers || 0);
      }
    }

    $('metric-projects').textContent = totalProjects;
    $('metric-minutes').textContent = totalMinutes >= 60 ? `${(totalMinutes / 60).toFixed(1)}h` : `${totalMinutes}m`;
    
    const blockEl = $('metric-blockers');
    blockEl.textContent = openBlockers;
    const blockPill = $('metric-blockers-pill');
    if (openBlockers > 0) {
      blockPill.classList.add('alert');
    } else {
      blockPill.classList.remove('alert');
    }
  }

  function populateProjectDropdowns() {
    const activeProjects = App.projects.filter(p => !p.deleted);

    // Commit box project selector
    const commitSel = $('commit-project');
    const curCommitVal = commitSel.value;
    commitSel.innerHTML = activeProjects.map(p => 
      `<option value="${p.id}">${escapeHtml(p.name)} [${p.category}]</option>`
    ).join('');
    if (curCommitVal && activeProjects.some(p => p.id === curCommitVal)) {
      commitSel.value = curCommitVal;
    } else if (activeProjects.length) {
      commitSel.value = activeProjects[0].id;
    }

    // Filter project selector
    const filterSel = $('filter-project');
    const curFilterVal = filterSel.value;
    filterSel.innerHTML = `<option value="">All Projects</option>` + activeProjects.map(p => 
      `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    ).join('');
    filterSel.value = curFilterVal || '';

    // Timer project selector
    const timerSel = $('timer-project');
    const curTimerVal = timerSel.value;
    timerSel.innerHTML = activeProjects.map(p => 
      `<option value="${p.id}">${escapeHtml(p.name)} [${p.category}]</option>`
    ).join('');
    if (curTimerVal && activeProjects.some(p => p.id === curTimerVal)) {
      timerSel.value = curTimerVal;
    } else if (activeProjects.length) {
      timerSel.value = activeProjects[0].id;
      App.timer.projectId = activeProjects[0].id;
    }
  }

  // ----------------- Tab Navigation -----------------
  function setTab(tabName) {
    if (!tabName || tabName === 'undefined' || tabName === 'null') tabName = 'home';
    App.activeTab = tabName;
    if (typeof window.setView === 'function') {
      window.setView(tabName);
      return;
    }
    if (window.location.hash.replace('#', '') !== tabName) {
      window.location.hash = tabName;
    }
    document.querySelectorAll('.hub-nav button').forEach(btn => {
      const isSel = (btn.dataset.v === tabName || btn.dataset.tab === tabName);
      btn.classList.toggle('active', isSel);
      btn.setAttribute('aria-selected', String(isSel));
    });

    ['home', 'roadmap', 'timeline', 'timer', 'projects', 'calendar', 'rewards'].forEach(tab => {
      const el = $(`v-${tab}`) || $(`tab-${tab}`);
      if (el) el.hidden = (tab !== tabName);
    });

    if (tabName === 'timeline') loadTimeline();
    if (tabName === 'projects') loadProjects();
    if (tabName === 'calendar') loadCalendar();
    if (tabName === 'timer') loadSessions();
  }

  // ----------------- Timeline View & Commits -----------------
  function formatRelativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderTimeline() {
    const container = $('timeline-feed');
    let entries = App.timeline;

    // Search filter
    if (App.filterSearch.trim()) {
      const term = App.filterSearch.toLowerCase();
      entries = entries.filter(e => 
        (e.title && e.title.toLowerCase().includes(term)) ||
        (e.body && e.body.toLowerCase().includes(term)) ||
        (e.project_name && e.project_name.toLowerCase().includes(term))
      );
    }

    if (!entries.length) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 2.5rem 1rem; color: var(--mute);">
          <p style="font-size:1.1rem; margin-bottom:0.4rem; color:var(--ink);">No timeline entries found</p>
          <small>Record your first progress update, blocker, or change above!</small>
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(entry => {
      const typeIcons = {
        progress: '🟢',
        blocker: '🔴',
        change: '🟣',
        decision: '🔵'
      };

      const mediaHtml = (entry.media || []).map(m => {
        const isVid = m.mime_type && m.mime_type.startsWith('video');
        return `
          <div class="media-thumb" onclick="window.hubOpenLightbox('${m.url}', ${isVid}, '${escapeHtml(m.filename || entry.title)}')">
            ${isVid ? `<video src="${m.url}#t=0.1" preload="metadata"></video><div class="vid-icon">▶</div>` : `<img src="${m.url}" alt="${escapeHtml(m.filename)}" loading="lazy">`}
          </div>
        `;
      }).join('');

      let blockerHtml = '';
      if (entry.type === 'blocker') {
        if (entry.resolved) {
          blockerHtml = `
            <div class="blocker-status-box resolved">
              <span class="blocker-status-text">✅ Resolved</span>
              <small style="color:var(--mute); font-family:var(--mono);">Fixed</small>
            </div>
            ${entry.resolution_notes ? `
              <div class="resolution-box">
                <b>Resolution Notes:</b>
                <p>${escapeHtml(entry.resolution_notes)}</p>
              </div>
            ` : ''}
          `;
        } else {
          blockerHtml = `
            <div class="blocker-status-box" id="blocker-box-${entry.id}">
              <span class="blocker-status-text">⚠️ Open Blocker</span>
              <button class="resolve-btn" onclick="window.hubPromptResolve('${entry.id}')">Resolve Blocker</button>
            </div>
            <div id="resolve-form-${entry.id}" hidden style="margin-top:0.6rem; background:rgba(10,17,25,0.7); border:1px solid var(--edge); border-radius:6px; padding:0.6rem;">
              <label style="display:block; font-size:0.75rem; color:var(--type-progress); margin-bottom:0.3rem;">How did you fix it / resolution notes:</label>
              <textarea id="resolve-input-${entry.id}" style="width:100%; background:#000; border:1px solid var(--line); border-radius:4px; padding:0.4rem; color:#fff; font-family:inherit; font-size:0.85rem;" rows="2" placeholder="e.g. Swapped capacitor, fixed firmware timing..."></textarea>
              <div style="display:flex; justify-content:flex-end; gap:0.4rem; margin-top:0.4rem;">
                <button class="mini" onclick="window.hubCancelResolve('${entry.id}')" style="min-height:auto; padding:0.3rem 0.6rem;">Cancel</button>
                <button class="resolve-btn" onclick="window.hubSubmitResolve('${entry.id}')">Save Resolution</button>
              </div>
            </div>
          `;
        }
      }

      return `
        <div class="timeline-node" id="entry-${entry.id}">
          <div class="node-dot type-${entry.type}"></div>
          <div class="tl-entry-card ${entry.type === 'blocker' && !entry.resolved ? 'blocker-open' : ''}">
            <div class="tl-entry-top">
              <div style="display:flex; align-items:center; gap:0.4rem;">
                <span class="tl-proj-chip">${escapeHtml(entry.project_name || entry.project_id)}</span>
                ${entry.project_category ? `<span class="tl-category-tag">#${escapeHtml(entry.project_category)}</span>` : ''}
              </div>
              <span class="tl-time" title="${new Date(entry.timestamp).toLocaleString()}">${formatRelativeTime(entry.timestamp)}</span>
            </div>

            <div class="tl-title-row">
              <span class="tl-type-badge type-${entry.type}">${typeIcons[entry.type] || '•'} ${entry.type}</span>
              <h3 class="tl-entry-title">${escapeHtml(entry.title)}</h3>
            </div>

            ${entry.body ? `<div class="tl-entry-body">${escapeHtml(entry.body)}</div>` : ''}

            ${mediaHtml ? `<div class="tl-entry-media">${mediaHtml}</div>` : ''}

            ${blockerHtml}

            <div class="tl-entry-footer">
              <button onclick="window.hubDeleteEntry('${entry.id}')" class="del" title="Soft delete">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ----------------- Commit Submission -----------------
  async function submitCommit() {
    const projId = $('commit-project').value;
    const title = $('commit-title').value.trim();
    const body = $('commit-body').value.trim();

    if (!title && !body) {
      alert('Please enter a title or description for your update.');
      return;
    }

    const submitBtn = $('commit-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      // 1. Upload any attached media files
      const uploadedMedia = [];
      for (const m of App.commitMediaFiles) {
        const res = await apiPost('/api/media/upload', {
          project_id: projId,
          filename: m.name,
          data_base64: m.data_base64,
          mime_type: m.mime_type
        });
        if (res.success && res.media) {
          uploadedMedia.push(res.media);
        }
      }

      // 2. Save timeline commit
      await apiPost('/api/timeline', {
        project_id: projId,
        type: App.commitType,
        title: title || (App.commitType.toUpperCase() + ' update'),
        body: body,
        media: uploadedMedia,
        timestamp: Date.now()
      });

      // Clear form
      $('commit-title').value = '';
      $('commit-body').value = '';
      App.commitMediaFiles = [];
      renderMediaPreviews();

      // Refresh
      await loadTimeline();
      await loadProjects();
    } catch (e) {
      alert('Error recording commit: ' + e.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Record Commit';
    }
  }

  function renderMediaPreviews() {
    const container = $('media-previews');
    if (!App.commitMediaFiles.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = App.commitMediaFiles.map((m, idx) => {
      const isVid = m.mime_type.startsWith('video');
      return `
        <div class="media-preview-item">
          ${isVid ? `<video src="${m.data_base64}"></video>` : `<img src="${m.data_base64}" alt="${escapeHtml(m.name)}">`}
          <button class="remove-media" onclick="window.hubRemoveMedia(${idx})">×</button>
        </div>
      `;
    }).join('');
  }

  // ----------------- Blocker Resolution -----------------
  window.hubPromptResolve = function (entryId) {
    const form = $(`resolve-form-${entryId}`);
    if (form) form.hidden = false;
  };

  window.hubCancelResolve = function (entryId) {
    const form = $(`resolve-form-${entryId}`);
    if (form) form.hidden = true;
  };

  window.hubSubmitResolve = function (entryId) {
    const input = $(`resolve-input-${entryId}`);
    const notes = input ? input.value.trim() : '';
    apiPost('/api/timeline/resolve', {
      id: entryId,
      resolution_notes: notes || 'Resolved'
    }).then(() => {
      loadTimeline();
      loadProjects();
    }).catch(err => {
      alert('Failed to resolve blocker: ' + err.message);
    });
  };

  window.hubDeleteEntry = function (entryId) {
    if (confirm('Delete this timeline entry? (Recorded in history)')) {
      apiPost('/api/timeline/delete', { id: entryId }).then(() => {
        loadTimeline();
        loadProjects();
      });
    }
  };

  // ----------------- Focus Timer & PiP -----------------
  function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateTimerUI() {
    const t = App.timer;
    $('timer-digits').textContent = formatClock(t.secondsLeft);
    
    // Circle stroke dash offset (circumference = 2 * PI * 65 ≈ 408.4)
    const circumference = 408.4;
    const fraction = t.secondsLeft / t.totalSeconds;
    const offset = circumference * (1 - fraction);
    $('timer-ring-fg').style.strokeDashoffset = offset;

    // PiP sync if active
    if (t.pipWin && !t.pipWin.closed) {
      const pipClock = t.pipWin.document.getElementById('pip-clock');
      if (pipClock) pipClock.textContent = formatClock(t.secondsLeft);
    }
  }

  function startTimer() {
    const t = App.timer;
    if (t.running) return;

    t.running = true;
    t.startTime = Date.now();
    $('timer-state-label').textContent = 'FOCUS SESSION RUNNING';
    $('timer-start-btn').textContent = 'Pause';
    $('timer-start-btn').classList.remove('start');
    $('timer-start-btn').classList.add('pause');

    t.intervalId = setInterval(() => {
      if (t.secondsLeft > 0) {
        t.secondsLeft--;
        updateTimerUI();
      } else {
        stopTimer(true); // Completed!
      }
    }, 1000);
  }

  function pauseTimer() {
    const t = App.timer;
    if (!t.running) return;

    t.running = false;
    clearInterval(t.intervalId);
    $('timer-state-label').textContent = 'SESSION PAUSED';
    $('timer-start-btn').textContent = 'Resume';
    $('timer-start-btn').classList.remove('pause');
    $('timer-start-btn').classList.add('start');
  }

  async function stopTimer(completed = false) {
    const t = App.timer;
    clearInterval(t.intervalId);
    t.running = false;

    const elapsedSeconds = t.totalSeconds - t.secondsLeft;
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    if (elapsedMinutes >= 1 && (completed || confirm(`Save ${elapsedMinutes} minute work session?`))) {
      const summary = prompt('Session summary (optional):', completed ? 'Completed focus block' : 'Focused work session') || '';
      try {
        await apiPost('/api/sessions', {
          project_id: t.projectId || $('timer-project').value,
          start_time: t.startTime || (Date.now() - elapsedSeconds * 1000),
          end_time: Date.now(),
          duration_minutes: elapsedMinutes,
          summary: summary
        });

        // Also add a timeline progress commit
        await apiPost('/api/timeline', {
          project_id: t.projectId || $('timer-project').value,
          type: 'progress',
          title: `Work Session: ${elapsedMinutes} mins`,
          body: summary || `Logged ${elapsedMinutes} minutes of focused work.`,
          timestamp: Date.now()
        });

        await loadProjects();
        await loadSessions();
      } catch (e) {
        console.error('Failed to save session:', e);
      }
    }

    t.secondsLeft = t.totalSeconds;
    $('timer-state-label').textContent = 'READY TO FOCUS';
    $('timer-start-btn').textContent = 'Start Session';
    $('timer-start-btn').classList.remove('pause');
    $('timer-start-btn').classList.add('start');
    updateTimerUI();
  }

  // Document Picture-in-Picture (Always on top overlay for Windows 11)
  async function togglePiP() {
    if (!('documentPictureInPicture' in window)) {
      alert('Document Picture-in-Picture is supported on modern Chrome / Edge on Windows 11. You can still keep the browser open while working!');
      return;
    }

    const t = App.timer;
    if (t.pipWin && !t.pipWin.closed) {
      t.pipWin.close();
      t.pipWin = null;
      return;
    }

    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 220
      });
      t.pipWin = pipWin;

      // Copy fonts & styles into PiP
      const pipDoc = pipWin.document;
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
        pipDoc.head.appendChild(node.cloneNode(true));
      });

      pipDoc.body.style.background = '#0a1119';
      pipDoc.body.style.margin = '0';
      pipDoc.body.style.padding = '12px';
      pipDoc.body.style.display = 'flex';
      pipDoc.body.style.flexDirection = 'column';
      pipDoc.body.style.alignItems = 'center';
      pipDoc.body.style.justifyContent = 'center';
      pipDoc.body.style.fontFamily = "'Chakra Petch', monospace";
      pipDoc.body.style.color = '#e6eff4';

      pipDoc.body.innerHTML = `
        <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#7cc4cc; margin-bottom:4px;">Roadmap Buddy Focus</div>
        <div id="pip-clock" style="font-size:2.8rem; font-weight:600; font-family:monospace; color:#fff;">${formatClock(t.secondsLeft)}</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="pip-toggle" style="background:#7cc4cc; color:#06161a; border:none; border-radius:4px; font-weight:700; padding:6px 14px; cursor:pointer;">${t.running ? 'Pause' : 'Start'}</button>
          <button id="pip-stop" style="background:rgba(248,113,113,0.2); color:#f87171; border:1px solid #f87171; border-radius:4px; font-weight:600; padding:6px 12px; cursor:pointer;">End</button>
        </div>
      `;

      pipDoc.getElementById('pip-toggle').onclick = () => {
        if (t.running) pauseTimer();
        else startTimer();
        pipDoc.getElementById('pip-toggle').textContent = t.running ? 'Pause' : 'Start';
      };

      pipDoc.getElementById('pip-stop').onclick = () => {
        stopTimer(false);
        pipWin.close();
      };
    } catch (e) {
      console.error('PiP error:', e);
    }
  }

  // In-flight entry logging while timer is running
  async function submitInflightEntry() {
    const input = $('inflight-input');
    const text = input.value.trim();
    if (!text) return;

    const type = $('inflight-type').value;
    const projId = App.timer.projectId || $('timer-project').value;

    try {
      await apiPost('/api/timeline', {
        project_id: projId,
        type: type,
        title: text,
        body: `Logged during focus session at ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now()
      });
      input.value = '';
      await loadTimeline();
      await loadProjects();
    } catch (e) {
      alert('Error saving in-flight note: ' + e.message);
    }
  }

  function renderRecentSessions() {
    const container = $('recent-sessions-list');
    if (!App.sessions.length) {
      container.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--mute); font-size:0.85rem;">No recent sessions logged yet.</div>`;
      return;
    }
    container.innerHTML = App.sessions.slice(0, 8).map(s => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.6rem; border-bottom:1px solid var(--line); font-size:0.85rem;">
        <div>
          <b style="color:var(--ink);">${escapeHtml(s.project_name || s.project_id)}</b>
          <span style="color:var(--mute); font-size:0.75rem; margin-left:0.4rem;">${escapeHtml(s.summary || 'Focus session')}</span>
        </div>
        <div style="text-align:right;">
          <span style="font-family:var(--mono); color:var(--accent); font-weight:600;">${s.duration_minutes}m</span>
          <div style="font-size:0.7rem; color:var(--mute); font-family:var(--mono);">${new Date(s.start_time).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  }

  // ----------------- Projects Hub -----------------
  let projectFilterCategory = 'all';

  function renderProjects() {
    const container = $('projects-grid');
    let projs = App.projects.filter(p => !p.deleted);

    if (projectFilterCategory !== 'all') {
      projs = projs.filter(p => p.category === projectFilterCategory);
    }

    if (!projs.length) {
      container.innerHTML = `
        <div class="card" style="grid-column:1/-1; text-align:center; padding:2.5rem 1rem; color:var(--mute);">
          <p style="font-size:1.1rem; color:var(--ink); margin-bottom:0.4rem;">No projects in this category</p>
          <small>Click "+ New Project" above to create one!</small>
        </div>
      `;
      return;
    }

    container.innerHTML = projs.map(p => {
      const totalHrs = ((p.total_minutes || 0) / 60).toFixed(1);
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return `
        <div class="proj-card">
          <div class="proj-cover-strip">
            ${p.cover_image ? `<img src="${p.cover_image}" alt="${escapeHtml(p.name)}">` : ''}
            <span class="proj-cat-badge">${escapeHtml(p.category)}</span>
          </div>

          <div class="proj-card-body">
            <h3 class="proj-card-title">${escapeHtml(p.name)}</h3>
            <p class="proj-card-desc">${escapeHtml(p.description || 'No description provided.')}</p>

            ${tags.length ? `
              <div class="proj-tags-row">
                ${tags.map(t => `<span class="proj-tag-chip">#${escapeHtml(t)}</span>`).join('')}
              </div>
            ` : ''}

            <div class="proj-stats-row">
              <div class="proj-stat-cell">
                <b>${totalHrs}h</b>
                <span>Invested</span>
              </div>
              <div class="proj-stat-cell">
                <b>${p.commits_count || 0}</b>
                <span>Commits</span>
              </div>
              <div class="proj-stat-cell ${(p.open_blockers || 0) > 0 ? 'blockers-alert' : ''}">
                <b>${p.open_blockers || 0}</b>
                <span>Blockers</span>
              </div>
            </div>

            <div class="proj-card-actions">
              <button onclick="window.hubFilterProjectTimeline('${p.id}')">⚡ Timeline</button>
              <button onclick="window.hubStartTimerForProject('${p.id}')">⏱️ Work</button>
              <button onclick="window.hubOpenProjectSpecs('${p.id}')">📝 Specs</button>
              <button onclick="window.hubEditProject('${p.id}')">⚙️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.hubFilterProjectTimeline = function (projId) {
    App.filterProjectId = projId;
    $('filter-project').value = projId;
    setTab('timeline');
  };

  window.hubStartTimerForProject = function (projId) {
    App.timer.projectId = projId;
    $('timer-project').value = projId;
    setTab('timer');
  };

  // ----------------- Project Modals -----------------
  let editingProjectId = null;

  window.hubOpenNewProjectModal = function () {
    editingProjectId = null;
    $('proj-modal-title').textContent = 'Register New Project';
    $('proj-modal-name').value = '';
    $('proj-modal-desc').value = '';
    $('proj-modal-cat').value = 'hardware';
    $('proj-modal-tags').value = '';
    $('proj-modal-cover').value = '';
    $('proj-modal').hidden = false;
  };

  window.hubEditProject = function (projId) {
    const p = App.projects.find(x => x.id === projId);
    if (!p) return;
    editingProjectId = projId;
    $('proj-modal-title').textContent = 'Edit Project: ' + p.name;
    $('proj-modal-name').value = p.name;
    $('proj-modal-desc').value = p.description || '';
    $('proj-modal-cat').value = p.category || 'hardware';
    $('proj-modal-tags').value = (p.tags || []).join(', ');
    $('proj-modal-cover').value = p.cover_image || '';
    $('proj-modal').hidden = false;
  };

  window.hubCloseProjectModal = function () {
    $('proj-modal').hidden = true;
  };

  window.hubSaveProjectModal = async function () {
    const name = $('proj-modal-name').value.trim();
    if (!name) {
      alert('Please enter a project name');
      return;
    }

    const payload = {
      name: name,
      description: $('proj-modal-desc').value.trim(),
      category: $('proj-modal-cat').value,
      tags: $('proj-modal-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      cover_image: $('proj-modal-cover').value.trim() || null
    };

    if (editingProjectId) {
      payload.id = editingProjectId;
    }

    try {
      await apiPost('/api/projects', payload);
      window.hubCloseProjectModal();
      await loadProjects();
    } catch (e) {
      alert('Failed to save project: ' + e.message);
    }
  };

  window.hubDeleteProjectCurrent = async function () {
    if (!editingProjectId) return;
    if (confirm('Delete this project? It will be soft-deleted and preserved in history.')) {
      try {
        await apiPost('/api/projects/delete', { id: editingProjectId });
        window.hubCloseProjectModal();
        await loadProjects();
      } catch (e) {
        alert('Failed to delete project: ' + e.message);
      }
    }
  };

  // Specs & Free-form Notes Modal
  let activeSpecsProjId = null;

  window.hubOpenProjectSpecs = function (projId) {
    const p = App.projects.find(x => x.id === projId);
    if (!p) return;
    activeSpecsProjId = projId;
    $('specs-modal-title').textContent = `${p.name} // Specs & Notes`;
    $('specs-modal-content').value = p.notes || '';
    $('specs-modal').hidden = false;
  };

  window.hubCloseSpecsModal = function () {
    $('specs-modal').hidden = true;
  };

  window.hubSaveSpecsModal = async function () {
    if (!activeSpecsProjId) return;
    const p = App.projects.find(x => x.id === activeSpecsProjId);
    if (!p) return;

    const notes = $('specs-modal-content').value;
    try {
      await apiPost('/api/projects', {
        id: activeSpecsProjId,
        name: p.name,
        description: p.description,
        category: p.category,
        tags: p.tags,
        cover_image: p.cover_image,
        notes: notes
      });
      window.hubCloseSpecsModal();
      await loadProjects();
    } catch (e) {
      alert('Failed to save specs: ' + e.message);
    }
  };

  // ----------------- Calendar View -----------------
  function renderCalendar() {
    const year = App.calendar.year;
    const month = App.calendar.month;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    $('cal-month-name').textContent = `${monthNames[month - 1]} ${year}`;

    const daysData = App.calendar.data.days || {};
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    
    // Day of week: 0=Sun, 1=Mon... Let's use Mon=0 .. Sun=6
    let startingDay = firstDay.getUTCDay() - 1;
    if (startingDay < 0) startingDay = 6;

    const daysInMonth = lastDay.getUTCDate();
    const prevMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const grid = $('cal-grid');
    let cellsHtml = '';

    // Leading days from previous month
    for (let i = startingDay - 1; i >= 0; i--) {
      cellsHtml += `<div class="cal-day-cell other-month"><span class="cal-day-num">${prevMonthLastDay - i}</span></div>`;
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = daysData[dateStr] || { sessions_count: 0, total_minutes: 0, commits: [], events: [] };
      const events = dayData.events || [];
      const hasEvents = events.length > 0;
      const hasWork = (dayData.sessions_count > 0 || (dayData.commits && dayData.commits.length > 0) || hasEvents);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === App.calendar.selectedDate;

      const dotsHtml = (dayData.commits || []).slice(0, 4).map(c => 
        `<span class="cal-dot ${c.type}"></span>`
      ).join('');

      let evBadgeHtml = '';
      if (hasEvents) {
        const topEv = events[0];
        const icon = topEv.type === 'exam' ? '🎯' : (topEv.type === 'test' ? '📝' : '📌');
        evBadgeHtml = `<span class="cal-ev-badge" title="${escapeHtml(events.map(e => e.name).join('; '))}">${icon} ${escapeHtml(topEv.name.slice(0, 12))}</span>`;
      }

      cellsHtml += `
        <div class="cal-day-cell ${hasWork ? 'has-work' : ''} ${hasEvents ? 'has-event' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" 
             onclick="window.hubSelectCalendarDay('${dateStr}')">
          <span class="cal-day-num">${day}</span>
          <div class="cal-day-badges">
            ${evBadgeHtml}
            ${dayData.total_minutes > 0 ? `<span class="cal-min-badge">${dayData.total_minutes}m</span>` : ''}
            ${dotsHtml ? `<div class="cal-commit-dots">${dotsHtml}</div>` : ''}
          </div>
        </div>
      `;
    }

    grid.innerHTML = cellsHtml;
    renderCalendarDayDetails();
  }

  window.hubSelectCalendarDay = function (dateStr) {
    App.calendar.selectedDate = dateStr;
    renderCalendar();
  };

  function renderCalendarDayDetails() {
    const dateStr = App.calendar.selectedDate;
    const container = $('cal-day-details');
    const dayData = (App.calendar.data.days || {})[dateStr] || { sessions_count: 0, total_minutes: 0, commits: [], events: [] };

    const dateFormatted = new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    $('cal-selected-day-title').textContent = dateFormatted;

    const events = dayData.events || [];
    const hasWork = (dayData.sessions_count > 0 || (dayData.commits && dayData.commits.length > 0));

    if (!hasWork && !events.length) {
      container.innerHTML = `<p style="color:var(--mute); font-size:0.88rem;">No activity, sessions, or deadlines recorded on this date.</p>`;
      return;
    }

    let eventsSection = '';
    if (events.length) {
      eventsSection = `
        <div style="margin-bottom:0.9rem; background:rgba(246,193,66,0.06); border:1px solid rgba(246,193,66,0.25); border-radius:6px; padding:0.6rem 0.8rem;">
          <h4 style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.1em; color:#f6c142; margin:0 0 0.5rem; display:flex; align-items:center; gap:0.4rem;">
            🎯 Scheduled Deadlines & Exams (${events.length})
          </h4>
          ${events.map(ev => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.88rem;">
              <div>
                <b style="color:#fff;">${ev.type === 'exam' ? '🎯' : (ev.type === 'test' ? '📝' : '📌')} ${escapeHtml(ev.name)}</b>
                ${ev.note ? `<div style="color:var(--mute); font-size:0.75rem; margin-top:2px;">${escapeHtml(ev.note)}</div>` : ''}
              </div>
              <span style="font-family:var(--mono); font-size:0.7rem; color:#f6c142; text-transform:uppercase; background:rgba(246,193,66,0.15); border:1px solid rgba(246,193,66,0.3); padding:0.1rem 0.4rem; border-radius:3px;">${ev.type}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    const commitsHtml = (dayData.commits || []).map(c => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.88rem;">
        <div>
          <span class="tl-type-badge type-${c.type}" style="margin-right:0.4rem;">${c.type}</span>
          <b>${escapeHtml(c.title)}</b>
          <small style="color:var(--mute); margin-left:0.4rem;">[${escapeHtml(c.project_name)}]</small>
        </div>
        <span style="font-family:var(--mono); font-size:0.75rem; color:var(--mute);">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('');

    container.innerHTML = `
      ${eventsSection}
      <div class="day-stat-line">
        ⏱ Total Focus: <b>${dayData.total_minutes} mins</b> across <b>${dayData.sessions_count} sessions</b> · <b>${(dayData.commits || []).length} commits</b>
      </div>
      <div style="margin-top:0.6rem;">
        <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent); margin:0 0 0.4rem;">Commits on this day</h4>
        ${commitsHtml || '<p style="color:var(--mute); font-size:0.85rem;">No commits recorded directly on this date.</p>'}
      </div>
    `;
  }

  // ----------------- Lightbox Modal -----------------
  window.hubOpenLightbox = function (url, isVideo, caption) {
    App.lightbox = { open: true, url, isVideo, caption };
    const content = $('lightbox-media-container');
    if (isVideo) {
      content.innerHTML = `<video src="${url}" controls autoplay></video>`;
    } else {
      content.innerHTML = `<img src="${url}" alt="${escapeHtml(caption)}">`;
    }
    $('lightbox-caption').textContent = caption || '';
    $('lightbox-modal').hidden = false;
  };

  window.hubCloseLightbox = function () {
    App.lightbox.open = false;
    $('lightbox-media-container').innerHTML = '';
    $('lightbox-modal').hidden = true;
  };

  // Keyboard shortcut: Esc to close modal/lightbox
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!App.lightbox.open) {
        window.hubCloseProjectModal();
        window.hubCloseSpecsModal();
      } else {
        window.hubCloseLightbox();
      }
    }
  });

  // ----------------- Event Listeners Setup -----------------
  function initEvents() {
    // Navigation Tabs
    document.querySelectorAll('.hub-nav button, .nav-tab-btn').forEach(btn => {
      btn.onclick = (e) => {
        const b = e.currentTarget || btn;
        const targetTab = b.dataset.v || b.dataset.tab || 'home';
        setTab(targetTab);
      };
    });

    // Commit type selectors
    document.querySelectorAll('.type-pill-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.type-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        App.commitType = btn.dataset.type;
      };
    });

    // Commit box media input
    const fileInput = $('commit-file-input');
    fileInput.onchange = e => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = ev => {
          App.commitMediaFiles.push({
            name: file.name,
            mime_type: file.type || 'image/jpeg',
            data_base64: ev.target.result
          });
          renderMediaPreviews();
        };
        reader.readAsDataURL(file);
      }
      fileInput.value = '';
    };

    window.hubRemoveMedia = function (idx) {
      App.commitMediaFiles.splice(idx, 1);
      renderMediaPreviews();
    };

    $('commit-submit-btn').onclick = submitCommit;

    // Timeline filters
    $('filter-project').onchange = e => {
      App.filterProjectId = e.target.value;
      loadTimeline();
    };

    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        App.filterType = pill.dataset.type;
        loadTimeline();
      };
    });

    $('filter-search').oninput = e => {
      App.filterSearch = e.target.value;
      renderTimeline();
    };

    // Timer Duration Presets
    document.querySelectorAll('.duration-pill').forEach(pill => {
      pill.onclick = () => {
        if (App.timer.running) return;
        document.querySelectorAll('.duration-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const mins = parseInt(pill.dataset.mins, 10);
        App.timer.totalSeconds = mins * 60;
        App.timer.secondsLeft = mins * 60;
        updateTimerUI();
      };
    });

    $('timer-project').onchange = e => {
      App.timer.projectId = e.target.value;
      loadSessions();
    };

    $('timer-start-btn').onclick = () => {
      if (App.timer.running) pauseTimer();
      else startTimer();
    };

    $('timer-stop-btn').onclick = () => stopTimer(false);
    $('timer-pip-btn').onclick = togglePiP;
    $('inflight-submit-btn').onclick = submitInflightEntry;
    $('inflight-input').onkeydown = e => {
      if (e.key === 'Enter') submitInflightEntry();
    };

    // Projects category filter
    document.querySelectorAll('.proj-cat-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.proj-cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        projectFilterCategory = pill.dataset.cat;
        renderProjects();
      };
    });

    $('new-project-btn').onclick = window.hubOpenNewProjectModal;
    $('proj-modal-save').onclick = window.hubSaveProjectModal;
    $('proj-modal-close').onclick = window.hubCloseProjectModal;
    $('proj-modal-delete').onclick = window.hubDeleteProjectCurrent;
    $('specs-modal-save').onclick = window.hubSaveSpecsModal;
    $('specs-modal-close').onclick = window.hubCloseSpecsModal;
    $('lightbox-close').onclick = window.hubCloseLightbox;

    // Calendar navigation
    $('cal-prev-month').onclick = () => {
      App.calendar.month--;
      if (App.calendar.month < 1) {
        App.calendar.month = 12;
        App.calendar.year--;
      }
      loadCalendar();
    };

    $('cal-next-month').onclick = () => {
      App.calendar.month++;
      if (App.calendar.month > 12) {
        App.calendar.month = 1;
        App.calendar.year++;
      }
      loadCalendar();
    };

    $('cal-today-btn').onclick = () => {
      const now = new Date();
      App.calendar.year = now.getFullYear();
      App.calendar.month = now.getMonth() + 1;
      App.calendar.selectedDate = now.toISOString().slice(0, 10);
      loadCalendar();
    };
    // Expose Hub loaders globally
    window.hubLoadTimeline = loadTimeline;
    window.hubLoadProjects = loadProjects;
    window.hubLoadCalendar = loadCalendar;
    window.hubLoadSessions = loadSessions;
    window.hubApp = App;
  }

  // Initial Load
  window.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    updateTimerUI();
    await loadProjects();
    await loadTimeline();

    let initialHash = window.location.hash.replace('#', '');
    if (!initialHash || initialHash === 'undefined' || initialHash === 'null') {
      initialHash = 'home';
    }
    setTab(initialHash);

    window.addEventListener('hashchange', () => {
      let h = window.location.hash.replace('#', '');
      if (!h || h === 'undefined' || h === 'null') h = 'home';
      setTab(h);
    });
  });

  window.hubLoadTimeline = loadTimeline;
  window.hubLoadProjects = loadProjects;
  window.hubLoadCalendar = loadCalendar;
  window.hubLoadSessions = loadSessions;
  window.hubApp = App;

})();
