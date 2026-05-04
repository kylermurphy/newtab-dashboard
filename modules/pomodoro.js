/* modules/pomodoro.js — Pomodoro focus timer */
'use strict';

window.PomodoroModule = {
  title: 'Pomodoro',
  defaultSize: { w: 300, h: 380 },

  mount(container, instanceId) {
    const { el, attr, shell } = window.sec;
    const STORAGE_KEY = `pomodoro_cfg_${instanceId}`;

    // ── Config (user-adjustable) ───────────────────────────────────────────
    let cfg = {
      workMins:  25,
      shortMins: 5,
      longMins:  15,
      longAfter: 4,   // long break after N pomodoros
    };

    // ── State ──────────────────────────────────────────────────────────────
    let phase     = 'work';   // 'work' | 'short' | 'long'
    let secsLeft  = cfg.workMins * 60;
    let running   = false;
    let ticker    = null;
    let sessions  = 0;        // completed work sessions this sitting
    let showCfg   = false;

    // ── Load cfg ───────────────────────────────────────────────────────────
    function loadCfg(cb) {
      chrome.storage.local.get([STORAGE_KEY], res => {
        try {
          const raw = res[STORAGE_KEY] ? JSON.parse(res[STORAGE_KEY]) : null;
          if (raw && typeof raw === 'object') {
            cfg.workMins  = clampInt(raw.workMins,  1, 120, 25);
            cfg.shortMins = clampInt(raw.shortMins, 1,  30,  5);
            cfg.longMins  = clampInt(raw.longMins,  1,  60, 15);
            cfg.longAfter = clampInt(raw.longAfter, 1,  10,  4);
          }
        } catch(e) {}
        cb();
      });
    }

    function saveCfg() {
      chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(cfg) });
    }

    function clampInt(val, min, max, def) {
      const n = parseInt(val);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }

    // ── Shell ──────────────────────────────────────────────────────────────
    container.innerHTML = shell`
      <div class="pomo-inner">
        <div class="pomo-phase-tabs" id="pomo-tabs-${instanceId}">
          <button class="pomo-tab active" data-phase="work">Focus</button>
          <button class="pomo-tab" data-phase="short">Short break</button>
          <button class="pomo-tab" data-phase="long">Long break</button>
        </div>

        <div class="pomo-face">
          <svg class="pomo-ring" viewBox="0 0 120 120">
            <circle class="pomo-ring-bg" cx="60" cy="60" r="52" />
            <circle class="pomo-ring-fill" id="pomo-arc-${instanceId}" cx="60" cy="60" r="52"
              stroke-dasharray="326.7" stroke-dashoffset="0"
              transform="rotate(-90 60 60)" />
          </svg>
          <div class="pomo-time" id="pomo-time-${instanceId}">25:00</div>
          <div class="pomo-label" id="pomo-label-${instanceId}">Focus time</div>
        </div>

        <div class="pomo-controls">
          <button class="pomo-btn pomo-start" id="pomo-start-${instanceId}">Start</button>
          <button class="pomo-btn pomo-reset" id="pomo-reset-${instanceId}">Reset</button>
          <button class="pomo-btn pomo-cfg-btn" id="pomo-cfg-${instanceId}" title="Settings">⚙</button>
        </div>

        <div class="pomo-sessions" id="pomo-sessions-${instanceId}"></div>

        <div class="pomo-settings hidden" id="pomo-settings-${instanceId}">
          <div class="pomo-setting-row">
            <label>Focus</label>
            <input type="number" id="pomo-work-${instanceId}" min="1" max="120" />
            <span>min</span>
          </div>
          <div class="pomo-setting-row">
            <label>Short break</label>
            <input type="number" id="pomo-short-${instanceId}" min="1" max="30" />
            <span>min</span>
          </div>
          <div class="pomo-setting-row">
            <label>Long break</label>
            <input type="number" id="pomo-long-${instanceId}" min="1" max="60" />
            <span>min</span>
          </div>
          <div class="pomo-setting-row">
            <label>Long break after</label>
            <input type="number" id="pomo-after-${instanceId}" min="1" max="10" />
            <span>sessions</span>
          </div>
          <button class="pomo-btn pomo-save-cfg" id="pomo-save-cfg-${instanceId}">Save</button>
        </div>
      </div>
    `;

    // ── Refs ───────────────────────────────────────────────────────────────
    const timeEl    = container.querySelector(`#pomo-time-${instanceId}`);
    const labelEl   = container.querySelector(`#pomo-label-${instanceId}`);
    const arcEl     = container.querySelector(`#pomo-arc-${instanceId}`);
    const startBtn  = container.querySelector(`#pomo-start-${instanceId}`);
    const resetBtn  = container.querySelector(`#pomo-reset-${instanceId}`);
    const cfgBtn    = container.querySelector(`#pomo-cfg-${instanceId}`);
    const sessEl    = container.querySelector(`#pomo-sessions-${instanceId}`);
    const settingsEl= container.querySelector(`#pomo-settings-${instanceId}`);
    const tabs      = container.querySelectorAll('.pomo-tab');

    // ── Phase switching ────────────────────────────────────────────────────
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        stop();
        phase = tab.dataset.phase;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        resetTimer();
      });
    });

    // ── Controls ───────────────────────────────────────────────────────────
    startBtn.addEventListener('click', () => {
      if (running) { stop(); } else { start(); }
    });

    resetBtn.addEventListener('click', () => { stop(); resetTimer(); });

    cfgBtn.addEventListener('click', () => {
      showCfg = !showCfg;
      settingsEl.classList.toggle('hidden', !showCfg);
      if (showCfg) populateCfgInputs();
    });

    container.querySelector(`#pomo-save-cfg-${instanceId}`).addEventListener('click', () => {
      cfg.workMins  = clampInt(container.querySelector(`#pomo-work-${instanceId}`).value,  1, 120, 25);
      cfg.shortMins = clampInt(container.querySelector(`#pomo-short-${instanceId}`).value, 1,  30,  5);
      cfg.longMins  = clampInt(container.querySelector(`#pomo-long-${instanceId}`).value,  1,  60, 15);
      cfg.longAfter = clampInt(container.querySelector(`#pomo-after-${instanceId}`).value, 1,  10,  4);
      saveCfg();
      stop(); resetTimer();
      showCfg = false;
      settingsEl.classList.add('hidden');
    });

    function populateCfgInputs() {
      container.querySelector(`#pomo-work-${instanceId}`).value  = cfg.workMins;
      container.querySelector(`#pomo-short-${instanceId}`).value = cfg.shortMins;
      container.querySelector(`#pomo-long-${instanceId}`).value  = cfg.longMins;
      container.querySelector(`#pomo-after-${instanceId}`).value = cfg.longAfter;
    }

    // ── Timer logic ────────────────────────────────────────────────────────
    function phaseDuration() {
      if (phase === 'work')  return cfg.workMins * 60;
      if (phase === 'short') return cfg.shortMins * 60;
      return cfg.longMins * 60;
    }

    function phaseLabel() {
      if (phase === 'work')  return 'Focus time';
      if (phase === 'short') return 'Short break';
      return 'Long break';
    }

    function resetTimer() {
      secsLeft = phaseDuration();
      render();
    }

    function start() {
      running = true;
      startBtn.textContent = 'Pause';
      ticker = setInterval(() => {
        if (secsLeft <= 0) { onComplete(); return; }
        secsLeft--;
        render();
      }, 1000);
    }

    function stop() {
      running = false;
      startBtn.textContent = 'Start';
      clearInterval(ticker);
    }

    function onComplete() {
      stop();
      if (phase === 'work') {
        sessions++;
        renderDots();
        // Auto-advance to break
        phase = (sessions % cfg.longAfter === 0) ? 'long' : 'short';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.phase === phase));
      } else {
        phase = 'work';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.phase === 'work'));
      }
      resetTimer();
      // Subtle title notification
      try { document.title = `✓ ${phaseLabel()} — Dashboard`; }
      catch(e) {}
      setTimeout(() => { try { document.title = 'Dashboard'; } catch(e) {} }, 4000);
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function render() {
      const total = phaseDuration();
      const mins  = Math.floor(secsLeft / 60);
      const secs  = secsLeft % 60;
      timeEl.textContent  = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
      labelEl.textContent = phaseLabel();

      // Arc — circumference 2π×52 ≈ 326.73
      const C = 326.73;
      const offset = C * (1 - secsLeft / total);
      arcEl.style.strokeDashoffset = C - offset;

      // Colour the arc by phase
      const color = phase === 'work' ? '#5b8cff' : phase === 'short' ? '#3ecf8e' : '#a78bfa';
      arcEl.style.stroke = color;

      renderDots();
    }

    function renderDots() {
      sessEl.innerHTML = '';
      const target = cfg.longAfter;
      for (let i = 0; i < target; i++) {
        const dot = el('div', 'pomo-dot' + (i < (sessions % target || (sessions > 0 && sessions % target === 0 ? target : 0)) ? ' filled' : ''));
        sessEl.appendChild(dot);
      }
    }

    // ── Boot ───────────────────────────────────────────────────────────────
    loadCfg(() => { resetTimer(); });
  }
};
