/* modules/notes.js — synced across Chrome profile via SyncStore */
'use strict';

window.NotesModule = {
  title: 'Notes',
  defaultSize: { w: 340, h: 420 },

  mount(container, instanceId) {
    const { el, attr, shell } = window.sec;
    // One shared notes store across all note module instances
    // (notes belong to the user, not a specific window placement)
    const store = new window.SyncStore('notes_v1');

    let notes        = [];
    let activeNoteId = null;
    let saveTimer    = null;
    let syncStatus   = 'idle';   // 'idle' | 'saving' | 'synced' | 'local-only'

    // ── Sanitize ───────────────────────────────────────────────────────────
    function sanitizeNote(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const id = String(raw.id || '').slice(0, 32);
      if (!id) return null;
      return {
        id,
        title:     String(raw.title     || '').slice(0, 120),
        body:      String(raw.body      || '').slice(0, 6500), // ~6.5KB keeps well under 7KB chunk limit
        updatedAt: Number(raw.updatedAt || 0),
      };
    }

    // ── Persistence ────────────────────────────────────────────────────────
    async function load() {
      notes = await store.getItems(sanitizeNote);
      if (notes.length === 0) {
        notes = [{ id: nuid(), title: 'Scratch pad', body: '', updatedAt: Date.now() }];
        await persist(false);
      }
      // Sort newest first
      notes.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async function persist(debounce = true) {
      if (debounce) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => _doPersist(), 800);
      } else {
        await _doPersist();
      }
    }

    async function _doPersist() {
      setSyncStatus('saving');
      await store.setItems(notes, n => n.id);
      setSyncStatus(store.getSyncStatus());
    }

    function setSyncStatus(status) {
      syncStatus = status;
      const indicator = container.querySelector(`#notes-sync-${instanceId}`);
      if (!indicator) return;
      indicator.className = 'notes-sync-dot sync-' + (
        status === 'synced' ? 'synced' :
        status === 'saving' ? 'saving' : 'local-only'
      );
      const labels = {
        idle:            'Sync idle',
        saving:          'Saving…',
        synced:          'Synced to Chrome profile',
        'local-only':    'Not syncing — reason unknown',
        'no-account':    'Not syncing: sign into Chrome to enable sync',
        'sync-disabled': 'Not syncing: enable extension sync in Chrome settings (chrome://settings/syncSetup)',
        'quota':         'Not syncing: storage quota exceeded — data saved locally',
        'offline':       'Not syncing: network offline — will retry on next save',
        'unstable-id':   'Not syncing: extension ID is unstable (developer mode) — see README',
      };
      indicator.title = labels[status] || status;
    }

    // ── Shell ──────────────────────────────────────────────────────────────
    container.innerHTML = shell`
      <div class="notes-inner">
        <div class="notes-sidebar" id="notes-sidebar-${instanceId}"></div>
        <div class="notes-main">
          <div class="notes-topbar">
            <input class="notes-title-input" id="notes-title-${instanceId}" type="text" placeholder="Note title…" maxlength="120" />
            <div class="notes-sync-dot sync-idle" id="notes-sync-${instanceId}" title="Sync idle"></div>
            <button class="notes-action-btn" id="notes-new-${instanceId}" title="New note">+</button>
            <button class="notes-action-btn notes-delete-btn" id="notes-del-${instanceId}" title="Delete note">✕</button>
          </div>
          <textarea class="notes-body" id="notes-body-${instanceId}" placeholder="Start typing…" spellcheck="true"></textarea>
          <div class="notes-footer" id="notes-footer-${instanceId}"></div>
        </div>
      </div>
    `;

    const sidebar  = container.querySelector(`#notes-sidebar-${instanceId}`);
    const titleEl  = container.querySelector(`#notes-title-${instanceId}`);
    const bodyEl   = container.querySelector(`#notes-body-${instanceId}`);
    const footerEl = container.querySelector(`#notes-footer-${instanceId}`);

    // ── New / delete ───────────────────────────────────────────────────────
    container.querySelector(`#notes-new-${instanceId}`).addEventListener('click', () => {
      const n = { id: nuid(), title: 'New note', body: '', updatedAt: Date.now() };
      notes.unshift(n);
      persist(false);
      renderSidebar();
      selectNote(n.id);
      setTimeout(() => { titleEl.focus(); titleEl.select(); }, 30);
    });

    container.querySelector(`#notes-del-${instanceId}`).addEventListener('click', async () => {
      if (!activeNoteId || notes.length <= 1) return;
      const removedId = activeNoteId;
      notes = notes.filter(n => n.id !== removedId);
      await store.removeItems([removedId]);
      await persist(false);
      selectNote(notes[0].id);
      renderSidebar();
    });

    // ── Edits ──────────────────────────────────────────────────────────────
    titleEl.addEventListener('input', () => {
      const n = notes.find(n => n.id === activeNoteId);
      if (!n) return;
      n.title = titleEl.value.slice(0, 120);
      n.updatedAt = Date.now();
      persist(true);
      renderSidebar();
    });

    bodyEl.addEventListener('input', () => {
      const n = notes.find(n => n.id === activeNoteId);
      if (!n) return;
      // Enforce the per-note body limit that keeps chunks under 7KB
      if (bodyEl.value.length > 6500) {
        bodyEl.value = bodyEl.value.slice(0, 6500);
      }
      n.body = bodyEl.value;
      n.updatedAt = Date.now();
      persist(true);
      updateFooter(n);
    });

    // ── Select ─────────────────────────────────────────────────────────────
    function selectNote(id) {
      activeNoteId = id;
      const n = notes.find(n => n.id === id);
      if (!n) return;
      titleEl.value = n.title;
      bodyEl.value  = n.body;
      updateFooter(n);
      sidebar.querySelectorAll('.note-item').forEach(item =>
        item.classList.toggle('active', item.dataset.noteId === id)
      );
    }

    function updateFooter(n) {
      const words = n.body.trim() ? n.body.trim().split(/\s+/).length : 0;
      const chars = n.body.length;
      footerEl.textContent = `${words} word${words !== 1 ? 's' : ''} · ${chars}/6500 chars`;
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function renderSidebar() {
      sidebar.innerHTML = '';
      const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
      sorted.forEach(n => {
        const item    = el('div', 'note-item' + (n.id === activeNoteId ? ' active' : ''));
        item.dataset.noteId = n.id;
        const titleLn = el('div', 'note-item-title', n.title || 'Untitled');
        const preview = el('div', 'note-item-preview',
          n.body.trim().slice(0, 60).replace(/\s+/g, ' ') || '—');
        item.appendChild(titleLn);
        item.appendChild(preview);
        item.addEventListener('click', () => selectNote(n.id));
        sidebar.appendChild(item);
      });
    }

    // ── Live sync from other devices ───────────────────────────────────────
    store.onChange(async () => {
      const incoming = await store.getItems(sanitizeNote);
      if (!incoming.length) return;
      const map = new Map(notes.map(n => [n.id, n]));
      incoming.forEach(n => {
        const existing = map.get(n.id);
        if (!existing || n.updatedAt > existing.updatedAt) map.set(n.id, n);
      });
      notes = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      renderSidebar();

      const active = notes.find(n => n.id === activeNoteId);
      if (active) {
        // Only update the editor if the user is NOT actively focused on it,
        // to avoid overwriting in-progress typing with a remote version.
        const userIsTyping = document.activeElement === bodyEl || document.activeElement === titleEl;
        if (!userIsTyping) {
          titleEl.value = active.title;
          bodyEl.value  = active.body;
          updateFooter(active);
        }
      } else if (notes.length) {
        selectNote(notes[0].id);
      }
      setSyncStatus('synced');
    });

    // ── Boot ───────────────────────────────────────────────────────────────
    load().then(() => {
      renderSidebar();
      selectNote(notes[0].id);
      setSyncStatus(store.getSyncStatus());
    });
  }
};

function nuid() { return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
