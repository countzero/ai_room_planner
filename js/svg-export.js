/**
 * svg-export.js - SVG export for the room planner
 * Generates a resolution-independent SVG from the current plan data.
 * Works in world coordinates (cm) with viewBox mapping.
 */

const SvgExport = (() => {
  'use strict';

  // Grid settings (must match canvas.js)
  const MINOR_GRID = 10;   // 10 cm
  const MAJOR_GRID = 100;  // 100 cm = 1 m

  // Padding around content in world cm
  const PADDING = 100;

  // Decorative stroke widths in world cm
  const STROKE_THIN = 1.5;   // door lines, window lines, tick marks
  const STROKE_MEDIUM = 2;   // window end caps, door panel
  const STROKE_DIM_LINE = 0.5;
  const STROKE_DIM_TICK = 0.8;

  // ========== Helpers ==========

  function escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Compute axis-aligned bounding box of all plan content (world cm). */
  function computeBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    function expand(x, y) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // Walls (endpoints + thickness)
    for (const wall of Model.walls) {
      const ht = wall.thickness / 2;
      expand(wall.x1 - ht, wall.y1 - ht);
      expand(wall.x1 + ht, wall.y1 + ht);
      expand(wall.x2 - ht, wall.y2 - ht);
      expand(wall.x2 + ht, wall.y2 + ht);
    }

    // Doors (swing arc extends perpendicular to wall)
    for (const door of Model.doors) {
      const wall = Model.getWall(door.wallId);
      if (!wall) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.sqrt(dx * dx + dy * dy);
      if (wallLen === 0) continue;
      const cx = wall.x1 + dx * door.position;
      const cy = wall.y1 + dy * door.position;
      const nx = -dy / wallLen;
      const ny = dx / wallLen;
      // Arc extends door.width in normal direction
      expand(cx + nx * door.width, cy + ny * door.width);
      expand(cx - nx * door.width, cy - ny * door.width);
    }

    // Room polygons
    for (const room of Model.rooms) {
      if (!room.polygon) continue;
      for (const p of room.polygon) {
        expand(p.x, p.y);
      }
    }

    // Labels (approximate text extents)
    for (const label of Model.labels) {
      const estimatedHalfW = label.fontSize * 0.35 * label.text.length;
      const estimatedHalfH = label.fontSize * 0.6;
      expand(label.x - estimatedHalfW, label.y - estimatedHalfH);
      expand(label.x + estimatedHalfW, label.y + estimatedHalfH);
    }

    // Dimension lines (offset from wall midpoints)
    for (const wall of Model.walls) {
      const normal = Geometry.segmentNormal(wall.x1, wall.y1, wall.x2, wall.y2);
      const offsetDist = wall.thickness / 2 + 15;
      const mid = Geometry.midpoint(wall.x1, wall.y1, wall.x2, wall.y2);
      expand(mid.x + normal.x * (offsetDist + 20), mid.y + normal.y * (offsetDist + 20));
    }

    // If nothing exists, default to a small area around origin
    if (minX === Infinity) {
      minX = -200; minY = -200;
      maxX = 200; maxY = 200;
    }

    return {
      minX: minX - PADDING,
      minY: minY - PADDING,
      maxX: maxX + PADDING,
      maxY: maxY + PADDING
    };
  }

  /**
   * For a given wall, collect all doors and windows and return the wall
   * as a list of parametric segments [t0, t1] where the wall should be drawn.
   * Gaps are cut for doors and windows.
   */
  function computeWallSegments(wall) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return [[0, 1]];

    // Collect gaps (parametric ranges to cut)
    const gaps = [];

    for (const door of Model.doors) {
      if (door.wallId !== wall.id) continue;
      const halfParam = (door.width / 2) / wallLen;
      gaps.push([door.position - halfParam, door.position + halfParam]);
    }

    for (const win of Model.windows) {
      if (win.wallId !== wall.id) continue;
      const halfParam = (win.width / 2) / wallLen;
      gaps.push([win.position - halfParam, win.position + halfParam]);
    }

    if (gaps.length === 0) return [[0, 1]];

    // Sort gaps by start and merge overlapping ones
    gaps.sort((a, b) => a[0] - b[0]);
    const merged = [gaps[0]];
    for (let i = 1; i < gaps.length; i++) {
      const last = merged[merged.length - 1];
      if (gaps[i][0] <= last[1]) {
        last[1] = Math.max(last[1], gaps[i][1]);
      } else {
        merged.push(gaps[i]);
      }
    }

    // Compute complementary segments
    const segments = [];
    let cursor = 0;
    for (const [gStart, gEnd] of merged) {
      const s = Math.max(0, gStart);
      const e = Math.min(1, gEnd);
      if (cursor < s) {
        segments.push([cursor, s]);
      }
      cursor = e;
    }
    if (cursor < 1) {
      segments.push([cursor, 1]);
    }

    return segments;
  }

  /**
   * Compute a dynamic scale factor for font sizes and decorative strokes.
   * This ensures text is readable regardless of plan size.
   */
  function computeScaleFactor(bounds) {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const maxDim = Math.max(w, h);
    // Target: at a "reference" plan size of ~1000cm (10m), scale = 1
    return Math.max(0.5, maxDim / 1000);
  }

  // ========== SVG Element Generators ==========

  function svgGrid(bounds) {
    const lines = [];

    const minX = Math.floor(bounds.minX / MINOR_GRID) * MINOR_GRID;
    const maxX = Math.ceil(bounds.maxX / MINOR_GRID) * MINOR_GRID;
    const minY = Math.floor(bounds.minY / MINOR_GRID) * MINOR_GRID;
    const maxY = Math.ceil(bounds.maxY / MINOR_GRID) * MINOR_GRID;

    // Minor grid
    lines.push('  <g id="grid-minor" stroke="#e8e8e8" stroke-width="0.5">');
    for (let x = minX; x <= maxX; x += MINOR_GRID) {
      if (x % MAJOR_GRID === 0) continue;
      lines.push(`    <line x1="${x}" y1="${bounds.minY}" x2="${x}" y2="${bounds.maxY}"/>`);
    }
    for (let y = minY; y <= maxY; y += MINOR_GRID) {
      if (y % MAJOR_GRID === 0) continue;
      lines.push(`    <line x1="${bounds.minX}" y1="${y}" x2="${bounds.maxX}" y2="${y}"/>`);
    }
    lines.push('  </g>');

    // Major grid
    const majorMinX = Math.floor(bounds.minX / MAJOR_GRID) * MAJOR_GRID;
    const majorMaxX = Math.ceil(bounds.maxX / MAJOR_GRID) * MAJOR_GRID;
    const majorMinY = Math.floor(bounds.minY / MAJOR_GRID) * MAJOR_GRID;
    const majorMaxY = Math.ceil(bounds.maxY / MAJOR_GRID) * MAJOR_GRID;

    lines.push('  <g id="grid-major" stroke="#d0d0d0" stroke-width="0.8">');
    for (let x = majorMinX; x <= majorMaxX; x += MAJOR_GRID) {
      lines.push(`    <line x1="${x}" y1="${bounds.minY}" x2="${x}" y2="${bounds.maxY}"/>`);
    }
    for (let y = majorMinY; y <= majorMaxY; y += MAJOR_GRID) {
      lines.push(`    <line x1="${bounds.minX}" y1="${y}" x2="${bounds.maxX}" y2="${y}"/>`);
    }
    lines.push('  </g>');

    // Origin crosshair
    const crossLen = 15;
    lines.push('  <g id="origin" stroke="#bbb" stroke-width="1.5">');
    lines.push(`    <line x1="${-crossLen}" y1="0" x2="${crossLen}" y2="0"/>`);
    lines.push(`    <line x1="0" y1="${-crossLen}" x2="0" y2="${crossLen}"/>`);
    lines.push('  </g>');

    return lines.join('\n');
  }

  function svgRooms(scale) {
    const lines = [];
    lines.push('  <g id="rooms">');

    for (const room of Model.rooms) {
      if (!room.polygon || room.polygon.length < 3) continue;

      // Polygon fill
      const pts = room.polygon.map(p => `${p.x},${p.y}`).join(' ');
      lines.push(`    <polygon points="${pts}" fill="${room.color || '#E3F2FD'}" fill-opacity="0.4" stroke="none"/>`);

      // Room label and area at centroid
      const centroid = Geometry.polygonCentroid(room.polygon);
      const areaSqM = room.area / 10000;
      const labelFontSize = 13 * scale;
      const areaFontSize = 11 * scale;

      if (room.label) {
        lines.push(`    <text x="${centroid.x}" y="${centroid.y - areaFontSize * 0.6}" ` +
          `text-anchor="middle" dominant-baseline="central" ` +
          `font-family="system-ui, -apple-system, sans-serif" font-size="${labelFontSize}" font-weight="bold" fill="#555">${escapeXml(room.label)}</text>`);
        lines.push(`    <text x="${centroid.x}" y="${centroid.y + labelFontSize * 0.6}" ` +
          `text-anchor="middle" dominant-baseline="central" ` +
          `font-family="system-ui, -apple-system, sans-serif" font-size="${areaFontSize}" fill="#555">${areaSqM.toFixed(1)} m\u00B2</text>`);
      } else {
        lines.push(`    <text x="${centroid.x}" y="${centroid.y}" ` +
          `text-anchor="middle" dominant-baseline="central" ` +
          `font-family="system-ui, -apple-system, sans-serif" font-size="${areaFontSize}" fill="#555">${areaSqM.toFixed(1)} m\u00B2</text>`);
      }
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  function svgWalls(scale) {
    const lines = [];
    lines.push('  <g id="walls">');

    for (const wall of Model.walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;

      // Get wall segments (with gaps for doors/windows)
      const segments = computeWallSegments(wall);

      for (const [t0, t1] of segments) {
        const sx = wall.x1 + dx * t0;
        const sy = wall.y1 + dy * t0;
        const ex = wall.x1 + dx * t1;
        const ey = wall.y1 + dy * t1;
        lines.push(`    <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" ` +
          `stroke="${wall.color}" stroke-width="${wall.thickness}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }

      // Endpoint circles
      const epRadius = Math.max(3 * scale, wall.thickness / 2 + 1);
      lines.push(`    <circle cx="${wall.x1}" cy="${wall.y1}" r="${epRadius}" fill="${wall.color}"/>`);
      lines.push(`    <circle cx="${wall.x2}" cy="${wall.y2}" r="${epRadius}" fill="${wall.color}"/>`);
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  function svgDoors(scale) {
    const lines = [];
    lines.push('  <g id="doors">');

    for (const door of Model.doors) {
      const wall = Model.getWall(door.wallId);
      if (!wall) continue;

      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.sqrt(dx * dx + dy * dy);
      if (wallLen === 0) continue;

      const cx = wall.x1 + dx * door.position;
      const cy = wall.y1 + dy * door.position;
      const hw = door.width / 2;
      const ux = dx / wallLen;
      const uy = dy / wallLen;
      const nx = -uy;
      const ny = ux;

      const color = '#8B4513';
      const strokeW = STROKE_MEDIUM * scale;

      // Hinge point (one end of the door gap)
      const dir = door.openDirection === 'left' ? 1 : -1;
      const hingeX = cx - ux * hw;
      const hingeY = cy - uy * hw;

      // Door panel line (from hinge, perpendicular to wall)
      const panelEndX = hingeX + nx * door.width * dir;
      const panelEndY = hingeY + ny * door.width * dir;
      lines.push(`    <line x1="${hingeX}" y1="${hingeY}" x2="${panelEndX}" y2="${panelEndY}" ` +
        `stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>`);

      // Quarter arc from panel end to wall
      const wallAngle = Math.atan2(dy, dx);
      const arcStart = wallAngle + (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      const arcEnd = wallAngle + (dir > 0 ? 0 : Math.PI);

      // SVG arc: compute start and end points on the arc
      const r = door.width;
      const startAngle = Math.min(arcStart, arcEnd);
      const endAngle = Math.max(arcStart, arcEnd);
      const arcX1 = hingeX + r * Math.cos(startAngle);
      const arcY1 = hingeY + r * Math.sin(startAngle);
      const arcX2 = hingeX + r * Math.cos(endAngle);
      const arcY2 = hingeY + r * Math.sin(endAngle);

      // Determine sweep direction: arc span is always pi/2 (quarter circle)
      // Use sweep-flag=1 for CW arc in SVG (positive-Y-down)
      const largeArc = 0; // quarter circle is never > 180 degrees
      const sweepFlag = 1;

      lines.push(`    <path d="M ${arcX1} ${arcY1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${arcX2} ${arcY2}" ` +
        `fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>`);

      // Post squares at door gap endpoints
      const post1X = cx - ux * hw;
      const post1Y = cy - uy * hw;
      const post2X = cx + ux * hw;
      const post2Y = cy + uy * hw;
      const postSize = 6 * scale;
      const halfPost = postSize / 2;
      lines.push(`    <rect x="${post1X - halfPost}" y="${post1Y - halfPost}" width="${postSize}" height="${postSize}" fill="${color}"/>`);
      lines.push(`    <rect x="${post2X - halfPost}" y="${post2Y - halfPost}" width="${postSize}" height="${postSize}" fill="${color}"/>`);
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  function svgWindows(scale) {
    const lines = [];
    lines.push('  <g id="windows">');

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

      const color = '#4FC3F7';
      const halfThick = wall.thickness / 2;

      // Three parallel lines along the wall
      for (const sign of [-1, 0, 1]) {
        const ox = nx * halfThick * sign * 0.7;
        const oy = ny * halfThick * sign * 0.7;
        const x1 = cx - ux * hw + ox;
        const y1 = cy - uy * hw + oy;
        const x2 = cx + ux * hw + ox;
        const y2 = cy + uy * hw + oy;
        const sw = (sign === 0 ? STROKE_THIN : STROKE_MEDIUM) * scale;
        lines.push(`    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
          `stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`);
      }

      // End caps (perpendicular lines at both ends)
      const t = halfThick * 0.7;
      for (const s of [-1, 1]) {
        const bx = cx + ux * hw * s;
        const by = cy + uy * hw * s;
        const x1 = bx + nx * t;
        const y1 = by + ny * t;
        const x2 = bx - nx * t;
        const y2 = by - ny * t;
        lines.push(`    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
          `stroke="${color}" stroke-width="${STROKE_MEDIUM * scale}" stroke-linecap="round"/>`);
      }
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  function svgDimensions(scale) {
    const lines = [];
    lines.push('  <g id="dimensions">');

    const fontSize = 11 * scale;
    const font = 'system-ui, -apple-system, sans-serif';

    for (const wall of Model.walls) {
      const len = Geometry.segmentLength(wall.x1, wall.y1, wall.x2, wall.y2);
      if (len < 1) continue;

      const mid = Geometry.midpoint(wall.x1, wall.y1, wall.x2, wall.y2);
      const normal = Geometry.segmentNormal(wall.x1, wall.y1, wall.x2, wall.y2);
      const offsetDist = wall.thickness / 2 + 15;

      // Dimension text position
      const tx = mid.x + normal.x * offsetDist;
      const ty = mid.y + normal.y * offsetDist;

      const meters = len / 100;
      const text = meters.toFixed(2) + ' m';

      // Approximate text background rect
      const tw = text.length * fontSize * 0.55 + 6 * scale;
      const th = fontSize + 6 * scale;

      // White background for readability
      lines.push(`    <rect x="${tx - tw / 2}" y="${ty - th / 2}" width="${tw}" height="${th}" ` +
        `fill="white" fill-opacity="0.85" stroke="none"/>`);

      // Dimension text
      lines.push(`    <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="${font}" font-size="${fontSize}" fill="#666">${escapeXml(text)}</text>`);

      // Tick marks at wall endpoints
      const tickLen = 6 * scale;
      for (const ep of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
        const t1x = ep.x + normal.x * (offsetDist - tickLen);
        const t1y = ep.y + normal.y * (offsetDist - tickLen);
        const t2x = ep.x + normal.x * (offsetDist + tickLen);
        const t2y = ep.y + normal.y * (offsetDist + tickLen);
        lines.push(`    <line x1="${t1x}" y1="${t1y}" x2="${t2x}" y2="${t2y}" ` +
          `stroke="#999" stroke-width="${STROKE_DIM_TICK * scale}"/>`);
      }

      // Dashed dimension line
      const dl1x = wall.x1 + normal.x * offsetDist;
      const dl1y = wall.y1 + normal.y * offsetDist;
      const dl2x = wall.x2 + normal.x * offsetDist;
      const dl2y = wall.y2 + normal.y * offsetDist;
      const dashLen = 3 * scale;
      lines.push(`    <line x1="${dl1x}" y1="${dl1y}" x2="${dl2x}" y2="${dl2y}" ` +
        `stroke="#bbb" stroke-width="${STROKE_DIM_LINE * scale}" stroke-dasharray="${dashLen} ${dashLen}"/>`);
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  function svgLabels(scale) {
    const lines = [];
    lines.push('  <g id="labels">');

    const font = 'system-ui, -apple-system, sans-serif';

    for (const label of Model.labels) {
      const fontSize = label.fontSize * scale;

      // Approximate text background rect
      const tw = label.text.length * fontSize * 0.55 + 10 * scale;
      const th = fontSize + 8 * scale;

      // White background
      lines.push(`    <rect x="${label.x - tw / 2}" y="${label.y - th / 2}" width="${tw}" height="${th}" ` +
        `fill="white" fill-opacity="0.7" stroke="none"/>`);

      // Label text
      lines.push(`    <text x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="${font}" font-size="${fontSize}" fill="${label.color || '#333'}">${escapeXml(label.text)}</text>`);
    }

    lines.push('  </g>');
    return lines.join('\n');
  }

  // ========== Main Export ==========

  function buildSVG() {
    const bounds = computeBounds();
    const scale = computeScaleFactor(bounds);
    const vbW = bounds.maxX - bounds.minX;
    const vbH = bounds.maxY - bounds.minY;

    // Use a reasonable pixel size for screen display.
    // Target: longest side fits in ~1200 pixels for comfortable viewing.
    const maxPx = 1200;
    const aspect = vbW / vbH;
    let pxW, pxH;
    if (aspect >= 1) {
      pxW = maxPx;
      pxH = Math.round(maxPx / aspect);
    } else {
      pxH = maxPx;
      pxW = Math.round(maxPx * aspect);
    }

    const parts = [];

    // SVG header — viewBox in world cm, pixel size for comfortable screen display.
    // Applications that understand viewBox (Inkscape, Illustrator, browsers) will
    // scale correctly. For true 1:1 printing, open in a vector editor and set
    // document units to cm.
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="${bounds.minX} ${bounds.minY} ${vbW} ${vbH}" ` +
      `width="${pxW}" height="${pxH}">`);

    // Background
    parts.push(`  <rect x="${bounds.minX}" y="${bounds.minY}" width="${vbW}" height="${vbH}" fill="#fafafa"/>`);

    // Layers in draw order (matching canvas render order)
    parts.push(svgGrid(bounds));
    parts.push(svgRooms(scale));
    parts.push(svgWalls(scale));
    parts.push(svgDoors(scale));
    parts.push(svgWindows(scale));
    parts.push(svgDimensions(scale));
    parts.push(svgLabels(scale));

    parts.push('</svg>');

    return parts.join('\n');
  }

  /** Export the plan as an SVG file download. */
  function exportSVG() {
    const svgString = buildSVG();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'room-plan.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    exportSVG,
    buildSVG  // exposed for testing
  };
})();
