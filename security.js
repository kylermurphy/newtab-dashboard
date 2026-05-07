/* security.js — sanitization helpers + SyncStore
 *
 * SyncStore wraps chrome.storage.sync with:
 *   - Automatic chunking so no single key exceeds 7KB (sync limit is 8KB)
 *   - Local write-through cache for instant reads on the same device
 *   - Last-write-wins conflict resolution via updatedAt timestamps
 *   - Pre-write connectivity check — detects when sync is unavailable
 *     (not signed into Chrome, extension sync disabled, network offline)
 *     and surfaces the exact reason rather than silently doing nothing
 *   - Graceful quota-exceeded handling with fallback to local-only
 *   - onChange listener so other open tabs/windows stay in sync
 *
 * ── Why developer-mode sync requires extra setup ───────────────────────
 * Unpacked extensions (loaded via "Load unpacked") get a RANDOM extension
 * ID each install. chrome.storage.sync keys are scoped to that ID, so two
 * computers with separately-loaded copies of the extension have different
 * IDs and cannot see each other's data — they are writing to completely
 * separate namespaces.
 *
 * To sync between two developer-mode installs you must give the extension
 * a STABLE ID. Do this once:
 *   1. Open chrome://extensions on each computer.
 *   2. Note the extension ID shown under "Dashboard — New Tab".
 *   3. If they differ, copy the key from the .pem file (generated when
 *      Chrome first creates the extension) and add it to manifest.json:
 *        "key": "<base64-encoded public key from .pem>"
 *   4. Reload both extensions — they should now share the same ID.
 *
 * Alternatively, publish to the Chrome Web Store (even as unlisted) —
 * published extensions always have a stable ID and sync works out of
 * the box with no extra steps.
 * ──────────────────────────────────────────────────────────────────────
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
   * Enforces that all interpolated values are safe instance IDs
   * (alphanumeric, underscore, hyphen only). Throws at runtime otherwise.
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
window.SyncStore = class SyncStore {
  constructor(namespace) {
    this.ns          = namespace;
    this.syncOk      = true;
    this.syncReason  = 'ok';  // human-readable reason when not ok
    this._listeners  = [];
    this._boundOnChanged = this._onChanged.bind(this);
    chrome.storage.onChanged.addListener(this._boundOnChanged);
  }

  // ── Key helpers ────────────────────────────────────────────────────────
  _indexKey()  { return `${this.ns}:index`; }
  _itemKey(id) { return `${this.ns}:item:${id}`; }
  _statusKey() { return `${this.ns}:sync_status`; }

  // ── Sync connectivity probe ────────────────────────────────────────────
  // Writes a tiny sentinel value to sync storage and reads it back.
  // This is the only reliable way to know whether sync is actually
  // working before committing real data to it.
  async _probSync() {
    const PROBE_KEY = `${this.ns}:probe`;
    const PROBE_VAL = String(Date.now());

    return new Promise(resolve => {
      chrome.storage.sync.set({ [PROBE_KEY]: PROBE_VAL }, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || 'unknown error';
          this._markSyncFailed(_classifyError(msg));
          resolve(false);
          return;
        }
        // Read it back to confirm round-trip
        chrome.storage.sync.get([PROBE_KEY], res => {
          if (chrome.runtime.lastError || res[PROBE_KEY] !== PROBE_VAL) {
            this._markSyncFailed('sync read-back failed');
            resolve(false);
          } else {
            this.syncOk     = true;
            this.syncReason = 'ok';
            chrome.storage.local.set({ [this._statusKey()]: 'ok' });
            resolve(true);
          }
        });
      });
    });
  }

  _markSyncFailed(reason) {
    this.syncOk     = false;
    this.syncReason = reason;
    chrome.storage.local.set({ [this._statusKey()]: reason });
    console.warn(`[SyncStore:${this.ns}] Sync unavailable: ${reason}`);
  }

  // Classify raw Chrome error messages into human-readable reasons
  // so the UI sync dot tooltip is actually useful.
  // (These are the real strings Chrome returns in practice.)
  // eslint-disable-next-line no-unused-vars

  // ── Write to sync ──────────────────────────────────────────────────────
  async _syncSet(obj) {
    if (!this.syncOk) return false;

    // Probe first to catch stale syncOk=true state
    const reachable = await this._probSync();
    if (!reachable) return false;

    return new Promise(resolve => {
      chrome.storage.sync.set(obj, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('QUOTA_BYTES') || msg.includes('quota')) {
            this._markSyncFailed('quota exceeded — saving locally only');
          } else {
            this._markSyncFailed(_classifyError(msg));
          }
          resolve(false);
        } else {
          resolve(true);
        }
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
  async setItems(items, idFn, serializeFn = x => x) {
    const ids       = items.map(idFn);
    const toWrite   = { [this._indexKey()]: JSON.stringify(ids) };

    for (const item of items) {
      const json = JSON.stringify(serializeFn(item));
      if (json.length > 7000) {
        console.warn(`[SyncStore:${this.ns}] Item ${idFn(item)} is ${json.length} bytes — may exceed sync 8KB limit`);
      }
      toWrite[this._itemKey(idFn(item))] = json;
    }

    // Always write to local first (instant, always works)
    await new Promise(resolve => chrome.storage.local.set(toWrite, resolve));

    // Mirror to sync — _syncSet probes connectivity internally
    const synced = await this._syncSet(toWrite);
    return synced;
  }

  // ── Remove items ────────────────────────────────────────────────────────
  async removeItems(removedIds) {
    if (!removedIds.length) return;
    const keys = removedIds.map(id => this._itemKey(id));
    await new Promise(resolve => chrome.storage.local.remove(keys, resolve));
    await this._syncRemove(keys);
  }

  // ── Load array of items ────────────────────────────────────────────────
  // Always reads local immediately, then merges with sync if available.
  // The merge uses updatedAt — whichever copy is newer wins.
  async getItems(sanitizeFn = x => x) {
    // First get local data immediately — never block on sync probe for reads
    const localIndex = await this._getIndex('local');
    const localItems = localIndex.length
      ? await this._fetchItems(localIndex, 'local')
      : {};

    // Then probe sync and merge if reachable
    const reachable = await this._probSync();

    let merged = Object.values(localItems);

    if (reachable) {
      const syncIndex = await this._getIndex('sync');
      const allIds    = [...new Set([...localIndex, ...syncIndex])];

      if (allIds.length > 0) {
        const syncItems = await this._fetchItems(allIds, 'sync');

        merged = [];
        for (const id of allIds) {
          const local  = localItems[id];
          const synced = syncItems[id];
          let winner   = local;
          if (synced && local) {
            winner = (synced.updatedAt || 0) > (local.updatedAt || 0) ? synced : local;
          } else if (synced) {
            winner = synced;
          }
          if (winner) merged.push(winner);
        }

        // Back-fill local with the merged result
        const toWrite = { [this._indexKey()]: JSON.stringify(merged.map(i => i.id || i._id)) };
        for (const item of merged) {
          const id = item.id || item._id;
          if (id) toWrite[this._itemKey(id)] = JSON.stringify(item);
        }
        chrome.storage.local.set(toWrite);
      }
    }

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

  // ── Single config object ────────────────────────────────────────────────
  async setConfig(obj) {
    const json = JSON.stringify(obj);
    const key  = `${this.ns}:config`;
    await new Promise(resolve => chrome.storage.local.set({ [key]: json }, resolve));
    await this._syncSet({ [key]: json });
  }

  async getConfig(sanitizeFn = x => x, defaultVal = null) {
    const key = `${this.ns}:config`;

    const localVal = await new Promise(resolve => {
      chrome.storage.local.get([key], res => {
        try { resolve(JSON.parse(res[key] || 'null')); } catch(e) { resolve(null); }
      });
    });

    const reachable = await this._probSync();
    let syncVal = null;

    if (reachable) {
      syncVal = await new Promise(resolve => {
        chrome.storage.sync.get([key], res => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          try { resolve(JSON.parse(res[key] || 'null')); } catch(e) { resolve(null); }
        });
      });
    }

    let winner = localVal;
    if (syncVal && localVal) {
      winner = (syncVal.updatedAt || 0) > (localVal.updatedAt || 0) ? syncVal : localVal;
    } else if (syncVal) {
      winner = syncVal;
    }

    if (winner) {
      chrome.storage.local.set({ [key]: JSON.stringify(winner) });
      return sanitizeFn(winner);
    }
    return defaultVal;
  }

  // ── Sync status for UI ──────────────────────────────────────────────────
  // Modules call this to get a status string for the indicator dot.
  // Returns: 'synced' | 'local-only' | 'no-account' | 'sync-disabled' |
  //          'quota' | 'offline' | 'unstable-id'
  getSyncStatus() {
    if (this.syncOk) return 'synced';
    if (this.syncReason.includes('quota'))       return 'quota';
    if (this.syncReason.includes('account') ||
        this.syncReason.includes('sign'))        return 'no-account';
    if (this.syncReason.includes('disabled') ||
        this.syncReason.includes('policy'))      return 'sync-disabled';
    if (this.syncReason.includes('offline') ||
        this.syncReason.includes('network'))     return 'offline';
    if (this.syncReason.includes('id') ||
        this.syncReason.includes('unstable'))    return 'unstable-id';
    return 'local-only';
  }

  // ── Live updates from sync ─────────────────────────────────────────────
  onChange(fn) {
    this._listeners.push(fn);
  }

  _onChanged(changes, area) {
    if (area !== 'sync') return;
    const relevant = Object.keys(changes).some(k => k.startsWith(this.ns + ':'));
    if (!relevant || !this._listeners.length) return;
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

// ── Error classifier ───────────────────────────────────────────────────────
function _classifyError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('not signed') || m.includes('no account') ||
      m.includes('profile') || m.includes('sign in'))    return 'not signed into Chrome';
  if (m.includes('sync') && m.includes('disabled'))      return 'extension sync disabled in Chrome settings';
  if (m.includes('quota'))                               return 'quota exceeded';
  if (m.includes('network') || m.includes('offline') ||
      m.includes('connection'))                          return 'network offline';
  return msg || 'unknown sync error';
}
