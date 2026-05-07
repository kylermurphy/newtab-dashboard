/* modules/kanban.js — hardened + synced via SyncStore */
'use strict';

window.KanbanModule = {
  title: 'Kanban',
  defaultSize: { w: 860, h: 520 },

  mount(container, instanceId) {
    const { el, attr, safeColor, safeLayout, shell } = window.sec;

    // Each kanban instance has its own namespace so boards stay independent
    const cardStore  = new window.SyncStore(`kanban_cards_${instanceId}`);
    const configStore= new window.SyncStore(`kanban_cfg_${instanceId}`);

    const COL_POOL = [
      { id: 'todo',      label: 'To Do',       color: '#7a7f8e' },
      { id: 'doing',     label: 'In Progress',  color: '#f5c542' },
      { id: 'done',      label: 'Done',         color: '#3ecf8e' },
      { id: 'blocked',   label: 'Blocked',      color: '#ff5f6d' },
      { id: 'review',    label: 'Review',       color: '#a78bfa' },
      { id: 'backlog',   label: 'Backlog',      color: '#5b8cff' },
      { id: 'testing',   label: 'Testing',      color: '#fb923c' },
      { id: 'cancelled', label: 'Cancelled',    color: '#454850' },
    ];

    const DEFAULT_TAGS = [
      { id: 'task',     label: 'Task',     color: '#3ecf8e' },
      { id: 'feature',  label: 'Feature',  color: '#5b8cff' },
      { id: 'bug',      label: 'Bug',      color: '#ff5f6d' },
      { id: 'idea',     label: 'Idea',     color: '#a78bfa' },
      { id: 'research', label: 'Research', color: '#f5c542' },
    ];

    let cards           = [];
    let columns         = [];
    let tags            = [];
    let layout          = 'row';
    let configured      = false;
    let activeTagFilter = 'all';
    let searchQuery     = '';
    let dragCardId      = null;
    let dragColId       = null;
    let targetColId     = null;
    let syncStatus      = 'idle';

    // ── Sanitizers ─────────────────────────────────────────────────────────
    function sanitizeCard(c) {
      if (!c || typeof c !== 'object') return null;
      const id = String(c.id || '').slice(0, 32);
      if (!id) return null;
      return {
        id,
        text:      String(c.text      || '').slice(0, 1800), // ~1.8KB leaves room for JSON overhead
        tag:       String(c.tag       || '').slice(0, 64),
        col:       String(c.col       || '').slice(0, 64),
        updatedAt: Number(c.updatedAt || 0),
      };
    }

    function sanitizeConfig(cfg) {
      if (!cfg || typeof cfg !== 'object') return null;
      const cols = Array.isArray(cfg.columns)
        ? cfg.columns.filter(id => COL_POOL.some(c => c.id === id))
        : [];
      const tgs  = Array.isArray(cfg.tags)
        ? cfg.tags.map(sanitizeTag).filter(Boolean)
        : JSON.parse(JSON.stringify(DEFAULT_TAGS));
      return {
        columns:   cols,
        layout:    safeLayout(cfg.layout),
        tags:      tgs,
        updatedAt: Number(cfg.updatedAt || 0),
      };
    }

    function sanitizeTag(t) {
      if (!t || typeof t !== 'object') return null;
      const label = String(t.label || '').trim().slice(0, 32);
      if (!label) return null;
      return {
        id:    String(t.id || kuid()).slice(0, 64),
        label,
        color: safeColor(t.color),
      };
    }

    // ── Persistence ────────────────────────────────────────────────────────
    async function loadAll() {
      // Load cards and config in parallel
      const [rawCards, cfg] = await Promise.all([
        cardStore.getItems(sanitizeCard),
        configStore.getConfig(sanitizeConfig),
      ]);

      cards = rawCards;

      if (cfg && cfg.columns.length > 0) {
        columns    = cfg.columns;
        layout     = cfg.layout;
        tags       = cfg.tags.length ? cfg.tags : JSON.parse(JSON.stringify(DEFAULT_TAGS));
        configured = true;
      } else {
        tags = JSON.parse(JSON.stringify(DEFAULT_TAGS));
      }
    }

    let cardSaveTimer = null;
    async function saveCards(immediate = false) {
      if (immediate) {
        clearTimeout(cardSaveTimer);
        return _doSaveCards();
      }
      clearTimeout(cardSaveTimer);
      cardSaveTimer = setTimeout(_doSaveCards, 600);
    }

    async function _doSaveCards() {
      setSyncStatus('saving');
      await cardStore.setItems(cards, c => c.id);
      setSyncStatus(cardStore.getSyncStatus());
    }

    async function saveConfig() {
      setSyncStatus('saving');
      await configStore.setConfig({ columns, layout, tags, updatedAt: Date.now() });
      setSyncStatus(configStore.getSyncStatus());
    }

    function setSyncStatus(status) {
      syncStatus = status;
      const dot = container.querySelector(`#kb-sync-${instanceId}`);
      if (!dot) return;
      dot.className = 'kb-sync-dot sync-' + (
        status === 'synced'  ? 'synced' :
        status === 'saving'  ? 'saving' : 'local-only'
      );
      const labels = {
        idle:            'Sync idle',
        saving:          'Saving…',
        synced:          'Synced across Chrome profile',
        'local-only':    'Not syncing — reason unknown',
        'no-account':    'Not syncing: sign into Chrome to enable sync',
        'sync-disabled': 'Not syncing: enable extension sync in Chrome settings (chrome://settings/syncSetup)',
        'quota':         'Not syncing: storage quota exceeded — data saved locally',
        'offline':       'Not syncing: network offline — will retry on next save',
        'unstable-id':   'Not syncing: extension ID is unstable (developer mode) — see README',
      };
      dot.title = labels[status] || status;
    }

    // ── Static shell ───────────────────────────────────────────────────────
    container.innerHTML = shell`
      <div class="kanban-inner">
        <div class="kanban-toolbar">
          <div class="kanban-toolbar-row">
            <input class="mod-search" id="kb-search-${instanceId}" type="text" placeholder="Search cards…" autocomplete="off" style="flex:1" />
            <div class="kb-sync-dot sync-idle" id="kb-sync-${instanceId}" title="Sync idle"></div>
            <button class="kanban-add-btn" id="kb-add-${instanceId}">+ Add Card</button>
            <button class="kanban-add-btn" id="kb-layout-${instanceId}" title="Cycle layout">⊞</button>
            <button class="kanban-add-btn" id="kb-cols-${instanceId}" title="Edit columns &amp; tags">⋮⋮</button>
          </div>
          <div class="filter-chips" id="kb-filters-${instanceId}">
            <button class="chip active" data-tag="all">All</button>
          </div>
        </div>
        <div class="kanban-board" id="kb-board-${instanceId}"></div>
      </div>

      <!-- Setup / edit modal -->
      <div class="task-modal-backdrop" id="kb-setup-${instanceId}" style="display:none;align-items:center;justify-content:center">
        <div class="task-modal" style="width:460px;max-height:90vh;overflow-y:auto">
          <h4 id="kb-setup-title-${instanceId}">Configure your board</h4>
          <p style="font-size:12px;color:var(--text-dim);margin:-4px 0 12px">Pick columns to include. Drag headers to reorder after.</p>
          <div id="kb-col-picker-${instanceId}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"></div>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">
            <label style="font-size:11px;color:var(--text-dim);letter-spacing:.05em;text-transform:uppercase;white-space:nowrap">Layout</label>
            <select id="kb-setup-layout-${instanceId}" style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text);outline:none;font-family:inherit">
              <option value="row">Single row (scroll)</option>
              <option value="2x2">2 × 2 grid</option>
              <option value="3x2">3 × 2 grid</option>
            </select>
          </div>
          <div class="tag-manager-section">
            <div class="tag-manager-header">Tags</div>
            <div class="tag-list" id="kb-tag-list-${instanceId}"></div>
            <div class="tag-add-row">
              <input class="tag-name-input" id="kb-tag-name-${instanceId}" type="text" placeholder="New tag label…" maxlength="32" />
              <input class="tag-color-input" id="kb-tag-color-${instanceId}" type="color" value="#5b8cff" title="Tag colour" />
              <button class="tag-add-confirm" id="kb-tag-add-${instanceId}">Add Tag</button>
            </div>
          </div>
          <div class="task-modal-actions" style="margin-top:16px">
            <button class="modal-btn modal-btn-cancel" id="kb-setup-cancel-${instanceId}">Use Defaults</button>
            <button class="modal-btn modal-btn-add"    id="kb-setup-save-${instanceId}">Create Board</button>
          </div>
        </div>
      </div>

      <!-- Add card modal -->
      <div class="task-modal-backdrop hidden" id="kb-modal-${instanceId}">
        <div class="task-modal">
          <h4>New Card</h4>
          <textarea placeholder="What needs to be done?" id="kb-text-${instanceId}" rows="3" maxlength="1800"></textarea>
          <select id="kb-col-sel-${instanceId}"></select>
          <select id="kb-tag-sel-${instanceId}"></select>
          <div class="task-modal-actions">
            <button class="modal-btn modal-btn-cancel" id="kb-cancel-${instanceId}">Cancel</button>
            <button class="modal-btn modal-btn-add"    id="kb-save-${instanceId}">Add Card</button>
          </div>
        </div>
      </div>
    `;

    const board     = container.querySelector(`#kb-board-${instanceId}`);
    const modal     = container.querySelector(`#kb-modal-${instanceId}`);
    const setup     = container.querySelector(`#kb-setup-${instanceId}`);
    const textEl    = container.querySelector(`#kb-text-${instanceId}`);
    const colSel    = container.querySelector(`#kb-col-sel-${instanceId}`);
    const tagSel    = container.querySelector(`#kb-tag-sel-${instanceId}`);
    const searchEl  = container.querySelector(`#kb-search-${instanceId}`);
    const filterBar = container.querySelector(`#kb-filters-${instanceId}`);

    // ── Search / filter ────────────────────────────────────────────────────
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value.trim().toLowerCase();
      renderBoard();
    });

    filterBar.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      filterBar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeTagFilter = chip.dataset.tag || 'all';
      renderBoard();
    });

    function rebuildFilterChips() {
      filterBar.innerHTML = '';
      const allBtn = el('button', 'chip' + (activeTagFilter === 'all' ? ' active' : ''), 'All');
      allBtn.dataset.tag = 'all';
      filterBar.appendChild(allBtn);
      tags.forEach(t => {
        const btn = el('button', 'chip' + (activeTagFilter === t.id ? ' active' : ''), t.label);
        btn.dataset.tag = t.id;
        filterBar.appendChild(btn);
      });
    }

    // ── Toolbar ────────────────────────────────────────────────────────────
    container.querySelector(`#kb-add-${instanceId}`).addEventListener('click', () => openCardModal());
    container.querySelector(`#kb-layout-${instanceId}`).addEventListener('click', () => {
      const opts = ['row', '2x2', '3x2'];
      layout = opts[(opts.indexOf(layout) + 1) % opts.length];
      saveConfig(); applyLayout();
    });
    container.querySelector(`#kb-cols-${instanceId}`).addEventListener('click', () => openSetupModal(true));

    // ── Setup modal ────────────────────────────────────────────────────────
    let setupSelected = [];

    function openSetupModal(editMode) {
      const picker    = container.querySelector(`#kb-col-picker-${instanceId}`);
      const layoutSel = container.querySelector(`#kb-setup-layout-${instanceId}`);
      const titleEl2  = container.querySelector(`#kb-setup-title-${instanceId}`);
      const cancelBtn = container.querySelector(`#kb-setup-cancel-${instanceId}`);
      const saveBtn   = container.querySelector(`#kb-setup-save-${instanceId}`);

      titleEl2.textContent  = editMode ? 'Edit columns & tags' : 'Configure your board';
      cancelBtn.textContent = editMode ? 'Cancel' : 'Use Defaults';
      saveBtn.textContent   = editMode ? 'Apply'  : 'Create Board';
      setupSelected = editMode ? [...columns] : ['todo', 'doing', 'done'];
      layoutSel.value = layout;

      picker.innerHTML = '';
      COL_POOL.forEach(col => {
        const btn = el('button', 'col-picker-btn' + (setupSelected.includes(col.id) ? ' selected' : ''));
        const dot = el('span', 'cpb-dot');
        dot.style.background = col.color;
        btn.appendChild(dot);
        btn.appendChild(document.createTextNode(col.label));
        btn.dataset.colId = col.id;
        btn.addEventListener('click', () => {
          if (setupSelected.includes(col.id)) {
            if (setupSelected.length <= 1) return;
            setupSelected = setupSelected.filter(c => c !== col.id);
            btn.classList.remove('selected');
          } else {
            setupSelected.push(col.id);
            btn.classList.add('selected');
          }
        });
        picker.appendChild(btn);
      });

      renderTagList();
      setup.style.display = 'flex';

      cancelBtn.onclick = () => {
        if (!editMode && !configured) {
          columns = ['todo', 'doing', 'done', 'blocked'];
          layout  = 'row';
          tags    = JSON.parse(JSON.stringify(DEFAULT_TAGS));
          configured = true;
          saveConfig(); seedDefaultCards(); applyLayout();
        }
        setup.style.display = 'none';
      };

      saveBtn.onclick = () => {
        if (!setupSelected.length) return;
        if (editMode) {
          const kept  = columns.filter(c => setupSelected.includes(c));
          const added = setupSelected.filter(c => !columns.includes(c));
          columns = [...kept, ...added];
        } else {
          columns = [...setupSelected];
        }
        layout = safeLayout(layoutSel.value);
        configured = true;
        saveConfig();
        if (!editMode) seedDefaultCards();
        setup.style.display = 'none';
        rebuildFilterChips();
        applyLayout();
      };
    }

    function renderTagList() {
      const listEl = container.querySelector(`#kb-tag-list-${instanceId}`);
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!tags.length) {
        const empty = el('div', null, 'No tags yet');
        empty.style.cssText = 'font-size:11px;color:var(--text-xdim);padding:4px 0';
        listEl.appendChild(empty);
        return;
      }
      tags.forEach(tag => {
        const row    = el('div', 'tag-list-row');
        const swatch = el('div', 'tag-color-swatch');
        swatch.style.background = safeColor(tag.color);
        const label  = el('span', 'tag-list-label', tag.label);
        const delBtn = el('button', 'tag-delete-btn', '✕');
        attr(delBtn, 'title', 'Delete tag');
        delBtn.addEventListener('click', () => {
          tags = tags.filter(t => t.id !== tag.id);
          if (activeTagFilter === tag.id) activeTagFilter = 'all';
          saveConfig(); renderTagList(); rebuildFilterChips(); renderBoard();
        });
        row.appendChild(swatch); row.appendChild(label); row.appendChild(delBtn);
        listEl.appendChild(row);
      });
    }

    container.querySelector(`#kb-tag-add-${instanceId}`).addEventListener('click', () => {
      const nameEl  = container.querySelector(`#kb-tag-name-${instanceId}`);
      const colorEl = container.querySelector(`#kb-tag-color-${instanceId}`);
      const label   = nameEl.value.trim().slice(0, 32);
      if (!label) return;
      tags.push({ id: 'tag_' + kuid(), label, color: safeColor(colorEl.value) });
      nameEl.value = '';
      saveConfig(); renderTagList(); rebuildFilterChips();
    });

    container.querySelector(`#kb-tag-name-${instanceId}`)
      .addEventListener('keydown', e => {
        if (e.key === 'Enter') container.querySelector(`#kb-tag-add-${instanceId}`).click();
      });

    // ── Seed ───────────────────────────────────────────────────────────────
    function seedDefaultCards() {
      if (cards.length > 0) return;
      const c0 = columns[0], c1 = columns[1] || c0, cL = columns[columns.length - 1];
      const now = Date.now();
      cards = [
        { id: kuid(), text: 'Welcome to your Kanban board!',  tag: tags[0]?.id || '', col: c0, updatedAt: now },
        { id: kuid(), text: 'Drag cards between columns',     tag: tags[1]?.id || '', col: c0, updatedAt: now },
        { id: kuid(), text: 'Drag column headers to reorder', tag: tags[3]?.id || '', col: c1, updatedAt: now },
        { id: kuid(), text: 'Resize this window freely',      tag: tags[0]?.id || '', col: cL, updatedAt: now },
      ];
      saveCards(true);
    }

    // ── Card modal ─────────────────────────────────────────────────────────
    function openCardModal(colId = null) {
      colSel.innerHTML = '';
      columns.forEach(id => {
        const def = COL_POOL.find(c => c.id === id) || { id, label: id };
        const opt = el('option', null, def.label);
        opt.value = def.id;
        colSel.appendChild(opt);
      });
      if (colId) colSel.value = colId;

      tagSel.innerHTML = '';
      (tags.length ? tags : []).forEach(t => {
        const opt = el('option', null, t.label);
        opt.value = t.id;
        tagSel.appendChild(opt);
      });
      if (!tags.length) {
        const opt = el('option', null, 'No tags'); opt.value = '';
        tagSel.appendChild(opt);
      }

      textEl.value = '';
      modal.classList.remove('hidden');
      setTimeout(() => textEl.focus(), 50);
    }
    function closeCardModal() { modal.classList.add('hidden'); }

    container.querySelector(`#kb-cancel-${instanceId}`).addEventListener('click', closeCardModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeCardModal(); });
    container.querySelector(`#kb-save-${instanceId}`).addEventListener('click', () => {
      const text = textEl.value.trim().slice(0, 1800);
      if (!text) return;
      cards.push({ id: kuid(), text, tag: tagSel.value, col: colSel.value, updatedAt: Date.now() });
      saveCards(); renderBoard(); closeCardModal();
    });

    // ── Layout ─────────────────────────────────────────────────────────────
    function applyLayout() {
      board.className = 'kanban-board';
      if (layout === '2x2') board.classList.add('kb-grid-2x2');
      else if (layout === '3x2') board.classList.add('kb-grid-3x2');
      renderBoard();
    }

    // ── Board render ───────────────────────────────────────────────────────
    function filteredCards() {
      return cards.filter(c => {
        if (activeTagFilter !== 'all' && c.tag !== activeTagFilter) return false;
        if (searchQuery && !c.text.toLowerCase().includes(searchQuery)) return false;
        return true;
      });
    }

    function renderBoard() {
      const visible = filteredCards();
      board.innerHTML = '';

      columns.forEach(colId => {
        const colDef      = COL_POOL.find(c => c.id === colId) || { id: colId, label: colId, color: '#7a7f8e' };
        const colCards    = visible.filter(c => c.col === colId);
        const allColCards = cards.filter(c => c.col === colId);

        const colEl = el('div', 'kanban-col');
        colEl.dataset.col = colId;

        const header = el('div', 'kanban-col-header kb-col-drag-handle');
        attr(header, 'draggable', 'true');
        const dot = el('div', 'col-dot');
        dot.style.background = safeColor(colDef.color);
        const nameSpan  = el('span', 'col-name', colDef.label);
        const countText = colCards.length !== allColCards.length
          ? `${colCards.length}/${allColCards.length}` : `${colCards.length}`;
        const countSpan = el('span', 'col-count', countText);
        const grip      = el('span', 'col-drag-grip', '⠿');
        attr(grip, 'title', 'Drag to reorder');
        header.appendChild(dot); header.appendChild(nameSpan);
        header.appendChild(countSpan); header.appendChild(grip);
        colEl.appendChild(header);

        const cardsEl = el('div', 'kanban-col-cards');
        attr(cardsEl, 'data-col', colId);
        colEl.appendChild(cardsEl);

        const addBtn = el('button', 'kanban-add-card-btn', '+ Add card');
        attr(addBtn, 'data-col', colId);
        addBtn.addEventListener('click', () => openCardModal(colId));
        colEl.appendChild(addBtn);

        colCards.forEach(card => cardsEl.appendChild(buildCard(card)));

        // Drop zones & drag
        colEl.addEventListener('dragover', e => {
          if (dragColId) {
            if (dragColId === colId) return;
            e.preventDefault();
            board.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('col-drag-over'));
            colEl.classList.add('col-drag-over');
            return;
          }
          e.preventDefault();
          targetColId = colId;
          board.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
          colEl.classList.add('drag-over');
        });

        colEl.addEventListener('dragleave', e => {
          if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over', 'col-drag-over');
        });

        colEl.addEventListener('drop', e => {
          e.preventDefault();
          colEl.classList.remove('drag-over', 'col-drag-over');
          if (dragColId && dragColId !== colId) {
            const from = columns.indexOf(dragColId), to = columns.indexOf(colId);
            if (from !== -1 && to !== -1) { columns.splice(from, 1); columns.splice(to, 0, dragColId); }
            saveConfig(); renderBoard(); dragColId = null; return;
          }
          if (dragCardId && targetColId) {
            const card = cards.find(c => c.id === dragCardId);
            if (card) { card.col = targetColId; card.updatedAt = Date.now(); saveCards(); renderBoard(); }
          }
          dragCardId = null; targetColId = null;
        });

        header.addEventListener('dragstart', e => {
          dragColId = colId; colEl.classList.add('col-dragging');
          e.dataTransfer.effectAllowed = 'move'; e.stopPropagation();
        });
        header.addEventListener('dragend', () => {
          dragColId = null;
          board.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('col-dragging', 'col-drag-over'));
        });

        board.appendChild(colEl);
      });
    }

    function buildCard(card) {
      const cardEl = el('div', 'kanban-card');
      attr(cardEl, 'draggable', 'true');
      cardEl.dataset.cardId = card.id;

      const actions = el('div', 'card-actions');
      const delBtn  = el('button', 'card-action-btn', '✕');
      attr(delBtn, 'title', 'Delete');
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const removedId = card.id;
        cards = cards.filter(c => c.id !== removedId);
        await cardStore.removeItems([removedId]);
        saveCards(true);
        renderBoard();
      });
      actions.appendChild(delBtn);
      cardEl.appendChild(actions);

      cardEl.appendChild(el('div', 'card-text', card.text));

      const tagDef = tags.find(t => t.id === card.tag);
      if (tagDef) {
        const pill = el('span', null, tagDef.label);
        const c = safeColor(tagDef.color);
        // Set each style property individually — never assign cssText with variable data
        pill.style.background   = c + '22';
        pill.style.color        = c;
        pill.style.borderRadius = '10px';
        pill.style.padding      = '2px 7px';
        pill.style.fontSize     = '10px';
        pill.style.fontWeight   = '500';
        pill.style.display      = 'inline-block';
        pill.style.marginTop    = '6px';
        cardEl.appendChild(pill);
      }

      cardEl.addEventListener('dragstart', e => {
        if (dragColId) { e.preventDefault(); return; }
        dragCardId = card.id; cardEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
        board.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      });

      return cardEl;
    }

    // ── Live sync from other devices ───────────────────────────────────────
    cardStore.onChange(async () => {
      const incoming = await cardStore.getItems(sanitizeCard);
      // Merge: newer updatedAt wins
      const map = new Map(cards.map(c => [c.id, c]));
      incoming.forEach(c => {
        const existing = map.get(c.id);
        if (!existing || c.updatedAt > existing.updatedAt) map.set(c.id, c);
      });
      cards = [...map.values()];
      renderBoard();
      setSyncStatus('synced');
    });

    configStore.onChange(async () => {
      const cfg = await configStore.getConfig(sanitizeConfig);
      if (!cfg) return;
      if (cfg.updatedAt > 0) {
        columns = cfg.columns;
        layout  = cfg.layout;
        tags    = cfg.tags;
        rebuildFilterChips();
        applyLayout();
        setSyncStatus('synced');
      }
    });

    // ── Boot ───────────────────────────────────────────────────────────────
    loadAll().then(() => {
      rebuildFilterChips();
      if (!configured) openSetupModal(false);
      else applyLayout();
      setSyncStatus(cardStore.getSyncStatus());
    });
  }
};

function kuid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
