/**
 * tools.js - Tool state machine
 * Handles all mouse/keyboard interaction for each tool mode.
 */

const Tools = (() => {
  let activeTool = 'select';
  let _onToolChange = null;
  let _onSelectionChange = null;
  let _onModelChange = null;
  let _requestRender = null;

  // Shared interaction state
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let spaceHeld = false;

  // Wall tool state
  let wallPoints = []; // array of {x, y}
  let wallPreviewEnd = null; // {x, y}

  // Select tool state
  let isDragging = false;
  let dragType = null; // 'move-wall', 'move-endpoint1', 'move-endpoint2', 'move-label', 'move-door', 'move-window'
  let dragTarget = null;
  let dragStartWorld = null;
  let dragOriginal = null;

  // Snap state
  let snapEnabled = true;

  const container = () => document.getElementById('canvas-container');

  function init(requestRender) {
    _requestRender = requestRender;
  }

  function setTool(tool) {
    // Cancel any in-progress drawing
    cancelCurrentAction();
    activeTool = tool;
    updateCursor();
    if (_onToolChange) _onToolChange(tool);
    render();
  }

  function getTool() { return activeTool; }

  function setSnapEnabled(v) { snapEnabled = v; }
  function isSnapEnabled() { return snapEnabled; }

  function onToolChange(fn) { _onToolChange = fn; }
  function onSelectionChange(fn) { _onSelectionChange = fn; }
  function onModelChange(fn) { _onModelChange = fn; }

  function notifyModelChange() {
    if (_onModelChange) _onModelChange();
  }

  function cancelCurrentAction() {
    wallPoints = [];
    wallPreviewEnd = null;
    CanvasRenderer.setGhostLine(null);
    CanvasRenderer.setWallDrawPoints([]);
    CanvasRenderer.setSnapIndicator(null);
    CanvasRenderer.setHoverWall(null);
    isDragging = false;
    dragType = null;
    dragTarget = null;
  }

  function updateCursor() {
    const c = container();
    if (!c) return;
    c.className = '';
    if (isPanning) {
      c.classList.add('cursor-grabbing');
    } else if (spaceHeld) {
      c.classList.add('cursor-grab');
    } else {
      c.classList.add('cursor-' + activeTool);
    }
  }

  /** Snap a world point based on current settings */
  function snapPoint(wx, wy, fromPoint = null) {
    if (!snapEnabled) return { x: wx, y: wy };

    // First try snapping to existing wall endpoints
    const thresholdWorld = CanvasRenderer.screenToWorldDist(Geometry.SNAP_THRESHOLD);
    const epSnap = Model.snapToExistingPoint(wx, wy, thresholdWorld);
    if (epSnap) {
      CanvasRenderer.setSnapIndicator(epSnap);
      return epSnap;
    }

    // Then snap to grid
    const snapped = Geometry.snapPointToGrid(wx, wy);

    // Angle snapping if drawing from a point (Shift for 90-only)
    if (fromPoint) {
      const angleSnapped = Geometry.snapEndpointToAngle(
        fromPoint.x, fromPoint.y, snapped.x, snapped.y,
        Geometry.ANGLE_SNAP
      );
      // Re-snap the angle-snapped result to grid
      const finalSnap = Geometry.snapPointToGrid(angleSnapped.x, angleSnapped.y);
      CanvasRenderer.setSnapIndicator(finalSnap);
      return finalSnap;
    }

    CanvasRenderer.setSnapIndicator(snapped);
    return snapped;
  }

  function render() {
    if (_requestRender) _requestRender();
  }

  function select(sel) {
    CanvasRenderer.setSelection(sel);
    if (_onSelectionChange) _onSelectionChange(sel);
  }

  // ========== Event Handlers ==========

  function onMouseDown(e) {
    // Ignore clicks on the label input overlay
    if (e.target.closest && e.target.closest('.label-input-overlay')) return;

    const rect = CanvasRenderer.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle mouse or Space+click = pan
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      updateCursor();
      e.preventDefault();
      e.stopPropagation();
      // Capture pointer so we receive move/up events even outside canvas
      if (e.target.setPointerCapture && e.pointerId !== undefined) {
        e.target.setPointerCapture(e.pointerId);
      }
      return;
    }

    if (e.button !== 0) return;

    const world = CanvasRenderer.screenToWorld(sx, sy);

    switch (activeTool) {
      case 'select':
        handleSelectMouseDown(world, e);
        break;
      case 'grab':
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        updateCursor();
        e.preventDefault();
        if (e.target.setPointerCapture && e.pointerId !== undefined) {
          e.target.setPointerCapture(e.pointerId);
        }
        break;
      case 'wall':
        handleWallClick(world, e);
        break;
      case 'door':
        handleDoorClick(world, e);
        break;
      case 'window':
        handleWindowClick(world, e);
        break;
      case 'label':
        handleLabelClick(world, e, sx, sy);
        break;
    }
  }

  function onMouseMove(e) {
    const rect = CanvasRenderer.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Pan
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      CanvasRenderer.pan(dx, dy);
      panStartX = e.clientX;
      panStartY = e.clientY;
      e.preventDefault();
      render();
      return;
    }

    const world = CanvasRenderer.screenToWorld(sx, sy);

    // Update cursor position display
    const posEl = document.getElementById('cursor-pos');
    if (posEl) {
      posEl.textContent = `${(world.x / 100).toFixed(2)}, ${(world.y / 100).toFixed(2)} m`;
    }

    switch (activeTool) {
      case 'select':
        handleSelectMouseMove(world, e);
        break;
      case 'wall':
        handleWallMouseMove(world, e);
        break;
      case 'door':
      case 'window':
        handleDoorWindowHover(world);
        break;
    }
  }

  function onMouseUp(e) {
    if (isPanning) {
      isPanning = false;
      // Release pointer capture if it was set
      if (e.target.releasePointerCapture && e.pointerId !== undefined) {
        try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      updateCursor();
      return;
    }

    if (activeTool === 'select' && isDragging) {
      isDragging = false;
      dragType = null;
      dragTarget = null;
      History.push();
      render();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = CanvasRenderer.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = CanvasRenderer.getZoom() * factor;
    CanvasRenderer.setZoom(newZoom, sx, sy);

    // Update zoom display
    const zoomEl = document.getElementById('zoom-display');
    if (zoomEl) {
      zoomEl.textContent = Math.round(CanvasRenderer.getZoom() * 100) + '%';
    }

    render();
  }

  function onDblClick(e) {
    if (activeTool === 'wall' && wallPoints.length >= 2) {
      // Finish the wall chain (don't close, just commit)
      finishWallChain(false);
    }

    if (activeTool === 'select') {
      // Double-click on a label to edit
      const rect = CanvasRenderer.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = CanvasRenderer.screenToWorld(sx, sy);
      const threshold = CanvasRenderer.screenToWorldDist(15);
      const label = Model.findLabelAt(world.x, world.y, threshold);
      if (label) {
        startLabelEdit(label, sx, sy);
      }
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Space') {
      spaceHeld = true;
      updateCursor();
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceHeld = false;
      updateCursor();
    }
  }

  // ========== Select Tool ==========

  function handleSelectMouseDown(world, e) {
    const threshold = CanvasRenderer.screenToWorldDist(12);

    // Check what was clicked (priority: labels > doors > windows > wall endpoints > walls > rooms)
    const label = Model.findLabelAt(world.x, world.y, threshold);
    if (label) {
      select({ type: 'label', id: label.id });
      isDragging = true;
      dragType = 'move-label';
      dragTarget = label;
      dragStartWorld = { x: world.x, y: world.y };
      dragOriginal = { x: label.x, y: label.y };
      render();
      return;
    }

    const door = Model.findDoorAt(world.x, world.y, threshold);
    if (door) {
      select({ type: 'door', id: door.id });
      isDragging = true;
      dragType = 'move-door';
      dragTarget = door;
      dragStartWorld = { x: world.x, y: world.y };
      dragOriginal = { position: door.position };
      render();
      return;
    }

    const win = Model.findWindowAt(world.x, world.y, threshold);
    if (win) {
      select({ type: 'window', id: win.id });
      isDragging = true;
      dragType = 'move-window';
      dragTarget = win;
      dragStartWorld = { x: world.x, y: world.y };
      dragOriginal = { position: win.position };
      render();
      return;
    }

    // Wall endpoints
    const ep = Model.findWallEndpointAt(world.x, world.y, threshold);
    if (ep) {
      select({ type: 'wall', id: ep.wall.id });
      isDragging = true;
      dragType = ep.endpoint === 1 ? 'move-endpoint1' : 'move-endpoint2';
      dragTarget = ep.wall;
      dragStartWorld = { x: world.x, y: world.y };
      dragOriginal = ep.endpoint === 1
        ? { x: ep.wall.x1, y: ep.wall.y1 }
        : { x: ep.wall.x2, y: ep.wall.y2 };
      render();
      return;
    }

    const wall = Model.findWallAt(world.x, world.y, threshold);
    if (wall) {
      select({ type: 'wall', id: wall.id });
      isDragging = true;
      dragType = 'move-wall';
      dragTarget = wall;
      dragStartWorld = { x: world.x, y: world.y };
      dragOriginal = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
      render();
      return;
    }

    // Check rooms
    const room = Model.getRoomAtPoint(world.x, world.y);
    if (room) {
      select({ type: 'room', key: room.key });
      render();
      return;
    }

    // Click on nothing -> deselect
    select(null);
    render();
  }

  function handleSelectMouseMove(world, e) {
    if (!isDragging) return;

    const dx = world.x - dragStartWorld.x;
    const dy = world.y - dragStartWorld.y;

    switch (dragType) {
      case 'move-wall': {
        const newX1 = dragOriginal.x1 + dx;
        const newY1 = dragOriginal.y1 + dy;
        const newX2 = dragOriginal.x2 + dx;
        const newY2 = dragOriginal.y2 + dy;
        Model.updateWall(dragTarget.id, { x1: newX1, y1: newY1, x2: newX2, y2: newY2 });
        break;
      }
      case 'move-endpoint1': {
        let nx = dragOriginal.x + dx;
        let ny = dragOriginal.y + dy;
        if (snapEnabled) {
          const s = snapPoint(nx, ny);
          nx = s.x; ny = s.y;
        }
        Model.updateWall(dragTarget.id, { x1: nx, y1: ny });
        break;
      }
      case 'move-endpoint2': {
        let nx = dragOriginal.x + dx;
        let ny = dragOriginal.y + dy;
        if (snapEnabled) {
          const s = snapPoint(nx, ny);
          nx = s.x; ny = s.y;
        }
        Model.updateWall(dragTarget.id, { x2: nx, y2: ny });
        break;
      }
      case 'move-label': {
        let nx = dragOriginal.x + dx;
        let ny = dragOriginal.y + dy;
        if (snapEnabled) {
          const s = Geometry.snapPointToGrid(nx, ny);
          nx = s.x; ny = s.y;
        }
        Model.updateLabel(dragTarget.id, { x: nx, y: ny });
        break;
      }
      case 'move-door': {
        const wall = Model.getWall(dragTarget.wallId);
        if (wall) {
          const cp = Geometry.closestPointOnSegment(wall.x1, wall.y1, wall.x2, wall.y2, world.x, world.y);
          Model.updateDoor(dragTarget.id, { position: Math.max(0.05, Math.min(0.95, cp.t)) });
        }
        break;
      }
      case 'move-window': {
        const wall = Model.getWall(dragTarget.wallId);
        if (wall) {
          const cp = Geometry.closestPointOnSegment(wall.x1, wall.y1, wall.x2, wall.y2, world.x, world.y);
          Model.updateWindow(dragTarget.id, { position: Math.max(0.05, Math.min(0.95, cp.t)) });
        }
        break;
      }
    }

    render();
  }

  // ========== Wall Tool ==========

  function handleWallClick(world, e) {
    const lastPoint = wallPoints.length > 0 ? wallPoints[wallPoints.length - 1] : null;
    const snapped = snapPoint(world.x, world.y, lastPoint);

    // Check if clicking on the start point to close the shape
    if (wallPoints.length >= 3) {
      const startDist = Geometry.dist(snapped.x, snapped.y, wallPoints[0].x, wallPoints[0].y);
      const threshold = CanvasRenderer.screenToWorldDist(Geometry.SNAP_THRESHOLD);
      if (startDist <= threshold) {
        // Close the polygon
        wallPoints.push({ x: wallPoints[0].x, y: wallPoints[0].y });
        finishWallChain(true);
        return;
      }
    }

    wallPoints.push({ x: snapped.x, y: snapped.y });
    CanvasRenderer.setWallDrawPoints([...wallPoints]);
    CanvasRenderer.setSnapIndicator(null);
    render();
  }

  function handleWallMouseMove(world, e) {
    if (wallPoints.length === 0) {
      // Just show snap indicator
      const snapped = snapPoint(world.x, world.y);
      CanvasRenderer.setSnapIndicator(snapped);
      render();
      return;
    }

    const lastPoint = wallPoints[wallPoints.length - 1];
    const snapped = snapPoint(world.x, world.y, lastPoint);

    CanvasRenderer.setGhostLine({
      x1: lastPoint.x, y1: lastPoint.y,
      x2: snapped.x, y2: snapped.y
    });

    render();
  }

  function finishWallChain(closed) {
    if (wallPoints.length < 2) {
      cancelCurrentAction();
      render();
      return;
    }

    History.push();

    // Create wall segments
    for (let i = 1; i < wallPoints.length; i++) {
      const p1 = wallPoints[i - 1];
      const p2 = wallPoints[i];
      // Avoid zero-length walls
      if (Geometry.dist(p1.x, p1.y, p2.x, p2.y) < 1) continue;
      Model.addWall(p1.x, p1.y, p2.x, p2.y);
    }

    wallPoints = [];
    wallPreviewEnd = null;
    CanvasRenderer.setGhostLine(null);
    CanvasRenderer.setWallDrawPoints([]);
    CanvasRenderer.setSnapIndicator(null);

    Storage.autoSave();
    notifyModelChange();
    render();
  }

  // ========== Door Tool ==========

  function handleDoorClick(world, e) {
    const threshold = CanvasRenderer.screenToWorldDist(15);
    const wall = Model.findWallAt(world.x, world.y, threshold);
    if (!wall) return;

    History.push();
    const cp = Geometry.closestPointOnSegment(wall.x1, wall.y1, wall.x2, wall.y2, world.x, world.y);
    Model.addDoor(wall.id, cp.t);
    CanvasRenderer.setHoverWall(null);
    Storage.autoSave();
    notifyModelChange();
    render();
  }

  // ========== Window Tool ==========

  function handleWindowClick(world, e) {
    const threshold = CanvasRenderer.screenToWorldDist(15);
    const wall = Model.findWallAt(world.x, world.y, threshold);
    if (!wall) return;

    History.push();
    const cp = Geometry.closestPointOnSegment(wall.x1, wall.y1, wall.x2, wall.y2, world.x, world.y);
    Model.addWindow(wall.id, cp.t);
    CanvasRenderer.setHoverWall(null);
    Storage.autoSave();
    notifyModelChange();
    render();
  }

  function handleDoorWindowHover(world) {
    const threshold = CanvasRenderer.screenToWorldDist(15);
    const wall = Model.findWallAt(world.x, world.y, threshold);
    CanvasRenderer.setHoverWall(wall ? wall.id : null);
    render();
  }

  // ========== Label Tool ==========

  function handleLabelClick(world, e, sx, sy) {
    const snapped = snapEnabled ? Geometry.snapPointToGrid(world.x, world.y) : { x: world.x, y: world.y };

    // Show inline text input
    startLabelCreation(snapped.x, snapped.y, sx, sy);
  }

  function startLabelCreation(wx, wy, sx, sy) {
    const overlay = document.createElement('div');
    overlay.className = 'label-input-overlay';
    overlay.style.left = sx + 'px';
    overlay.style.top = sy + 'px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter label...';
    input.value = '';
    overlay.appendChild(input);

    // Prevent clicks on the overlay from propagating to the canvas
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());

    const cont = container();
    cont.appendChild(overlay);

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (text) {
        History.push();
        Model.addLabel(wx, wy, text);
        Storage.autoSave();
        notifyModelChange();
      }
      overlay.remove();
      render();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { finished = true; overlay.remove(); render(); }
      e.stopPropagation();
    });

    // Defer blur listener so it doesn't fire during the initial click
    requestAnimationFrame(() => {
      input.addEventListener('blur', finish);
      input.focus();
    });
  }

  function startLabelEdit(label, sx, sy) {
    const sp = CanvasRenderer.worldToScreen(label.x, label.y);

    const overlay = document.createElement('div');
    overlay.className = 'label-input-overlay';
    overlay.style.left = sp.x + 'px';
    overlay.style.top = sp.y + 'px';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = label.text;
    overlay.appendChild(input);

    // Prevent clicks on the overlay from propagating to the canvas
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());

    const cont = container();
    cont.appendChild(overlay);

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (text) {
        History.push();
        Model.updateLabel(label.id, { text });
        Storage.autoSave();
        notifyModelChange();
      }
      overlay.remove();
      render();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { finished = true; overlay.remove(); render(); }
      e.stopPropagation();
    });

    // Defer blur listener so it doesn't fire during the initial click
    requestAnimationFrame(() => {
      input.addEventListener('blur', finish);
      input.focus();
      input.select();
    });
  }

  // ========== Delete ==========

  function deleteSelected() {
    const sel = CanvasRenderer.getSelection();
    if (!sel) return;

    History.push();

    switch (sel.type) {
      case 'wall': Model.removeWall(sel.id); break;
      case 'door': Model.removeDoor(sel.id); break;
      case 'window': Model.removeWindow(sel.id); break;
      case 'label': Model.removeLabel(sel.id); break;
    }

    select(null);
    Storage.autoSave();
    notifyModelChange();
    render();
  }

  return {
    init,
    setTool,
    getTool,
    setSnapEnabled,
    isSnapEnabled,
    onToolChange,
    onSelectionChange,
    onModelChange,
    cancelCurrentAction,
    deleteSelected,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onDblClick,
    onKeyDown,
    onKeyUp,
    select
  };
})();
