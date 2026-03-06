/**
 * app.js - Entry point. Initializes everything, wires up events and UI.
 */

(function () {
  'use strict';

  // ===== DOM References =====
  const canvas = document.getElementById('planner-canvas');
  const canvasContainer = document.getElementById('canvas-container');
  const propsContent = document.getElementById('props-content');
  const roomsList = document.getElementById('rooms-list');
  const fileInput = document.getElementById('file-input');
  const snapCheckbox = document.getElementById('snap-enabled');

  // ===== Init modules =====
  CanvasRenderer.init(canvas);

  function requestRender() {
    CanvasRenderer.render();
  }

  Tools.init(requestRender);

  // Load saved state
  const loaded = Storage.load();
  if (!loaded) {
    // Push initial empty state to history
    History.push();
  }

  // ===== Canvas Event Binding =====
  canvasContainer.addEventListener('mousedown', (e) => Tools.onMouseDown(e));
  canvasContainer.addEventListener('mousemove', (e) => Tools.onMouseMove(e));
  canvasContainer.addEventListener('mouseup', (e) => Tools.onMouseUp(e));
  canvasContainer.addEventListener('wheel', (e) => Tools.onWheel(e), { passive: false });
  canvasContainer.addEventListener('dblclick', (e) => Tools.onDblClick(e));
  canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault());

  // Window-level events for key and mouse up (handle releasing outside canvas)
  window.addEventListener('mouseup', (e) => Tools.onMouseUp(e));
  window.addEventListener('keydown', (e) => handleKeyDown(e));
  window.addEventListener('keyup', (e) => Tools.onKeyUp(e));

  // Resize handler
  window.addEventListener('resize', () => {
    CanvasRenderer.resize();
    requestRender();
  });

  // ===== Toolbar Buttons =====

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      Tools.setTool(tool);
    });
  });

  // Tool change callback - update active button
  Tools.onToolChange((tool) => {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    updateCursorClass(tool);
  });

  function updateCursorClass(tool) {
    canvasContainer.className = '';
    canvasContainer.classList.add('cursor-' + tool);
  }

  // Selection change callback - update properties panel
  Tools.onSelectionChange((sel) => {
    updatePropertiesPanel(sel);
  });

  // Model change callback - update rooms list
  Tools.onModelChange(() => {
    updateRoomsList();
  });

  // Undo/Redo
  document.getElementById('btn-undo').addEventListener('click', () => {
    History.undo();
    requestRender();
    updateRoomsList();
  });

  document.getElementById('btn-redo').addEventListener('click', () => {
    History.redo();
    requestRender();
    updateRoomsList();
  });

  // Save/Load/Export
  document.getElementById('btn-save').addEventListener('click', () => {
    Storage.exportJSON();
    showToast('Plan exported as JSON');
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        await Storage.importJSON(e.target.files[0]);
        requestRender();
        updateRoomsList();
        showToast('Plan loaded successfully');
      } catch (err) {
        showToast('Failed to load file: ' + err.message);
      }
      fileInput.value = ''; // Reset
    }
  });

  document.getElementById('btn-export-png').addEventListener('click', () => {
    Storage.exportPNG();
    showToast('Plan exported as PNG');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear the entire plan? This cannot be undone.')) {
      History.push();
      Model.clear();
      History.clear();
      Storage.clearStorage();
      Tools.select(null);
      requestRender();
      updatePropertiesPanel(null);
      updateRoomsList();
      showToast('Plan cleared');
    }
  });

  // Snap toggle
  snapCheckbox.addEventListener('change', () => {
    Tools.setSnapEnabled(snapCheckbox.checked);
  });

  // History change callback
  History.onChange(() => {
    updateRoomsList();
    Storage.autoSave();
  });

  // ===== Keyboard Shortcuts =====

  function handleKeyDown(e) {
    // Don't handle shortcuts when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Pass to tools for Space key
    Tools.onKeyDown(e);

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          History.undo();
          requestRender();
          updateRoomsList();
          return;
        case 'y':
          e.preventDefault();
          History.redo();
          requestRender();
          updateRoomsList();
          return;
        case 's':
          e.preventDefault();
          Storage.exportJSON();
          showToast('Plan exported as JSON');
          return;
      }
    }

    switch (e.key.toLowerCase()) {
      case 'v':
        Tools.setTool('select');
        break;
      case 'w':
        Tools.setTool('wall');
        break;
      case 'd':
        Tools.setTool('door');
        break;
      case 'n':
        Tools.setTool('window');
        break;
      case 'l':
        Tools.setTool('label');
        break;
      case 'g':
        snapCheckbox.checked = !snapCheckbox.checked;
        Tools.setSnapEnabled(snapCheckbox.checked);
        showToast('Snap ' + (snapCheckbox.checked ? 'enabled' : 'disabled'));
        break;
      case 'escape':
        Tools.cancelCurrentAction();
        Tools.select(null);
        requestRender();
        updatePropertiesPanel(null);
        break;
      case 'delete':
      case 'backspace':
        if (e.target === document.body) {
          e.preventDefault();
          Tools.deleteSelected();
          updatePropertiesPanel(null);
          updateRoomsList();
        }
        break;
    }
  }

  // ===== Properties Panel =====

  function updatePropertiesPanel(sel) {
    if (!sel) {
      propsContent.innerHTML = '<p class="props-hint">Select an element to edit its properties, or use a tool to start drawing.</p>';
      return;
    }

    let html = '';

    switch (sel.type) {
      case 'wall': {
        const wall = Model.getWall(sel.id);
        if (!wall) break;
        const len = Geometry.segmentLength(wall.x1, wall.y1, wall.x2, wall.y2);
        html = `
          <div class="prop-field"><label>Type</label><span class="prop-value">Wall</span></div>
          <div class="prop-field"><label>Length</label><span class="prop-value">${(len / 100).toFixed(2)} m</span></div>
          <div class="prop-field">
            <label>Thickness</label>
            <input type="number" id="prop-thickness" value="${wall.thickness}" min="5" max="100" step="5">
            <span style="font-size:11px;color:#999">cm</span>
          </div>
          <div class="prop-field">
            <label>Color</label>
            <input type="color" id="prop-wall-color" value="${wall.color}">
          </div>
          <div class="prop-field">
            <label></label>
            <button class="prop-btn danger" id="prop-delete">Delete Wall</button>
          </div>
        `;
        break;
      }
      case 'door': {
        const door = Model.getDoor(sel.id);
        if (!door) break;
        html = `
          <div class="prop-field"><label>Type</label><span class="prop-value">Door</span></div>
          <div class="prop-field">
            <label>Width</label>
            <input type="number" id="prop-door-width" value="${door.width}" min="40" max="200" step="5">
            <span style="font-size:11px;color:#999">cm</span>
          </div>
          <div class="prop-field">
            <label>Swing</label>
            <select id="prop-door-direction">
              <option value="left" ${door.openDirection === 'left' ? 'selected' : ''}>Left</option>
              <option value="right" ${door.openDirection === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </div>
          <div class="prop-field">
            <label></label>
            <button class="prop-btn danger" id="prop-delete">Delete Door</button>
          </div>
        `;
        break;
      }
      case 'window': {
        const win = Model.getWindow(sel.id);
        if (!win) break;
        html = `
          <div class="prop-field"><label>Type</label><span class="prop-value">Window</span></div>
          <div class="prop-field">
            <label>Width</label>
            <input type="number" id="prop-win-width" value="${win.width}" min="30" max="300" step="10">
            <span style="font-size:11px;color:#999">cm</span>
          </div>
          <div class="prop-field">
            <label></label>
            <button class="prop-btn danger" id="prop-delete">Delete Window</button>
          </div>
        `;
        break;
      }
      case 'label': {
        const label = Model.getLabel(sel.id);
        if (!label) break;
        html = `
          <div class="prop-field"><label>Type</label><span class="prop-value">Label</span></div>
          <div class="prop-field">
            <label>Text</label>
            <input type="text" id="prop-label-text" value="${escapeHtml(label.text)}">
          </div>
          <div class="prop-field">
            <label>Size</label>
            <input type="number" id="prop-label-size" value="${label.fontSize}" min="8" max="48" step="1">
            <span style="font-size:11px;color:#999">px</span>
          </div>
          <div class="prop-field">
            <label>Color</label>
            <input type="color" id="prop-label-color" value="${label.color}">
          </div>
          <div class="prop-field">
            <label></label>
            <button class="prop-btn danger" id="prop-delete">Delete Label</button>
          </div>
        `;
        break;
      }
      case 'room': {
        const room = Model.rooms.find(r => r.key === sel.key);
        if (!room) break;
        const areaSqM = room.area / 10000;
        html = `
          <div class="prop-field"><label>Type</label><span class="prop-value">Room</span></div>
          <div class="prop-field"><label>Area</label><span class="prop-value">${areaSqM.toFixed(1)} m&sup2;</span></div>
          <div class="prop-field">
            <label>Name</label>
            <input type="text" id="prop-room-label" value="${escapeHtml(room.label || '')}">
          </div>
          <div class="prop-field">
            <label>Color</label>
            <input type="color" id="prop-room-color" value="${room.color}">
          </div>
        `;
        break;
      }
    }

    propsContent.innerHTML = html;

    // Bind property change events
    bindPropertyEvents(sel);
  }

  function bindPropertyEvents(sel) {
    // Delete button
    const delBtn = document.getElementById('prop-delete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        Tools.deleteSelected();
        updatePropertiesPanel(null);
        updateRoomsList();
      });
    }

    switch (sel.type) {
      case 'wall': {
        bindInput('prop-thickness', (v) => {
          History.push();
          Model.updateWall(sel.id, { thickness: parseInt(v) });
          Storage.autoSave();
          requestRender();
        });
        bindInput('prop-wall-color', (v) => {
          History.push();
          Model.updateWall(sel.id, { color: v });
          Storage.autoSave();
          requestRender();
        });
        break;
      }
      case 'door': {
        bindInput('prop-door-width', (v) => {
          History.push();
          Model.updateDoor(sel.id, { width: parseInt(v) });
          Storage.autoSave();
          requestRender();
        });
        bindInput('prop-door-direction', (v) => {
          History.push();
          Model.updateDoor(sel.id, { openDirection: v });
          Storage.autoSave();
          requestRender();
        });
        break;
      }
      case 'window': {
        bindInput('prop-win-width', (v) => {
          History.push();
          Model.updateWindow(sel.id, { width: parseInt(v) });
          Storage.autoSave();
          requestRender();
        });
        break;
      }
      case 'label': {
        bindInput('prop-label-text', (v) => {
          History.push();
          Model.updateLabel(sel.id, { text: v });
          Storage.autoSave();
          requestRender();
        });
        bindInput('prop-label-size', (v) => {
          History.push();
          Model.updateLabel(sel.id, { fontSize: parseInt(v) });
          Storage.autoSave();
          requestRender();
        });
        bindInput('prop-label-color', (v) => {
          History.push();
          Model.updateLabel(sel.id, { color: v });
          Storage.autoSave();
          requestRender();
        });
        break;
      }
      case 'room': {
        bindInput('prop-room-label', (v) => {
          History.push();
          Model.updateRoomMeta(sel.key, { label: v });
          Storage.autoSave();
          requestRender();
          updateRoomsList();
        });
        bindInput('prop-room-color', (v) => {
          History.push();
          Model.updateRoomMeta(sel.key, { color: v });
          Storage.autoSave();
          requestRender();
          updateRoomsList();
        });
        break;
      }
    }
  }

  function bindInput(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    const eventType = el.type === 'color' ? 'input' : 'change';
    el.addEventListener(eventType, () => onChange(el.value));
    if (el.type === 'text') {
      el.addEventListener('input', () => onChange(el.value));
    }
  }

  // ===== Rooms List =====

  function updateRoomsList() {
    const rooms = Model.rooms;
    if (rooms.length === 0) {
      roomsList.innerHTML = '<p class="props-hint">Closed wall shapes will appear here as rooms.</p>';
      return;
    }

    let html = '';
    rooms.forEach((room, i) => {
      const areaSqM = room.area / 10000;
      const sel = CanvasRenderer.getSelection();
      const isSelected = sel && sel.type === 'room' && sel.key === room.key;
      const name = room.label || `Room ${i + 1}`;
      html += `
        <div class="room-item${isSelected ? ' selected' : ''}" data-room-key="${room.key}">
          <div class="room-color-swatch" style="background: ${room.color}"></div>
          <span class="room-name">${escapeHtml(name)}</span>
          <span class="room-area">${areaSqM.toFixed(1)} m&sup2;</span>
        </div>
      `;
    });
    roomsList.innerHTML = html;

    // Bind click
    roomsList.querySelectorAll('.room-item').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.dataset.roomKey;
        Tools.select({ type: 'room', key });
        updatePropertiesPanel({ type: 'room', key });
        updateRoomsList();
        requestRender();
      });
    });
  }

  // ===== Toast =====

  function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ===== Utility =====

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Initial Render =====
  updateCursorClass('select');
  updateRoomsList();
  requestRender();

})();
