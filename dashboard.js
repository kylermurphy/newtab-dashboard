/* dashboard.js — hardened orchestration */
'use strict';

// ── Clock ──────────────────────────────────────────────────────────────────
(function clock() {
  const clockEl = document.getElementById('clock');
  const dateEl  = document.getElementById('date-str');
  function tick() {
    const now = new Date();
    clockEl.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    dateEl.textContent  = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }).toUpperCase();
  }
  tick();
  setInterval(tick, 10000);
})();

// ── State ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'dashboard_layout_v3';
let modules = [];

function saveLayout() {
  chrome.storage.local.set({
    [STORAGE_KEY]: JSON.stringify(modules.map(m => ({
      id: m.id, type: m.type,
      x: m.x, y: m.y, w: m.w, h: m.h,
      name: m.name, minimised: m.minimised || false
    })))
  });
}

function loadLayout(cb) {
  chrome.storage.local.get([STORAGE_KEY], result => {
    try {
      const data = result[STORAGE_KEY] ? JSON.parse(result[STORAGE_KEY]) : null;
      // Sanitize layout data from storage
      if (Array.isArray(data)) {
        const sanitized = data.map(m => ({
          id:        String(m.id        || '').slice(0, 64),
          type:      String(m.type      || '').slice(0, 32),
          name:      String(m.name      || '').slice(0, 80),
          x:         Math.max(0, parseInt(m.x) || 0),
          y:         Math.max(0, parseInt(m.y) || 0),
          w:         Math.max(200, Math.min(parseInt(m.w) || 420, 3000)),
          h:         Math.max(100, Math.min(parseInt(m.h) || 520, 3000)),
          minimised: Boolean(m.minimised),
        })).filter(m => m.id && MODULE_REGISTRY[m.type]);
        cb(sanitized);
      } else {
        cb(null);
      }
    } catch(e) { cb(null); }
  });
}

// ── Module registry ────────────────────────────────────────────────────────
const MODULE_REGISTRY = {
  tabs:   window.TabManagerModule,
  kanban: window.KanbanModule,
  notes:  window.NotesModule,
  pomodoro: window.PomodoroModule,
};

// ── Window management ──────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');

function createModuleWindow({ id, type, x, y, w, h, minimised, name }) {
  const def = MODULE_REGISTRY[type];
  if (!def) return;

  // Build title bar entirely with DOM API — name comes from storage
  const win = document.createElement('div');
  win.className = 'module-window' + (minimised ? ' minimised' : '');
  win.dataset.id   = id;
  win.style.left   = `${x}px`;
  win.style.top    = `${y}px`;
  win.style.width  = `${w}px`;
  win.style.height = minimised ? '42px' : `${h}px`;

  // Titlebar
  const titlebar = document.createElement('div');
  titlebar.className = 'module-titlebar';

  const dots = document.createElement('div');
  dots.className = 'titlebar-dots';
  ['dot-close','dot-min','dot-expand'].forEach(cls => {
    const d = document.createElement('div');
    d.className = 'titlebar-dot ' + cls;
    dots.appendChild(d);
  });
  dots.querySelector('.dot-close').title  = 'Close';
  dots.querySelector('.dot-min').title    = 'Minimise';
  dots.querySelector('.dot-expand').title = 'Restore';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'module-title';
  titleSpan.textContent = (name || def.title).slice(0, 80); // textContent — safe

  titlebar.appendChild(dots);
  titlebar.appendChild(titleSpan);

  const body = document.createElement('div');
  body.className = 'module-body';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';

  win.appendChild(titlebar);
  win.appendChild(body);
  win.appendChild(resizeHandle);

  def.mount(body, id);

  // Dot actions
  dots.querySelector('.dot-close').addEventListener('click', e => {
    e.stopPropagation(); removeModule(id);
  });
  dots.querySelector('.dot-min').addEventListener('click', e => {
    e.stopPropagation();
    const m = modules.find(m => m.id === id);
    if (!m || win.classList.contains('minimised')) return;
    m.minimised = true;
    win.classList.add('minimised');
    win.style.height = '42px';
    saveLayout();
  });
  dots.querySelector('.dot-expand').addEventListener('click', e => {
    e.stopPropagation();
    const m = modules.find(m => m.id === id);
    if (!m || !win.classList.contains('minimised')) return;
    m.minimised = false;
    win.classList.remove('minimised');
    win.style.height = `${m.h}px`;
    saveLayout();
  });

  makeDraggable(win);
  makeResizable(win, w, h);
  canvas.appendChild(win);
  bringToFront(win);
  return win;
}

function addModule(type, name) {
  const id  = `${type}_${Date.now()}`;
  const def = MODULE_REGISTRY[type];
  if (!def) return;
  const defaults = def.defaultSize || { w: 420, h: 520 };
  const count = modules.filter(m => m.type === type).length;
  const m = {
    id, type,
    x: 40 + count * 30,
    y: 40 + count * 30,
    ...defaults,
    name: (name || def.title).slice(0, 80),
    minimised: false
  };
  modules.push(m);
  createModuleWindow(m);
  saveLayout();
}

function removeModule(id) {
  // Find by iterating rather than interpolating id into a CSS selector string
  const wins = canvas.querySelectorAll('.module-window');
  wins.forEach(w => { if (w.dataset.id === id) w.remove(); });
  modules = modules.filter(m => m.id !== id);
  saveLayout();
}

function bringToFront(win) {
  let max = 0;
  canvas.querySelectorAll('.module-window').forEach(w => {
    max = Math.max(max, parseInt(w.style.zIndex) || 1);
  });
  win.style.zIndex = max + 1;
}

// ── Drag ───────────────────────────────────────────────────────────────────
function makeDraggable(win) {
  const titlebar = win.querySelector('.module-titlebar');
  let startX, startY, startLeft, startTop, dragging = false;

  titlebar.addEventListener('mousedown', e => {
    if (e.target.classList.contains('titlebar-dot')) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startLeft = parseInt(win.style.left) || 0;
    startTop  = parseInt(win.style.top)  || 0;
    win.classList.add('dragging');
    bringToFront(win);
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    win.style.left = `${Math.max(0, startLeft + e.clientX - startX)}px`;
    win.style.top  = `${Math.max(0, startTop  + e.clientY - startY)}px`;
    const m = modules.find(m => m.id === win.dataset.id);
    if (m) { m.x = parseInt(win.style.left); m.y = parseInt(win.style.top); }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    win.classList.remove('dragging');
    saveLayout();
  });

  win.addEventListener('mousedown', () => bringToFront(win));
}

// ── Resize ─────────────────────────────────────────────────────────────────
function makeResizable(win, initW, initH) {
  const handle = win.querySelector('.resize-handle');
  let startX, startY, startW, startH, resizing = false;

  handle.addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = win.offsetWidth; startH = win.offsetHeight;
    win.classList.add('resizing');
    e.stopPropagation(); e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const newW = Math.max(320, startW + e.clientX - startX);
    const newH = Math.max(200, startH + e.clientY - startY);
    win.style.width  = `${newW}px`;
    win.style.height = `${newH}px`;
    const m = modules.find(m => m.id === win.dataset.id);
    if (m) { m.w = newW; m.h = newH; }
    win.dispatchEvent(new CustomEvent('module-resize'));
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    win.classList.remove('resizing');
    saveLayout();
  });
}

// ── Module picker ──────────────────────────────────────────────────────────
const picker = document.getElementById('module-picker');

document.getElementById('add-module-btn').addEventListener('click', () => {
  picker.classList.remove('hidden');
});
document.getElementById('picker-cancel').addEventListener('click', () => {
  picker.classList.add('hidden');
});
picker.addEventListener('click', e => {
  if (e.target === picker) picker.classList.add('hidden');
});
document.querySelectorAll('.picker-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    picker.classList.add('hidden');
    const type = btn.dataset.module;
    if (type === 'kanban') {
      showNamePrompt('New Kanban Board', name => addModule(type, name));
    } else {
      addModule(type);
    }
  });
});

// ── Name prompt (DOM API only — no innerHTML with user data) ───────────────
function showNamePrompt(defaultName, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'name-prompt-overlay';

  const box = document.createElement('div');
  box.className = 'name-prompt-box';

  const heading = document.createElement('h3');
  heading.className = 'name-prompt-title';
  heading.textContent = 'Name this board';

  const input = document.createElement('input');
  input.className   = 'name-prompt-input';
  input.type        = 'text';
  input.maxLength   = 80;
  input.placeholder = 'Board name…';
  input.value       = defaultName; // safe: .value is not HTML

  const actions = document.createElement('div');
  actions.className = 'name-prompt-actions';

  const cancelBtn  = document.createElement('button');
  cancelBtn.className   = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.className   = 'modal-btn modal-btn-add';
  confirmBtn.textContent = 'Create';

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(heading);
  box.appendChild(input);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  setTimeout(() => { input.focus(); input.select(); }, 30);

  function close() { overlay.remove(); }

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  confirmBtn.addEventListener('click', () => {
    const name = input.value.trim() || defaultName;
    close();
    onConfirm(name);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirmBtn.click();
    if (e.key === 'Escape') close();
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
loadLayout(data => {
  if (data && data.length > 0) {
    modules = data;
    data.forEach(m => createModuleWindow(m));
  } else {
    addModule('tabs');
    showNamePrompt('My Kanban', name => addModule('kanban', name));
  }
});
