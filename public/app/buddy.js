/* buddy.js: Interactive AI Buddy Drawer & Real-Time Vault Copilot.
   Connects UI to the server.py daemon and local Ollama.
   Includes Phase 3 (Reflexive Rebalancer) & Phase 4 (Daily Briefing & Auto-Git).
*/
(function(){
  'use strict';

  // Inject styles for the Buddy Drawer
  const style = document.createElement('style');
  style.textContent = `
    #buddy-btn {
      position: fixed;
      right: 1.2rem;
      bottom: 4.8rem;
      z-index: 99;
      background: linear-gradient(135deg, #1f6f78, #0f4046);
      color: #7cc4cc;
      border: 1.5px solid #2a4357;
      border-radius: 50px;
      padding: 0.6rem 1rem;
      font: 600 0.85rem 'Chakra Petch', system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 0.45rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    #buddy-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(124,196,204,0.3);
      border-color: #7cc4cc;
      color: #fff;
    }
    #buddy-btn .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #7cc4cc;
      box-shadow: 0 0 8px #7cc4cc;
    }
    #buddy-btn.offline .dot {
      background: #e0902f;
      box-shadow: none;
    }

    #buddy-panel {
      position: fixed;
      right: 1.2rem;
      bottom: 8rem;
      width: min(25rem, calc(100vw - 2.4rem));
      height: 32rem;
      max-height: calc(100vh - 9.5rem);
      background: #0f1b26;
      border: 1px solid #1f3547;
      border-radius: 1.2rem;
      box-shadow: 0 12px 36px rgba(0,0,0,0.65);
      z-index: 100;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Chakra Petch', system-ui, sans-serif;
    }
    #buddy-panel[hidden] {
      display: none !important;
    }
    .b-head {
      background: #142230;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #1f3547;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .b-head h3 {
      margin: 0;
      font-size: 0.95rem;
      color: #7cc4cc;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .b-head button {
      background: transparent;
      border: none;
      color: #93a9b8;
      cursor: pointer;
      font-size: 1.1rem;
      padding: 0 0.2rem;
      min-height: auto;
    }
    .b-sub {
      font-size: 0.72rem;
      color: #93a9b8;
      display: block;
      margin-top: 1px;
    }
    .b-messages {
      flex: 1;
      overflow-y: auto;
      padding: 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .b-msg {
      padding: 0.65rem 0.85rem;
      border-radius: 0.8rem;
      max-width: 88%;
      word-break: break-word;
    }
    .b-msg.user {
      align-self: flex-end;
      background: #1b2f40;
      color: #e6eff4;
      border: 1px solid #2a4357;
    }
    .b-msg.bot {
      align-self: flex-start;
      background: #14202b;
      color: #d8e5ec;
      border: 1px solid #1b2f40;
    }
    .b-briefing-card {
      background: linear-gradient(180deg, #162a38, #0f1d28);
      border: 1px solid #2a495e;
      border-left: 3px solid #7cc4cc;
      border-radius: 0.8rem;
      padding: 0.75rem 0.85rem;
      font-size: 0.82rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .b-briefing-card b {
      color: #7cc4cc;
    }
    .b-rebalance-card {
      background: #142230;
      border: 1px solid #244158;
      border-radius: 0.8rem;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .b-rebalance-card h4 {
      margin: 0;
      color: #e0902f;
      font-size: 0.88rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .b-proposal-row {
      background: #0d1720;
      border: 1px solid #1a2f3f;
      border-radius: 0.5rem;
      padding: 0.4rem 0.6rem;
      font-size: 0.75rem;
    }
    .b-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.45rem 0.8rem;
      border-top: 1px solid #192a38;
      background: #0a1119;
    }
    .b-chip {
      background: #142230;
      border: 1px solid #1f3547;
      border-radius: 999px;
      padding: 0.25rem 0.6rem;
      font-size: 0.72rem;
      color: #7cc4cc;
      cursor: pointer;
      min-height: auto;
    }
    .b-chip:hover {
      border-color: #7cc4cc;
      background: #1a2f42;
    }
    .b-chip.special {
      color: #e0902f;
      border-color: #553c1c;
    }
    .b-chip.special:hover {
      border-color: #e0902f;
    }
    .b-action-card {
      margin-top: 0.4rem;
      padding: 0.6rem;
      background: #0d1a24;
      border: 1px dashed #7cc4cc;
      border-radius: 0.6rem;
    }
    .b-action-card button, .b-rebalance-card button {
      background: #1f6f78;
      color: #fff;
      border: none;
      padding: 0.4rem 0.65rem;
      border-radius: 0.5rem;
      font-size: 0.78rem;
      cursor: pointer;
      font-weight: 600;
      width: 100%;
      margin-top: 0.35rem;
      min-height: auto;
    }
    .b-action-card button:hover, .b-rebalance-card button:hover {
      background: #2a8a95;
    }
    .b-input-row {
      display: flex;
      gap: 0.4rem;
      padding: 0.6rem 0.8rem;
      background: #142230;
      border-top: 1px solid #1f3547;
    }
    .b-input-row input {
      flex: 1;
      background: #0a1119;
      border: 1px solid #2a4357;
      border-radius: 0.6rem;
      padding: 0.45rem 0.65rem;
      color: #e6eff4;
      font: inherit;
      font-size: 0.82rem;
    }
    .b-input-row input:focus {
      outline: 1.5px solid #7cc4cc;
    }
    .b-input-row button {
      background: #1f6f78;
      color: #fff;
      border: none;
      border-radius: 0.6rem;
      padding: 0 0.8rem;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      min-height: auto;
    }
  `;
  document.head.append(style);

  // Create UI Elements
  const btn = document.createElement('button');
  btn.id = 'buddy-btn';
  btn.type = 'button';
  btn.innerHTML = '<span class="dot"></span><span>AI Buddy</span>';
  document.body.append(btn);

  const panel = document.createElement('div');
  panel.id = 'buddy-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="b-head">
      <div>
        <h3>🤖 Roadmap Copilot</h3>
        <span class="b-sub" id="b-model-status">Connecting to local daemon...</span>
      </div>
      <button id="b-close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="b-messages" id="b-msgs">
      <div class="b-msg bot">
        Hello! I'm your adaptive Roadmap Buddy. I actively balance your schedule, log your sessions directly to the vault, and keep your git history in sync.
      </div>
    </div>
    <div class="b-chips">
      <button class="b-chip special" id="b-savepoint-btn" type="button">📍 Where I Left Off</button>
      <button class="b-chip special" id="b-briefing-btn" type="button">🌅 Daily Briefing</button>
      <button class="b-chip special" id="b-rebalance-btn" type="button">⚖️ Rebalance</button>
      <button class="b-chip special" id="b-git-btn" type="button">💾 Auto-Commit</button>
      <button class="b-chip" type="button" data-prompt="What should I focus on right now?">⚡ Next Focus</button>
      <button class="b-chip" type="button" data-prompt="Break down my active project into 3 small steps">💡 Decompose</button>
    </div>
    <form class="b-input-row" id="b-form">
      <input type="text" id="b-in" placeholder="Ask Buddy, log sessions, or shift dates..." autocomplete="off">
      <button type="submit">Send</button>
    </form>
  `;
  document.body.append(panel);

  const msgs = panel.querySelector('#b-msgs');
  const input = panel.querySelector('#b-in');
  const form = panel.querySelector('#b-form');
  const closeBtn = panel.querySelector('#b-close');
  const statusEl = panel.querySelector('#b-model-status');

  let history = [];
  let briefingLoaded = false;

  // Toggle drawer
  btn.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      input.focus();
      if (!briefingLoaded) {
        loadBriefing();
        briefingLoaded = true;
      }
    }
  };
  closeBtn.onclick = () => { panel.hidden = true; };

  // Check daemon status
  function checkDaemon() {
    fetch('/api/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) throw new Error('Offline');
        if (data.ollama_available && data.selected_model) {
          statusEl.textContent = `🟢 ${data.selected_model} (Live)`;
          btn.classList.remove('offline');
        } else {
          statusEl.textContent = '🟡 Daemon running (Ollama starting...)';
          btn.classList.add('offline');
        }
      })
      .catch(() => {
        statusEl.textContent = '⚪ Daemon offline (Run python server.py)';
        btn.classList.add('offline');
      });
  }
  setInterval(checkDaemon, 15000);
  checkDaemon();

  function appendMsg(text, sender) {
    const d = document.createElement('div');
    d.className = 'b-msg ' + sender;
    d.textContent = text;
    msgs.append(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  // Save Point Screen
  panel.querySelector('#b-savepoint-btn').onclick = () => {
    if (typeof window.showSavePoint === 'function') {
      window.showSavePoint();
    }
  };

  // Phase 4: Daily Briefing
  function loadBriefing() {
    fetch('/api/briefing')
      .then(r => r.json())
      .then(b => {
        const card = document.createElement('div');
        card.className = 'b-briefing-card';
        card.innerHTML = `
          <div><b>🌅 Daily Briefing · ${b.date || 'Today'}</b></div>
          <div>🎯 <b>Focus:</b> ${b.focus}</div>
          <div>📡 <b>Radar:</b> ${b.radar}</div>
          <div>💡 <i>"${b.insight}"</i></div>
        `;
        msgs.append(card);
        msgs.scrollTop = msgs.scrollHeight;
      })
      .catch(() => {});
  }
  panel.querySelector('#b-briefing-btn').onclick = loadBriefing;

  // Phase 3: Reflexive Rebalancing
  function loadRebalance() {
    const thinking = appendMsg('Analyzing velocity and upcoming calendar deadlines...', 'bot');
    fetch('/api/rebalance')
      .then(r => r.json())
      .then(res => {
        thinking.remove();
        const card = document.createElement('div');
        card.className = 'b-rebalance-card';
        
        let propsHtml = '';
        if (res.proposals && res.proposals.length > 0) {
          propsHtml = res.proposals.map(p => `
            <div class="b-proposal-row">
              <strong>${p.name || p.id}</strong>: ${p.suggested_action}<br>
              <span style="color:#93a9b8">${p.reason}</span>
            </div>
          `).join('');
        } else {
          propsHtml = '<div class="b-proposal-row" style="color:#7cc4cc">✅ Your roadmap is well calibrated with your current velocity!</div>';
        }

        card.innerHTML = `
          <h4>⚖️ Reflexive Rebalance Analysis</h4>
          <div style="font-size:0.78rem;color:#93a9b8">
            Velocity: ~${res.velocity.avg_minutes_per_day} min/day (${res.velocity.count} sessions in 7d).
          </div>
          <div style="font-size:0.82rem;margin-top:2px;">${res.summary}</div>
          ${propsHtml}
        `;

        if (res.proposals && res.proposals.length > 0) {
          const applyBtn = document.createElement('button');
          applyBtn.textContent = `Apply ${res.proposals.length} Schedule Shift(s)`;
          applyBtn.onclick = () => {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Applying...';
            fetch('/api/rebalance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adjustments: res.proposals })
            })
              .then(r => r.json())
              .then(r2 => {
                applyBtn.textContent = '✅ Shifts Applied to Vault';
                if (typeof toast === 'function') toast('✅ Rebalanced deadlines updated in Vault');
                if (typeof renderCalendar === 'function') renderCalendar();
                if (typeof renderAll === 'function') renderAll();
              });
          };
          card.append(applyBtn);
        }

        msgs.append(card);
        msgs.scrollTop = msgs.scrollHeight;
      })
      .catch(() => {
        thinking.remove();
        appendMsg('Could not run rebalancer. Ensure server.py is running.', 'bot');
      });
  }
  panel.querySelector('#b-rebalance-btn').onclick = loadRebalance;

  // Phase 4: Autonomous Git Commit
  function runAutoCommit() {
    const thinking = appendMsg('Checking working tree and asking Ollama to write commit message...', 'bot');
    fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(r => r.json())
      .then(res => {
        thinking.remove();
        if (res.committed) {
          appendMsg(`💾 Auto-Committed: [${res.hash}] "${res.message}"`, 'bot');
          if (typeof toast === 'function') toast('💾 Git commit created: ' + res.hash);
        } else {
          appendMsg(`ℹ️ Git: ${res.message || res.error || 'Clean tree'}`, 'bot');
        }
      })
      .catch(() => {
        thinking.remove();
        appendMsg('Failed to run git commit.', 'bot');
      });
  }
  panel.querySelector('#b-git-btn').onclick = runAutoCommit;

  function handleAction(act) {
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(act)
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          if (typeof toast === 'function') toast('✅ Action saved to vault: ' + act.action);
          if (act.action === 'LOG_SESSION' && typeof finish === 'function') {
            if (typeof renderAll === 'function') renderAll();
          }
          appendMsg('✅ Applied to vault: ' + act.action, 'bot');
        }
      })
      .catch(() => {
        if (typeof toast === 'function') toast('Failed to apply action');
      });
  }

  function sendMessage(text) {
    if (!text.trim()) return;
    appendMsg(text, 'user');
    history.push({ role: 'user', content: text });
    input.value = '';

    const thinking = appendMsg('Thinking...', 'bot');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history })
    })
      .then(r => r.json())
      .then(data => {
        thinking.remove();
        const reply = data.reply || 'No response from model.';
        appendMsg(reply, 'bot');
        history.push({ role: 'assistant', content: reply });

        if (data.actions && data.actions.length > 0) {
          for (const act of data.actions) {
            const card = document.createElement('div');
            card.className = 'b-action-card';
            card.innerHTML = `<strong>Suggested Action:</strong> ${act.action}<br><code>${JSON.stringify(act.data)}</code><br>`;
            const applyBtn = document.createElement('button');
            applyBtn.textContent = 'Apply to Vault & UI';
            applyBtn.onclick = () => {
              applyBtn.disabled = true;
              applyBtn.textContent = 'Applied';
              handleAction(act);
            };
            card.append(applyBtn);
            msgs.append(card);
            msgs.scrollTop = msgs.scrollHeight;
          }
        }
      })
      .catch(() => {
        thinking.remove();
        appendMsg('Connection error to server daemon. Ensure server.py is running.', 'bot');
      });
  }

  form.onsubmit = e => {
    e.preventDefault();
    sendMessage(input.value);
  };

  // Quick Chips
  panel.querySelectorAll('.b-chip[data-prompt]').forEach(c => {
    c.onclick = () => {
      const p = c.dataset.prompt;
      if (p) sendMessage(p);
    };
  });

})();
