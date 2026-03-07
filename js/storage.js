/**
 * storage.js - localStorage auto-save, JSON export/import, PNG export
 */

const Storage = (() => {
  const STORAGE_KEY = 'roomPlanner_state';
  const DEFAULT_BASE_NAME = 'room-plan';
  let autoSaveTimer = null;
  let _loadedBaseName = null;

  /** Return the base name (without extension) for exports.
   *  Falls back to the default when no file has been loaded. */
  function getBaseName() {
    return _loadedBaseName || DEFAULT_BASE_NAME;
  }

  /** Set (or clear) the base name used for exports. Pass null to reset. */
  function setBaseName(name) {
    _loadedBaseName = name || null;
  }

  /**
   * Validate that a parsed JSON object has the expected structure for a plan state.
   * Throws on invalid data; returns normally on success.
   */
  function validateState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('Invalid plan file: expected a JSON object');
    }
    // Validate top-level arrays
    for (const key of ['walls', 'doors', 'windows', 'labels']) {
      if (state[key] !== undefined && !Array.isArray(state[key])) {
        throw new Error(`Invalid plan file: "${key}" must be an array`);
      }
    }
    // Validate walls have required numeric fields
    if (state.walls) {
      for (let i = 0; i < state.walls.length; i++) {
        const w = state.walls[i];
        if (typeof w !== 'object' || w === null) {
          throw new Error(`Invalid wall at index ${i}`);
        }
        for (const f of ['x1', 'y1', 'x2', 'y2']) {
          if (typeof w[f] !== 'number' || !isFinite(w[f])) {
            throw new Error(`Invalid wall at index ${i}: "${f}" must be a finite number`);
          }
        }
      }
    }
    // Validate doors reference existing wall IDs and have required fields
    if (state.doors) {
      const wallIds = new Set((state.walls || []).map(w => w.id));
      for (let i = 0; i < state.doors.length; i++) {
        const d = state.doors[i];
        if (typeof d !== 'object' || d === null) {
          throw new Error(`Invalid door at index ${i}`);
        }
        if (!wallIds.has(d.wallId)) {
          throw new Error(`Door at index ${i} references non-existent wall ${d.wallId}`);
        }
      }
    }
    // Validate windows reference existing wall IDs
    if (state.windows) {
      const wallIds = new Set((state.walls || []).map(w => w.id));
      for (let i = 0; i < state.windows.length; i++) {
        const w = state.windows[i];
        if (typeof w !== 'object' || w === null) {
          throw new Error(`Invalid window at index ${i}`);
        }
        if (!wallIds.has(w.wallId)) {
          throw new Error(`Window at index ${i} references non-existent wall ${w.wallId}`);
        }
      }
    }
    // Validate roomMeta is an object (if present)
    if (state.roomMeta !== undefined &&
        (typeof state.roomMeta !== 'object' || Array.isArray(state.roomMeta) || state.roomMeta === null)) {
      throw new Error('Invalid plan file: "roomMeta" must be an object');
    }
  }

  /** Save to localStorage */
  function save() {
    try {
      const state = Model.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  /** Load from localStorage */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        validateState(state);
        Model.setState(state);
        return true;
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
    }
    return false;
  }

  /** Debounced auto-save */
  function autoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      save();
    }, 500);
  }

  /** Export state as JSON file download */
  function exportJSON() {
    const state = Model.getState();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getBaseName() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Import state from a JSON file */
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const state = JSON.parse(e.target.result);
          validateState(state);
          History.push(); // save current state before importing
          Model.setState(state);
          save();
          // Remember the loaded filename (strip .json extension)
          if (file.name) {
            _loadedBaseName = file.name.replace(/\.json$/i, '');
          }
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /** Export as PNG */
  function exportPNG() {
    const dataUrl = CanvasRenderer.exportPNG();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = getBaseName() + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /** Clear saved data */
  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    save,
    load,
    autoSave,
    exportJSON,
    importJSON,
    exportPNG,
    clearStorage,
    getBaseName,
    setBaseName
  };
})();
