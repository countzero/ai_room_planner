/**
 * storage.js - localStorage auto-save, JSON export/import, PNG export
 */

const Storage = (() => {
  const STORAGE_KEY = 'roomPlanner_state';
  let autoSaveTimer = null;

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
    a.download = 'room-plan.json';
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
          History.push(); // save current state before importing
          Model.setState(state);
          save();
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
    a.download = 'room-plan.png';
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
    clearStorage
  };
})();
