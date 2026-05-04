/* modules/tabs.js — hardened: tab data rendered via DOM API only */
'use strict';

window.TabManagerModule = {
  title: 'Tab Manager',
  defaultSize: { w: 400, h: 520 },

  mount(container, instanceId) {
    const { el, attr, shell } = window.sec;

    let allTabs      = [];
    let activeFilter = 'all';
    let query        = '';
    let lastFiltered = [];

    // Static shell — only safe instance IDs interpolated
    container.innerHTML = shell`
      <div class="tab-manager-inner">
        <div class="tab-toolbar">
          <input class="mod-search" id="tm-search-${instanceId}" type="text" placeholder="Search tabs…" autocomplete="off" />
          <div class="filter-chips">
            <button class="chip active" data-filter="all">All</button>
            <button class="chip" data-filter="audio">🔊 Audio</button>
            <button class="chip" data-filter="pinned">📌 Pinned</button>
            <button class="chip" data-filter="active">● Active</button>
          </div>
        </div>
        <div class="tab-count-row">
          <span class="tab-count-label" id="tm-count-${instanceId}">— tabs</span>
          <div class="tab-export-wrap">
            <button class="tab-export-btn" id="tm-export-${instanceId}" title="Export current view">↓ Export</button>
            <div class="export-dropdown hidden" id="tm-export-menu-${instanceId}">
              <button class="export-opt" data-fmt="clipboard-md">Copy as Markdown</button>
              <button class="export-opt" data-fmt="clipboard-txt">Copy as Text</button>
              <div style="height:1px;background:var(--border);margin:2px 0"></div>
              <button class="export-opt" data-fmt="csv">Download CSV</button>
              <button class="export-opt" data-fmt="md">Download Markdown</button>
              <button class="export-opt" data-fmt="txt">Download plain text</button>
            </div>
          </div>
        </div>
        <div class="mod-scroll" id="tm-list-${instanceId}"></div>
      </div>
    `;

    const searchEl   = container.querySelector(`#tm-search-${instanceId}`);
    const listEl     = container.querySelector(`#tm-list-${instanceId}`);
    const countEl    = container.querySelector(`#tm-count-${instanceId}`);
    const exportBtn  = container.querySelector(`#tm-export-${instanceId}`);
    const exportMenu = container.querySelector(`#tm-export-menu-${instanceId}`);
    const chipEls    = container.querySelectorAll('.chip');

    // ── Filter chips ───────────────────────────────────────────────────────
    chipEls.forEach(chip => {
      chip.addEventListener('click', () => {
        chipEls.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.filter || 'all';
        render();
      });
    });

    searchEl.addEventListener('input', () => {
      query = searchEl.value.trim().toLowerCase();
      render();
    });

    // ── Export ─────────────────────────────────────────────────────────────
    exportBtn.addEventListener('click', e => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));
    exportMenu.addEventListener('click', e => {
      const btn = e.target.closest('.export-opt');
      if (!btn) return;
      exportMenu.classList.add('hidden');
      exportTabs(btn.dataset.fmt);
    });

    function exportTabs(fmt) {
      const tabs = lastFiltered;
      if (!tabs.length) return;

      const filterLabel = activeFilter !== 'all' ? activeFilter : '';
      const queryLabel  = query ? `"${query}"` : '';
      const label       = [filterLabel, queryLabel].filter(Boolean).join(' + ') || 'all tabs';
      const timestamp   = new Date().toISOString().slice(0, 16).replace('T', ' ');

      if (fmt === 'clipboard-md') {
        const rows = tabs.map(t => `| ${mdCell(t.title)} | ${mdCell(t.url)} |`);
        copyToClipboard(`| Title | URL |\n|---|---|\n${rows.join('\n')}`, exportBtn);
        return;
      }
      if (fmt === 'clipboard-txt') {
        const lines = tabs.map((t, i) => `${i + 1}. ${t.title || 'Untitled'}\n   ${t.url}`);
        copyToClipboard(lines.join('\n\n'), exportBtn);
        return;
      }

      let content = '', filename = '', mime = '';
      if (fmt === 'csv') {
        const rows = tabs.map(t => [csvCell(t.title), csvCell(t.url),
          t.pinned ? 'true' : 'false', t.audible ? 'true' : 'false', t.active ? 'true' : 'false'].join(','));
        content  = ['Title,URL,Pinned,Audible,Active', ...rows].join('\r\n');
        filename = `tabs-${timestamp}.csv`; mime = 'text/csv';
      } else if (fmt === 'md') {
        const rows = tabs.map(t =>
          `| ${mdCell(t.title)} | ${mdCell(t.url)} | ${t.pinned?'✓':''} | ${t.audible?'🔊':''} |`);
        content  = `# Tab Export — ${label}\n_${timestamp} · ${tabs.length} tab(s)_\n\n| Title | URL | Pinned | Audio |\n|---|---|---|---|\n${rows.join('\n')}`;
        filename = `tabs-${timestamp}.md`; mime = 'text/markdown';
      } else {
        const lines = tabs.map((t, i) => `${String(i+1).padStart(3,' ')}. ${t.title || 'Untitled'}\n     ${t.url}`);
        content  = `Tab Export — ${label}\n${timestamp} · ${tabs.length} tab(s)\n\n${lines.join('\n\n')}`;
        filename = `tabs-${timestamp}.txt`; mime = 'text/plain';
      }

      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      // Safe: object URLs are browser-generated, not user input
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = 'var(--green)';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
      }).catch(() => {
        // Graceful fallback — execCommand is deprecated but harmless here
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
      });
    }

    function csvCell(val) {
      const s = String(val || '').replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    }
    function mdCell(val) {
      return String(val || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    }

    // ── Render (DOM API only) ──────────────────────────────────────────────
    function filterTabs(tabs) {
      return tabs.filter(tab => {
        if (query && !`${tab.title} ${tab.url}`.toLowerCase().includes(query)) return false;
        if (activeFilter === 'audio')  return tab.audible;
        if (activeFilter === 'pinned') return tab.pinned;
        if (activeFilter === 'active') return tab.active;
        return true;
      });
    }

    function render() {
      const filtered = filterTabs(allTabs);
      lastFiltered = filtered;
      countEl.textContent = `${filtered.length} of ${allTabs.length} tab${allTabs.length !== 1 ? 's' : ''}`;
      exportBtn.style.opacity = filtered.length > 0 ? '1' : '0.4';

      listEl.innerHTML = '';

      if (filtered.length === 0) {
        const empty = el('div', 'empty-state');
        const icon  = el('span', 'empty-icon', '🔍');
        const msg   = el('span', null, 'No tabs match');
        empty.appendChild(icon); empty.appendChild(msg);
        listEl.appendChild(empty);
        return;
      }

      filtered.forEach(tab => {
        const row = el('div', 'tab-row');
        // Safe: tab.url is set as title attribute via textContent-equivalent
        row.title = tab.url || '';

        // Favicon — built via DOM API with safe attribute setting
        if (tab.favIconUrl) {
          const img = el('img', 'tab-favicon');
          attr(img, 'alt', '');
          // Block non-http(s) favicon URLs (e.g. javascript:, data:)
          const faviconUrl = String(tab.favIconUrl || '');
          if (/^https?:\/\//i.test(faviconUrl) || /^chrome-extension:\/\//i.test(faviconUrl)) {
            attr(img, 'src', faviconUrl);
          }
          const fallback = el('div', 'tab-favicon-fallback', '⬜');
          fallback.style.display = 'none';
          img.addEventListener('error', () => {
            img.style.display = 'none';
            fallback.style.display = 'flex';
          });
          row.appendChild(img);
          row.appendChild(fallback);
        } else {
          row.appendChild(el('div', 'tab-favicon-fallback', '⬜'));
        }

        // Tab info — textContent only
        const info    = el('div', 'tab-info');
        const title   = el('div', 'tab-title', tab.title || 'Untitled');
        const urlText = el('div', 'tab-url', shortUrl(tab.url));
        info.appendChild(title); info.appendChild(urlText);
        row.appendChild(info);

        // Badges
        if (tab.audible) {
          const badge = el('span', null, '🔊');
          badge.title = 'Playing audio';
          badge.style.cssText = 'font-size:11px;flex-shrink:0';
          row.appendChild(badge);
        }
        if (tab.pinned) {
          const badge = el('span', null, '📌');
          badge.title = 'Pinned';
          badge.style.cssText = 'font-size:11px;flex-shrink:0';
          row.appendChild(badge);
        }

        // Close button
        const closeBtn = el('button', 'tab-close-btn', '✕');
        closeBtn.title = 'Close tab';
        closeBtn.addEventListener('click', e => {
          e.stopPropagation();
          chrome.tabs.remove(tab.id, () => loadTabs());
        });
        row.appendChild(closeBtn);

        // Navigate on row click
        row.addEventListener('click', e => {
          if (e.target === closeBtn) return;
          chrome.tabs.update(tab.id, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        });

        listEl.appendChild(row);
      });
    }

    // ── Load ───────────────────────────────────────────────────────────────
    function loadTabs() {
      chrome.tabs.query({}, tabs => {
        allTabs = tabs.sort((a, b) => {
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return  1;
          if (a.windowId !== b.windowId) return a.windowId - b.windowId;
          return a.index - b.index;
        });
        render();
      });
    }

    ['onCreated','onRemoved','onUpdated','onMoved','onActivated','onAttached'].forEach(ev => {
      if (chrome.tabs[ev]) chrome.tabs[ev].addListener(loadTabs);
    });

    loadTabs();
  }
};

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch(e) { return String(url || '').slice(0, 100); }
}
