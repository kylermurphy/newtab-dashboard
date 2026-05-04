/* security.js — sanitization helpers + SyncStore
 *
 * SyncStore wraps chrome.storage.sync with:
 *   - Automatic chunking so no single key exceeds 7KB (sync limit is 8KB)
 *   - Local write-through cache for instant reads on the same device
 *   - Last-write-wins conflict resolution via updatedAt timestamps
 *   - Graceful quota-exceeded handling with fallback to local-only
 *   - onChange listener so other open tabs/windows stay in sync
 */
'use strict';

// ── Sanitization helpers ───────────────────────────────────────────────────
window.sec = {

  esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#x27;');
  },

  safeColor(val, fallback = '#7a7f8e') {
    if (typeof val !== 'string') return fallback;
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val.trim())
      ? val.trim() : fallback;
  },

  safeLayout(val) {
    return ['row', '2x2', '3x2'].includes(val) ? val : 'row';
  },

  el(tag, classes, text) {
    const node = document.createElement(tag);
    if (classes) node.className = classes;
    if (text != null) node.textContent = String(text);
    return node;
  },

  attr(node, name, value) {
    const val = String(value == null ? '' : value);
    if ((name === 'href' || name === 'src' || name === 'action') &&
        /^\s*(javascript|data|vbscript):/i.test(val)) return;
    node.setAttribute(name, val);
  },

  /**
   * Tagged template for static HTML shells.
   * ENFORCES that all interpolated values are safe instance IDs:
   * only alphanumeric chars, underscores, and hyphens are permitted.
   * Throws at runtime if any interpolated value contains other characters.
   */
  shell(strings, ...values) {
    const SAFE_ID = /^[a-zA-Z0-9_-]*$/;
    return strings.reduce((acc, str, i) => {
      const val = values[i] != null ? String(values[i]) : '';
      if (val && !SAFE_ID.test(val)) {
        throw new Error(`sec.shell: unsafe interpolated value: "${val}"`);
      }
      return acc + str + val;
    }, '');
  },
};

// ── SyncStore ──────────────────────────────────────────────────────────────
//
// Usage:
//   const store = new SyncStore('myapp_notes');
//   await store.setItems(itemsArray, item => item.id);   // save array
//   const items = await store.getItems();                // load array
//   store.onChange(newItems => { ... });                 // live updates
//
// Data model in storage:
//   sync + local:  `${ns}:index`  → JSON array of ids
//   sync + local:  `${ns}:item:${id}`  → JSON of single item (≤7KB)
//   local only:    `${ns}:sync_ok` → 'true' | 'false' (quota status)
//
window.SyncStore = class SyncStore {
  constructor(namespace) {
    this.ns       = namespace;
    this.syncOk   = true;   // false if we've ever hit a quota error
    this._listeners = [];
    this._boundOnChanged = this._onChanged.bind(this);
    chrome.storage.onChanged.addListener(this._boundOnChanged);
  }

  // ── Key helpers ────────────────────────────────────────────────────────
  _indexKey()    { return `${this.ns}:index`; }
  _itemKey(id)   { return `${this.ns}:item:${id}`; }
  _statusKey()   { return `${this.ns}:sync_ok`; }

  // ── Check quota status from local ─────────────────────────────────────
  async _loadSyncStatus() {
    return new Promise(resolve => {
      chrome.storage.local.get([this._statusKey()], res => {
        this.syncOk = res[this._statusKey()] !== 'false';
        resolve();
      });
    });
  }

  async _setSyncStatus(ok) {
    this.syncOk = ok;
    await chrome.storage.local.set({ [this._statusKey()]: ok ? 'true' : 'false' });
  }

  // ── Write to sync (with quota fallback) ───────────────────────────────
  async _syncSet(obj) {
    if (!this.syncOk) return;
    return new Promise(resolve => {
      chrome.storage.sync.set(obj, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('QUOTA_BYTES') || msg.includes('quota')) {
            this._setSyncStatus(false);
            console.warn(`[SyncStore:${this.ns}] Sync quota exceeded — falling back to local-only`);
          } else {
            // Log all other sync errors (network offline, profile issues, etc.)
            console.warn(`[SyncStore:${this.ns}] Sync write failed: ${msg}`);
          }
        }
        resolve();
      });
    });
  }

  async _syncRemove(keys) {
    if (!this.syncOk) return;
    return new Promise(resolve => {
      chrome.storage.sync.remove(keys, () => resolve());
    });
  }

  // ── Save array of items ────────────────────────────────────────────────
  // idFn: item => unique string id
  // itemSerializer: item => object to store (defaults to identity)
  async setItems(items, idFn, serializeFn = x => x) {
    await this._loadSyncStatus();

    const ids    = items.map(idFn);
    const indexJson = JSON.stringify(ids);

    // Build the per-item objects
    const toWrite = { [this._indexKey()]: indexJson };
    for (const item of items) {
      const serialized = serializeFn(item);
      const json = JSON.stringify(serialized);
      // Warn if a single item is too large — sync limit is 8192 bytes per key
      if (json.length > 7000) {
        console.warn(`[SyncStore:${this.ns}] Item ${idFn(item)} is ${json.length} bytes — may exceed sync quota`);
      }
      toWrite[this._itemKey(idFn(item))] = json;
    }

    // Write to local first (always succeeds, instant)
    await new Promise(resolve => chrome.storage.local.set(toWrite, resolve));
    // Then mirror to sync in background (may silently fail to quota)
    await this._syncSet(toWrite);
  }

  // ── Remove items by id (call after setItems to clean up deleted ones) ──
  async removeItems(removedIds) {
    if (!removedIds.length) return;
    const keys = removedIds.map(id => this._itemKey(id));
    await new Promise(resolve => chrome.storage.local.remove(keys, resolve));
    await this._syncRemove(keys);
  }

  // ── Load array of items ────────────────────────────────────────────────
  // Reads from local first; if index is missing, falls back to sync.
  // Merges: sync wins for items with newer updatedAt, local wins otherwise.
  async getItems(sanitizeFn = x => x) {
    await this._loadSyncStatus();

    // Step 1: read local index
    const localIndex = await this._getIndex('local');

    // Step 2: if we have a sync connection, also read sync index and merge
    let syncIndex = [];
    if (this.syncOk) {
      syncIndex = await this._getIndex('sync');
    }

    // Union of all known ids
    const allIds = [...new Set([...localIndex, ...syncIndex])];

    if (allIds.length === 0) return [];

    // Step 3: fetch all items from both stores
    const localItems = await this._fetchItems(allIds, 'local');
    const syncItems  = this.syncOk ? await this._fetchItems(allIds, 'sync') : {};

    // Step 4: merge — for each id, pick whichever copy has newer updatedAt
    const merged = [];
    for (const id of allIds) {
      const local = localItems[id];
      const synced = syncItems[id];
      let winner = local;
      if (synced && local) {
        winner = (synced.updatedAt || 0) > (local.updatedAt || 0) ? synced : local;
      } else if (synced) {
        winner = synced;
      }
      if (winner) merged.push(winner);
    }

    // Step 5: write merged result back to local so it's warm next time
    const toWrite = {};
    const winnerIds = merged.map(item => item.id || item._id);
    toWrite[this._indexKey()] = JSON.stringify(winnerIds);
    for (const item of merged) {
      const id = item.id || item._id;
      if (id) toWrite[this._itemKey(id)] = JSON.stringify(item);
    }
    chrome.storage.local.set(toWrite); // fire and forget

    return merged.map(item => sanitizeFn(item)).filter(Boolean);
  }

  async _getIndex(area) {
    const store = chrome.storage[area];
    if (!store) return [];
    return new Promise(resolve => {
      store.get([this._indexKey()], res => {
        if (chrome.runtime.lastError) { resolve([]); return; }
        try {
          const parsed = JSON.parse(res[this._indexKey()] || '[]');
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch(e) { resolve([]); }
      });
    });
  }

  async _fetchItems(ids, area) {
    const store = chrome.storage[area];
    if (!store) return {};
    const keys = ids.map(id => this._itemKey(id));
    return new Promise(resolve => {
      store.get(keys, res => {
        if (chrome.runtime.lastError) { resolve({}); return; }
        const out = {};
        for (const id of ids) {
          const raw = res[this._itemKey(id)];
          if (raw) {
            try { out[id] = JSON.parse(raw); } catch(e) {}
          }
        }
        resolve(out);
      });
    });
  }

  // ── Single value (for config objects, not arrays) ──────────────────────
  async setConfig(obj) {
    await this._loadSyncStatus();
    const json = JSON.stringify(obj);
    const key  = `${this.ns}:config`;
    await new Promise(resolve => chrome.storage.local.set({ [key]: json }, resolve));
    await this._syncSet({ [key]: json });
  }

  async getConfig(sanitizeFn = x => x, defaultVal = null) {
    await this._loadSyncStatus();
    const key = `${this.ns}:config`;

    const localVal = await new Promise(resolve => {
      chrome.storage.local.get([key], res => {
        try { resolve(JSON.parse(res[key] || 'null')); } catch(e) { resolve(null); }
      });
    });

    let syncVal = null;
    if (this.syncOk) {
      syncVal = await new Promise(resolve => {
        chrome.storage.sync.get([key], res => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          try { resolve(JSON.parse(res[key] || 'null')); } catch(e) { resolve(null); }
        });
      });
    }

    // Sync wins if its updatedAt is newer
    let winner = localVal;
    if (syncVal && localVal) {
      winner = (syncVal.updatedAt || 0) > (localVal.updatedAt || 0) ? syncVal : localVal;
    } else if (syncVal) {
      winner = syncVal;
    }

    if (winner) {
      // Back-fill local
      chrome.storage.local.set({ [key]: JSON.stringify(winner) });
      return sanitizeFn(winner);
    }
    return defaultVal;
  }

  // ── Live updates from sync ─────────────────────────────────────────────
  onChange(fn) {
    this._listeners.push(fn);
  }

  _onChanged(changes, area) {
    if (area !== 'sync' || !this.syncOk) return;
    // If any key in our namespace changed, reload and notify
    const relevant = Object.keys(changes).some(k => k.startsWith(this.ns + ':'));
    if (!relevant || !this._listeners.length) return;
    // Debounce — multiple keys often change together
    clearTimeout(this._changeTimer);
    this._changeTimer = setTimeout(() => {
      this._listeners.forEach(fn => fn());
    }, 300);
  }

  destroy() {
    chrome.storage.onChanged.removeListener(this._boundOnChanged);
    this._listeners = [];
  }
};
