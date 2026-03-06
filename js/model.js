/**
 * model.js - Data model for the room planner
 * Manages walls, doors, windows, labels, and auto-detected rooms.
 */

const Model = (() => {
  let _nextId = 1;

  // State
  let walls = [];
  let doors = [];
  let windows = [];
  let labels = [];
  let rooms = [];  // auto-detected, not saved directly
  let roomMeta = {}; // { roomKey: { color, label } } - saved

  // Default colors for rooms (light theme)
  const ROOM_COLORS = [
    '#E3F2FD', // light blue
    '#E8F5E9', // light green
    '#FFF3E0', // light orange
    '#F3E5F5', // light purple
    '#FFF9C4', // light yellow
    '#E0F7FA', // light cyan
    '#FCE4EC', // light pink
    '#F1F8E9', // light lime
    '#EDE7F6', // light deep purple
    '#E0F2F1', // light teal
  ];

  // Dark theme room colors (deeper/muted variants)
  const ROOM_COLORS_DARK = [
    '#1a3a5c', // deep blue
    '#1a3c1e', // deep green
    '#4a3520', // deep orange
    '#3a1e4a', // deep purple
    '#4a4520', // deep yellow
    '#1a3a40', // deep cyan
    '#4a1e2a', // deep pink
    '#2a3c1a', // deep lime
    '#2a1e4a', // deep deep purple
    '#1a3a35', // deep teal
  ];

  function generateId() {
    return _nextId++;
  }

  /** Create a new wall */
  function addWall(x1, y1, x2, y2, thickness = 20, color = '#444444') {
    const wall = {
      id: generateId(),
      x1, y1, x2, y2,
      thickness,
      color
    };
    walls.push(wall);
    recalcRooms();
    return wall;
  }

  /** Remove a wall by id */
  function removeWall(id) {
    // Also remove any doors/windows on this wall
    doors = doors.filter(d => d.wallId !== id);
    windows = windows.filter(w => w.wallId !== id);
    walls = walls.filter(w => w.id !== id);
    recalcRooms();
  }

  /** Update wall properties */
  function updateWall(id, props) {
    const wall = walls.find(w => w.id === id);
    if (wall) {
      Object.assign(wall, props);
      recalcRooms();
    }
    return wall;
  }

  /** Find wall by id */
  function getWall(id) {
    return walls.find(w => w.id === id);
  }

  /** Place a door on a wall */
  function addDoor(wallId, position = 0.5, width = 80, openDirection = 'left') {
    const door = {
      id: generateId(),
      wallId,
      position: Math.max(0.05, Math.min(0.95, position)),
      width,
      openDirection
    };
    doors.push(door);
    return door;
  }

  /** Remove a door */
  function removeDoor(id) {
    doors = doors.filter(d => d.id !== id);
  }

  /** Update door properties */
  function updateDoor(id, props) {
    const door = doors.find(d => d.id === id);
    if (door) Object.assign(door, props);
    return door;
  }

  function getDoor(id) {
    return doors.find(d => d.id === id);
  }

  /** Place a window on a wall */
  function addWindow(wallId, position = 0.5, width = 100) {
    const win = {
      id: generateId(),
      wallId,
      position: Math.max(0.05, Math.min(0.95, position)),
      width
    };
    windows.push(win);
    return win;
  }

  /** Remove a window */
  function removeWindow(id) {
    windows = windows.filter(w => w.id !== id);
  }

  /** Update window properties */
  function updateWindow(id, props) {
    const win = windows.find(w => w.id === id);
    if (win) Object.assign(win, props);
    return win;
  }

  function getWindow(id) {
    return windows.find(w => w.id === id);
  }

  /** Add a text label */
  function addLabel(x, y, text = 'Label', fontSize = 14) {
    const label = {
      id: generateId(),
      x, y,
      text,
      fontSize,
      color: '#333333'
    };
    labels.push(label);
    return label;
  }

  /** Remove a label */
  function removeLabel(id) {
    labels = labels.filter(l => l.id !== id);
  }

  /** Update label properties */
  function updateLabel(id, props) {
    const label = labels.find(l => l.id === id);
    if (label) Object.assign(label, props);
    return label;
  }

  function getLabel(id) {
    return labels.find(l => l.id === id);
  }

  /** Recalculate rooms from walls */
  function recalcRooms() {
    const detected = Geometry.detectRooms(walls);
    rooms = detected.map((r, i) => {
      // Create a stable key from sorted wall IDs (entity .id values, not array indices)
      const key = r.wallIds.slice().sort((a, b) => a - b).join(',');
      const meta = roomMeta[key] || {
        color: ROOM_COLORS[i % ROOM_COLORS.length],
        label: ''
      };
      // Store back so it persists
      roomMeta[key] = meta;
      return {
        wallIds: r.wallIds,
        polygon: r.polygon,
        area: r.area,
        key,
        color: meta.color,
        label: meta.label
      };
    });
    // Clean up stale roomMeta entries for rooms that no longer exist
    const activeKeys = new Set(rooms.map(r => r.key));
    for (const key of Object.keys(roomMeta)) {
      if (!activeKeys.has(key)) {
        delete roomMeta[key];
      }
    }
  }

  /** Update room metadata */
  function updateRoomMeta(key, props) {
    if (!roomMeta[key]) roomMeta[key] = {};
    Object.assign(roomMeta[key], props);
    // Also update the room in the rooms array
    const room = rooms.find(r => r.key === key);
    if (room) Object.assign(room, props);
  }

  function getRoomAtPoint(x, y) {
    for (const room of rooms) {
      if (Geometry.pointInPolygon(x, y, room.polygon)) {
        return room;
      }
    }
    return null;
  }

  /** Get full state as serializable object */
  function getState() {
    return {
      walls: walls.map(w => ({ ...w })),
      doors: doors.map(d => ({ ...d })),
      windows: windows.map(w => ({ ...w })),
      labels: labels.map(l => ({ ...l })),
      roomMeta: { ...roomMeta },
      nextId: _nextId
    };
  }

  /** Restore state from a serialized object */
  function setState(state) {
    walls = (state.walls || []).map(w => ({ ...w }));
    doors = (state.doors || []).map(d => ({ ...d }));
    windows = (state.windows || []).map(w => ({ ...w }));
    labels = (state.labels || []).map(l => ({ ...l }));
    roomMeta = state.roomMeta || {};
    _nextId = state.nextId ?? 1;
    // Ensure _nextId exceeds all existing entity IDs to prevent collisions
    const maxId = Math.max(
      0,
      ...walls.map(w => w.id),
      ...doors.map(d => d.id),
      ...windows.map(w => w.id),
      ...labels.map(l => l.id)
    );
    if (_nextId <= maxId) {
      _nextId = maxId + 1;
    }
    recalcRooms();
  }

  /** Clear everything */
  function clear() {
    walls = [];
    doors = [];
    windows = [];
    labels = [];
    rooms = [];
    roomMeta = {};
    _nextId = 1;
  }

  /** Find wall nearest to a point, within threshold (world units) */
  function findWallAt(px, py, threshold) {
    let best = null;
    let bestDist = threshold;
    for (const w of walls) {
      const d = Geometry.distToSegment(w.x1, w.y1, w.x2, w.y2, px, py);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    return best;
  }

  /** Find a wall endpoint near a point */
  function findWallEndpointAt(px, py, threshold) {
    for (const w of walls) {
      if (Geometry.dist(w.x1, w.y1, px, py) <= threshold) {
        return { wall: w, endpoint: 1 }; // start
      }
      if (Geometry.dist(w.x2, w.y2, px, py) <= threshold) {
        return { wall: w, endpoint: 2 }; // end
      }
    }
    return null;
  }

  /** Find door/window near a point */
  function findDoorAt(px, py, threshold) {
    for (const door of doors) {
      const wall = getWall(door.wallId);
      if (!wall) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const cx = wall.x1 + dx * door.position;
      const cy = wall.y1 + dy * door.position;
      if (Geometry.dist(cx, cy, px, py) <= threshold + door.width / 2) {
        return door;
      }
    }
    return null;
  }

  function findWindowAt(px, py, threshold) {
    for (const win of windows) {
      const wall = getWall(win.wallId);
      if (!wall) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const cx = wall.x1 + dx * win.position;
      const cy = wall.y1 + dy * win.position;
      if (Geometry.dist(cx, cy, px, py) <= threshold + win.width / 2) {
        return win;
      }
    }
    return null;
  }

  function findLabelAt(px, py, threshold) {
    for (const label of labels) {
      if (Geometry.dist(label.x, label.y, px, py) <= threshold) {
        return label;
      }
    }
    return null;
  }

  /** Snap a point to existing wall endpoints */
  function snapToExistingPoint(px, py, thresholdWorld, excludeWallId = null) {
    let best = null;
    let bestDist = thresholdWorld;
    for (const w of walls) {
      if (w.id === excludeWallId) continue;
      const d1 = Geometry.dist(w.x1, w.y1, px, py);
      if (d1 < bestDist) {
        bestDist = d1;
        best = { x: w.x1, y: w.y1 };
      }
      const d2 = Geometry.dist(w.x2, w.y2, px, py);
      if (d2 < bestDist) {
        bestDist = d2;
        best = { x: w.x2, y: w.y2 };
      }
    }
    return best;
  }

  return {
    get walls() { return walls; },
    get doors() { return doors; },
    get windows() { return windows; },
    get labels() { return labels; },
    get rooms() { return rooms; },
    ROOM_COLORS,
    ROOM_COLORS_DARK,
    addWall,
    removeWall,
    updateWall,
    getWall,
    addDoor,
    removeDoor,
    updateDoor,
    getDoor,
    addWindow,
    removeWindow,
    updateWindow,
    getWindow,
    addLabel,
    removeLabel,
    updateLabel,
    getLabel,
    updateRoomMeta,
    getRoomAtPoint,
    getState,
    setState,
    clear,
    findWallAt,
    findWallEndpointAt,
    findDoorAt,
    findWindowAt,
    findLabelAt,
    snapToExistingPoint,
    recalcRooms
  };
})();
