/**
 * canvas.js - Canvas rendering engine
 * Handles grid, zoom, pan, and drawing all plan elements.
 */

const CanvasRenderer = (() => {
  let canvas, ctx;
  let width = 0, height = 0;
  let dpr = 1;

  // View transform
  let offsetX = 0, offsetY = 0; // pan offset in screen pixels
  let zoom = 1.0;
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5.0;

  // Grid settings
  const MINOR_GRID = 10;  // 10 cm
  const MAJOR_GRID = 100; // 100 cm = 1 m

  // Selection state (set by tools)
  let selection = null; // { type: 'wall'|'door'|'window'|'label'|'room', id }
  let ghostLine = null; // { x1, y1, x2, y2 } for wall drawing preview
  let wallDrawPoints = []; // points being drawn for current wall chain
  let snapIndicator = null; // { x, y } to show snap point
  let hoverWall = null; // wall id being hovered (for door/window placement)

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    dpr = window.devicePixelRatio || 1;
    resize();
    // Center the view
    offsetX = width / 2;
    offsetY = height / 2;
  }

  function resize() {
    const container = canvas.parentElement;
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ========== Coordinate transforms ==========

  /** Screen pixel to world (cm) coordinates */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - offsetX) / zoom,
      y: (sy - offsetY) / zoom
    };
  }

  /** World (cm) to screen pixel coordinates */
  function worldToScreen(wx, wy) {
    return {
      x: wx * zoom + offsetX,
      y: wy * zoom + offsetY
    };
  }

  /** World distance to screen distance */
  function worldToScreenDist(d) {
    return d * zoom;
  }

  /** Screen distance to world distance */
  function screenToWorldDist(d) {
    return d / zoom;
  }

  // ========== View controls ==========

  function setZoom(newZoom, pivotX, pivotY) {
    const oldZoom = zoom;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    // Zoom around pivot point
    if (pivotX !== undefined) {
      offsetX = pivotX - (pivotX - offsetX) * (zoom / oldZoom);
      offsetY = pivotY - (pivotY - offsetY) * (zoom / oldZoom);
    }
  }

  function pan(dx, dy) {
    offsetX += dx;
    offsetY += dy;
  }

  function getZoom() { return zoom; }
  function getOffset() { return { x: offsetX, y: offsetY }; }

  function setSelection(sel) { selection = sel; }
  function getSelection() { return selection; }
  function setGhostLine(gl) { ghostLine = gl; }
  function setWallDrawPoints(pts) { wallDrawPoints = pts; }
  function setSnapIndicator(si) { snapIndicator = si; }
  function setHoverWall(wid) { hoverWall = wid; }

  // ========== Rendering ==========

  function render() {
    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);

    drawGrid();
    drawRooms();
    drawWalls();
    drawDoors();
    drawWindows();
    drawDimensions();
    drawOverallDimensions();
    drawLabels();
    drawGhost();
    drawSnapIndicator();
    drawSelection();

    ctx.restore();
  }

  function drawGrid() {
    ctx.save();

    // Determine visible world bounds
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(width, height);

    const minX = Math.floor(topLeft.x / MINOR_GRID) * MINOR_GRID;
    const maxX = Math.ceil(bottomRight.x / MINOR_GRID) * MINOR_GRID;
    const minY = Math.floor(topLeft.y / MINOR_GRID) * MINOR_GRID;
    const maxY = Math.ceil(bottomRight.y / MINOR_GRID) * MINOR_GRID;

    // Only draw minor grid if zoom is large enough to see them
    const screenGridSize = MINOR_GRID * zoom;

    if (screenGridSize >= 4) {
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = minX; x <= maxX; x += MINOR_GRID) {
        if (x % MAJOR_GRID === 0) continue; // skip major lines
        const sx = worldToScreen(x, 0).x;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
      }
      for (let y = minY; y <= maxY; y += MINOR_GRID) {
        if (y % MAJOR_GRID === 0) continue;
        const sy = worldToScreen(0, y).y;
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
      }
      ctx.stroke();
    }

    // Major grid
    const majorMinX = Math.floor(topLeft.x / MAJOR_GRID) * MAJOR_GRID;
    const majorMaxX = Math.ceil(bottomRight.x / MAJOR_GRID) * MAJOR_GRID;
    const majorMinY = Math.floor(topLeft.y / MAJOR_GRID) * MAJOR_GRID;
    const majorMaxY = Math.ceil(bottomRight.y / MAJOR_GRID) * MAJOR_GRID;

    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = majorMinX; x <= majorMaxX; x += MAJOR_GRID) {
      const sx = worldToScreen(x, 0).x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = majorMinY; y <= majorMaxY; y += MAJOR_GRID) {
      const sy = worldToScreen(0, y).y;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // Origin indicator
    const origin = worldToScreen(0, 0);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.x - 10, origin.y);
    ctx.lineTo(origin.x + 10, origin.y);
    ctx.moveTo(origin.x, origin.y - 10);
    ctx.lineTo(origin.x, origin.y + 10);
    ctx.stroke();

    ctx.restore();
  }

  function drawRooms() {
    ctx.save();
    for (const room of Model.rooms) {
      if (!room.polygon || room.polygon.length < 3) continue;
      ctx.fillStyle = room.color || '#E3F2FD';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      const first = worldToScreen(room.polygon[0].x, room.polygon[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < room.polygon.length; i++) {
        const p = worldToScreen(room.polygon[i].x, room.polygon[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Room label & area
      const centroid = Geometry.polygonCentroid(room.polygon);
      const sc = worldToScreen(centroid.x, centroid.y);
      const areaSqM = room.area / 10000; // cm² to m²
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (room.label) {
        ctx.font = 'bold 13px ' + getComputedStyle(document.body).fontFamily;
        ctx.fillText(room.label, sc.x, sc.y - 8);
        ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
        ctx.fillText(areaSqM.toFixed(1) + ' m\u00B2', sc.x, sc.y + 8);
      } else {
        ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
        ctx.fillText(areaSqM.toFixed(1) + ' m\u00B2', sc.x, sc.y);
      }
    }
    ctx.restore();
  }

  function drawWalls() {
    ctx.save();
    for (const wall of Model.walls) {
      const s1 = worldToScreen(wall.x1, wall.y1);
      const s2 = worldToScreen(wall.x2, wall.y2);
      const screenThickness = Math.max(2, worldToScreenDist(wall.thickness));

      const isSelected = selection && selection.type === 'wall' && selection.id === wall.id;
      const isHovered = hoverWall === wall.id;

      ctx.strokeStyle = isSelected ? '#2196F3' : (isHovered ? '#64B5F6' : wall.color);
      ctx.lineWidth = screenThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();

      // Draw endpoints
      const epRadius = Math.max(3, screenThickness / 2 + 1);
      ctx.fillStyle = isSelected ? '#1976D2' : wall.color;
      ctx.beginPath();
      ctx.arc(s1.x, s1.y, epRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s2.x, s2.y, epRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDoors() {
    ctx.save();
    for (const door of Model.doors) {
      const wall = Model.getWall(door.wallId);
      if (!wall) continue;

      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.sqrt(dx * dx + dy * dy);
      if (wallLen === 0) continue;

      // Door center in world
      const cx = wall.x1 + dx * door.position;
      const cy = wall.y1 + dy * door.position;

      // Door half-width in world
      const hw = door.width / 2;
      const ux = dx / wallLen; // unit vector along wall
      const uy = dy / wallLen;
      const nx = -uy; // normal
      const ny = ux;

      const isSelected = selection && selection.type === 'door' && selection.id === door.id;

      // Draw gap (clear the wall behind the door)
      const p1 = worldToScreen(cx - ux * hw, cy - uy * hw);
      const p2 = worldToScreen(cx + ux * hw, cy + uy * hw);
      const screenThickness = Math.max(2, worldToScreenDist(wall.thickness)) + 4;

      ctx.strokeStyle = '#fafafa'; // background color
      ctx.lineWidth = screenThickness;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Draw door lines and arc
      const sCenter = worldToScreen(cx, cy);
      const screenWidth = worldToScreenDist(door.width);
      const wallAngle = Math.atan2(dy, dx);

      ctx.strokeStyle = isSelected ? '#2196F3' : '#8B4513';
      ctx.lineWidth = 2;

      // Door hinge point and swing
      const dir = door.openDirection === 'left' ? 1 : -1;
      const hingeX = cx - ux * hw;
      const hingeY = cy - uy * hw;
      const sHinge = worldToScreen(hingeX, hingeY);

      // Door panel line (from hinge, perpendicular)
      const panelEndX = hingeX + nx * door.width * dir;
      const panelEndY = hingeY + ny * door.width * dir;
      const sPanelEnd = worldToScreen(panelEndX, panelEndY);

      ctx.beginPath();
      ctx.moveTo(sHinge.x, sHinge.y);
      ctx.lineTo(sPanelEnd.x, sPanelEnd.y);
      ctx.stroke();

      // Arc
      const arcStart = wallAngle + (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      const arcEnd = wallAngle + (dir > 0 ? 0 : Math.PI);
      ctx.beginPath();
      ctx.arc(sHinge.x, sHinge.y, screenWidth, 
        dir > 0 ? Math.min(arcStart, arcEnd) : Math.min(arcStart, arcEnd),
        dir > 0 ? Math.max(arcStart, arcEnd) : Math.max(arcStart, arcEnd));
      ctx.stroke();

      // Small squares at door posts
      const post1 = worldToScreen(cx - ux * hw, cy - uy * hw);
      const post2 = worldToScreen(cx + ux * hw, cy + uy * hw);
      ctx.fillStyle = isSelected ? '#2196F3' : '#8B4513';
      ctx.fillRect(post1.x - 3, post1.y - 3, 6, 6);
      ctx.fillRect(post2.x - 3, post2.y - 3, 6, 6);
    }
    ctx.restore();
  }

  function drawWindows() {
    ctx.save();
    for (const win of Model.windows) {
      const wall = Model.getWall(win.wallId);
      if (!wall) continue;

      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.sqrt(dx * dx + dy * dy);
      if (wallLen === 0) continue;

      const cx = wall.x1 + dx * win.position;
      const cy = wall.y1 + dy * win.position;
      const hw = win.width / 2;
      const ux = dx / wallLen;
      const uy = dy / wallLen;
      const nx = -uy;
      const ny = ux;

      const isSelected = selection && selection.type === 'window' && selection.id === win.id;

      // Clear wall behind window
      const p1 = worldToScreen(cx - ux * hw, cy - uy * hw);
      const p2 = worldToScreen(cx + ux * hw, cy + uy * hw);
      const screenThickness = Math.max(2, worldToScreenDist(wall.thickness)) + 4;

      ctx.strokeStyle = '#fafafa';
      ctx.lineWidth = screenThickness;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Draw window: two parallel lines with a line in middle
      const halfThick = wall.thickness / 2;
      const color = isSelected ? '#2196F3' : '#4FC3F7';

      for (const sign of [-1, 0, 1]) {
        const ox = nx * halfThick * sign * 0.7;
        const oy = ny * halfThick * sign * 0.7;
        const wp1 = worldToScreen(cx - ux * hw + ox, cy - uy * hw + oy);
        const wp2 = worldToScreen(cx + ux * hw + ox, cy + uy * hw + oy);

        ctx.strokeStyle = color;
        ctx.lineWidth = sign === 0 ? 1.5 : 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(wp1.x, wp1.y);
        ctx.lineTo(wp2.x, wp2.y);
        ctx.stroke();
      }

      // End caps
      const t = halfThick * 0.7;
      for (const s of [-1, 1]) {
        const bx = cx + ux * hw * s;
        const by = cy + uy * hw * s;
        const ep1 = worldToScreen(bx + nx * t, by + ny * t);
        const ep2 = worldToScreen(bx - nx * t, by - ny * t);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ep1.x, ep1.y);
        ctx.lineTo(ep2.x, ep2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDimensions() {
    ctx.save();
    const font = getComputedStyle(document.body).fontFamily;
    ctx.font = '11px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const wall of Model.walls) {
      const len = Geometry.segmentLength(wall.x1, wall.y1, wall.x2, wall.y2);
      if (len < 1) continue;

      const mid = Geometry.midpoint(wall.x1, wall.y1, wall.x2, wall.y2);
      const normal = Geometry.segmentNormal(wall.x1, wall.y1, wall.x2, wall.y2);

      // Offset the dimension text away from the wall
      const offsetDist = wall.thickness / 2 + 15;
      const tx = mid.x + normal.x * offsetDist;
      const ty = mid.y + normal.y * offsetDist;
      const st = worldToScreen(tx, ty);

      const meters = len / 100;
      const text = meters.toFixed(2) + ' m';

      // Background for readability
      const metrics = ctx.measureText(text);
      const tw = metrics.width + 6;
      const th = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(st.x - tw / 2, st.y - th / 2, tw, th);

      ctx.fillStyle = '#666';
      ctx.fillText(text, st.x, st.y);

      // Tick marks at endpoints
      const s1 = worldToScreen(wall.x1, wall.y1);
      const s2 = worldToScreen(wall.x2, wall.y2);
      const sn = { x: normal.x, y: normal.y };

      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.8;
      for (const sp of [s1, s2]) {
        const tickLen = 6;
        ctx.beginPath();
        ctx.moveTo(sp.x + sn.x * (worldToScreenDist(offsetDist) - tickLen),
                    sp.y + sn.y * (worldToScreenDist(offsetDist) - tickLen));
        ctx.lineTo(sp.x + sn.x * (worldToScreenDist(offsetDist) + tickLen),
                    sp.y + sn.y * (worldToScreenDist(offsetDist) + tickLen));
        ctx.stroke();
      }

      // Dimension line
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      const dl1x = wall.x1 + normal.x * offsetDist;
      const dl1y = wall.y1 + normal.y * offsetDist;
      const dl2x = wall.x2 + normal.x * offsetDist;
      const dl2y = wall.y2 + normal.y * offsetDist;
      const sdl1 = worldToScreen(dl1x, dl1y);
      const sdl2 = worldToScreen(dl2x, dl2y);
      ctx.beginPath();
      ctx.moveTo(sdl1.x, sdl1.y);
      ctx.lineTo(sdl2.x, sdl2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawOverallDimensions() {
    const walls = Model.walls;
    if (walls.length === 0) return;

    // Compute bounding box of all wall endpoints
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      if (w.x1 < minX) minX = w.x1;
      if (w.x2 < minX) minX = w.x2;
      if (w.y1 < minY) minY = w.y1;
      if (w.y2 < minY) minY = w.y2;
      if (w.x1 > maxX) maxX = w.x1;
      if (w.x2 > maxX) maxX = w.x2;
      if (w.y1 > maxY) maxY = w.y1;
      if (w.y2 > maxY) maxY = w.y2;
    }

    const planW = maxX - minX;
    const planH = maxY - minY;
    if (planW < 1 && planH < 1) return;

    ctx.save();
    const font = getComputedStyle(document.body).fontFamily;

    // Offset from the plan edge (in world units)
    const offset = 60;    // distance from plan edge to dimension line
    const extLen = 10;    // extension line overshoot past dimension line
    const tickSize = 4;   // half-length of the 45-degree tick mark (screen px)

    const dimColor = '#333';
    const lineColor = '#666';
    const extColor = '#999';

    // ── Horizontal dimension (below the plan) ──
    if (planW >= 1) {
      const yPos = maxY + offset; // world Y for the dimension line

      // Extension lines (vertical, from plan edge down to dimension line + overshoot)
      const sExtTop1 = worldToScreen(minX, maxY + 10);
      const sExtBot1 = worldToScreen(minX, yPos + extLen);
      const sExtTop2 = worldToScreen(maxX, maxY + 10);
      const sExtBot2 = worldToScreen(maxX, yPos + extLen);

      ctx.strokeStyle = extColor;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sExtTop1.x, sExtTop1.y);
      ctx.lineTo(sExtBot1.x, sExtBot1.y);
      ctx.moveTo(sExtTop2.x, sExtTop2.y);
      ctx.lineTo(sExtBot2.x, sExtBot2.y);
      ctx.stroke();

      // Dimension line (solid)
      const sDL1 = worldToScreen(minX, yPos);
      const sDL2 = worldToScreen(maxX, yPos);

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sDL1.x, sDL1.y);
      ctx.lineTo(sDL2.x, sDL2.y);
      ctx.stroke();

      // Tick marks at endpoints (45-degree architectural serifs)
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 1.5;
      for (const sp of [sDL1, sDL2]) {
        ctx.beginPath();
        ctx.moveTo(sp.x - tickSize, sp.y + tickSize);
        ctx.lineTo(sp.x + tickSize, sp.y - tickSize);
        ctx.stroke();
      }

      // Label
      const meters = planW / 100;
      const text = meters.toFixed(2) + ' m';
      ctx.font = 'bold 11px ' + font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dimColor;
      const midX = (sDL1.x + sDL2.x) / 2;
      const midY = sDL1.y;

      // Background
      const metrics = ctx.measureText(text);
      const tw = metrics.width + 8;
      const th = 15;
      ctx.fillStyle = 'rgba(250,250,250,0.9)';
      ctx.fillRect(midX - tw / 2, midY + 3, tw, th);
      ctx.fillStyle = dimColor;
      ctx.fillText(text, midX, midY + 5);
    }

    // ── Vertical dimension (to the right of the plan) ──
    if (planH >= 1) {
      const xPos = maxX + offset; // world X for the dimension line

      // Extension lines (horizontal, from plan edge right to dimension line + overshoot)
      const sExtLeft1 = worldToScreen(maxX + 10, minY);
      const sExtRight1 = worldToScreen(xPos + extLen, minY);
      const sExtLeft2 = worldToScreen(maxX + 10, maxY);
      const sExtRight2 = worldToScreen(xPos + extLen, maxY);

      ctx.strokeStyle = extColor;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sExtLeft1.x, sExtLeft1.y);
      ctx.lineTo(sExtRight1.x, sExtRight1.y);
      ctx.moveTo(sExtLeft2.x, sExtLeft2.y);
      ctx.lineTo(sExtRight2.x, sExtRight2.y);
      ctx.stroke();

      // Dimension line (solid)
      const sDL1 = worldToScreen(xPos, minY);
      const sDL2 = worldToScreen(xPos, maxY);

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sDL1.x, sDL1.y);
      ctx.lineTo(sDL2.x, sDL2.y);
      ctx.stroke();

      // Tick marks at endpoints (45-degree architectural serifs)
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 1.5;
      for (const sp of [sDL1, sDL2]) {
        ctx.beginPath();
        ctx.moveTo(sp.x - tickSize, sp.y + tickSize);
        ctx.lineTo(sp.x + tickSize, sp.y - tickSize);
        ctx.stroke();
      }

      // Label (rotated 90 degrees)
      const meters = planH / 100;
      const text = meters.toFixed(2) + ' m';
      ctx.font = 'bold 11px ' + font;
      const midSX = sDL1.x;
      const midSY = (sDL1.y + sDL2.y) / 2;

      // Background (rotated)
      const metrics = ctx.measureText(text);
      const tw = metrics.width + 8;
      const th = 15;
      ctx.save();
      ctx.translate(midSX, midSY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(250,250,250,0.9)';
      ctx.fillRect(-tw / 2, 3, tw, th);
      ctx.fillStyle = dimColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(text, 0, 5);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawLabels() {
    ctx.save();
    const font = getComputedStyle(document.body).fontFamily;
    for (const label of Model.labels) {
      const sp = worldToScreen(label.x, label.y);
      const isSelected = selection && selection.type === 'label' && selection.id === label.id;

      ctx.font = `${label.fontSize}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Background
      const metrics = ctx.measureText(label.text);
      const tw = metrics.width + 10;
      const th = label.fontSize + 8;

      if (isSelected) {
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(sp.x - tw / 2, sp.y - th / 2, tw, th);
        ctx.setLineDash([]);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(sp.x - tw / 2, sp.y - th / 2, tw, th);

      ctx.fillStyle = label.color || '#333';
      ctx.fillText(label.text, sp.x, sp.y);
    }
    ctx.restore();
  }

  function drawGhost() {
    ctx.save();

    // Draw completed wall chain points
    if (wallDrawPoints.length > 0) {
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (let i = 0; i < wallDrawPoints.length; i++) {
        const sp = worldToScreen(wallDrawPoints[i].x, wallDrawPoints[i].y);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw points
      for (const pt of wallDrawPoints) {
        const sp = worldToScreen(pt.x, pt.y);
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw dimensions along the chain
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#2196F3';
      for (let i = 1; i < wallDrawPoints.length; i++) {
        const p1 = wallDrawPoints[i - 1];
        const p2 = wallDrawPoints[i];
        const mid = Geometry.midpoint(p1.x, p1.y, p2.x, p2.y);
        const sm = worldToScreen(mid.x, mid.y);
        const len = Geometry.segmentLength(p1.x, p1.y, p2.x, p2.y);
        ctx.fillText((len / 100).toFixed(2) + ' m', sm.x, sm.y - 8);
      }
    }

    // Ghost line from last point to cursor
    if (ghostLine) {
      const s1 = worldToScreen(ghostLine.x1, ghostLine.y1);
      const s2 = worldToScreen(ghostLine.x2, ghostLine.y2);

      ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dimension on ghost
      const mid = Geometry.midpoint(ghostLine.x1, ghostLine.y1, ghostLine.x2, ghostLine.y2);
      const sm = worldToScreen(mid.x, mid.y);
      const len = Geometry.segmentLength(ghostLine.x1, ghostLine.y1, ghostLine.x2, ghostLine.y2);
      if (len > 1) {
        ctx.font = 'bold 12px ' + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#2196F3';
        ctx.fillText((len / 100).toFixed(2) + ' m', sm.x, sm.y - 10);
      }
    }

    ctx.restore();
  }

  function drawSnapIndicator() {
    if (!snapIndicator) return;
    ctx.save();
    const sp = worldToScreen(snapIndicator.x, snapIndicator.y);
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 1.5;

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(sp.x - 8, sp.y);
    ctx.lineTo(sp.x + 8, sp.y);
    ctx.moveTo(sp.x, sp.y - 8);
    ctx.lineTo(sp.x, sp.y + 8);
    ctx.stroke();

    // Circle
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawSelection() {
    if (!selection) return;
    ctx.save();

    if (selection.type === 'wall') {
      const wall = Model.getWall(selection.id);
      if (wall) {
        // Draw selection handles at endpoints
        const s1 = worldToScreen(wall.x1, wall.y1);
        const s2 = worldToScreen(wall.x2, wall.y2);
        for (const sp of [s1, s2]) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#2196F3';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  /** Export the current view as a data URL (PNG) */
  function fitToView() {
    const walls = Model.walls;
    const labels = Model.labels;

    if (walls.length === 0 && labels.length === 0) {
      // No objects — reset to default view
      zoom = 1.0;
      offsetX = width / 2;
      offsetY = height / 2;
      render();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const w of walls) {
      minX = Math.min(minX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxX = Math.max(maxX, w.x1, w.x2);
      maxY = Math.max(maxY, w.y1, w.y2);
    }

    for (const l of labels) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x);
      maxY = Math.max(maxY, l.y);
    }

    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const pad = 60; // screen-space padding in pixels

    if (bboxW === 0 && bboxH === 0) {
      // Single point — center on it at zoom 1
      zoom = 1.0;
      offsetX = width / 2 - centerX * zoom;
      offsetY = height / 2 - centerY * zoom;
      render();
      return;
    }

    const availW = width - 2 * pad;
    const availH = height - 2 * pad;

    zoom = Math.min(availW / bboxW, availH / bboxH);
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    offsetX = width / 2 - centerX * zoom;
    offsetY = height / 2 - centerY * zoom;

    render();
  }

  function exportPNG() {
    // Render at current view
    render();
    return canvas.toDataURL('image/png');
  }

  return {
    init,
    resize,
    render,
    screenToWorld,
    worldToScreen,
    worldToScreenDist,
    screenToWorldDist,
    setZoom,
    pan,
    getZoom,
    getOffset,
    setSelection,
    getSelection,
    setGhostLine,
    setWallDrawPoints,
    setSnapIndicator,
    setHoverWall,
    fitToView,
    exportPNG,
    get canvas() { return canvas; },
    get width() { return width; },
    get height() { return height; }
  };
})();
