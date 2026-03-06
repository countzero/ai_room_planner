/**
 * geometry.js - Math utilities for the room planner
 * All coordinates are in centimeters internally.
 */

const Geometry = (() => {
  const SNAP_GRID = 10;       // 10 cm grid
  const SNAP_THRESHOLD = 15;  // pixels (screen space) for endpoint snapping
  const ANGLE_SNAP = 15;      // degrees for angle snapping

  /** Distance between two points */
  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Distance squared (avoids sqrt for comparisons) */
  function dist2(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  /** Snap a value to a grid */
  function snapToGrid(val, gridSize = SNAP_GRID) {
    return Math.round(val / gridSize) * gridSize;
  }

  /** Snap a point {x,y} to the grid */
  function snapPointToGrid(x, y, gridSize = SNAP_GRID) {
    return {
      x: snapToGrid(x, gridSize),
      y: snapToGrid(y, gridSize)
    };
  }

  /** Snap angle to nearest increment (in degrees) */
  function snapAngle(angle, increment = ANGLE_SNAP) {
    const deg = (angle * 180) / Math.PI;
    const snapped = Math.round(deg / increment) * increment;
    return (snapped * Math.PI) / 180;
  }

  /**
   * Given a line from (ox, oy) to (px, py), snap the endpoint
   * to the nearest angle increment, keeping the length.
   */
  function snapEndpointToAngle(ox, oy, px, py, increment = ANGLE_SNAP) {
    const dx = px - ox;
    const dy = py - oy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: px, y: py };
    const angle = Math.atan2(dy, dx);
    const snapped = snapAngle(angle, increment);
    return {
      x: ox + len * Math.cos(snapped),
      y: oy + len * Math.sin(snapped)
    };
  }

  /**
   * Find closest point on a line segment (x1,y1)-(x2,y2) to point (px,py).
   * Returns { x, y, t } where t is the parametric position [0,1].
   */
  function closestPointOnSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: x1, y: y1, t: 0 };
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return {
      x: x1 + t * dx,
      y: y1 + t * dy,
      t: t
    };
  }

  /** Distance from a point to a line segment */
  function distToSegment(x1, y1, x2, y2, px, py) {
    const cp = closestPointOnSegment(x1, y1, x2, y2, px, py);
    return dist(cp.x, cp.y, px, py);
  }

  /** Check if point is near a line segment (within threshold in world units) */
  function isPointNearSegment(x1, y1, x2, y2, px, py, threshold) {
    return distToSegment(x1, y1, x2, y2, px, py) <= threshold;
  }

  /** Get angle of a line segment in radians */
  function segmentAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  /** Get length of a wall segment */
  function segmentLength(x1, y1, x2, y2) {
    return dist(x1, y1, x2, y2);
  }

  /** Get perpendicular offset vector (normalized) for a segment */
  function segmentNormal(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: -1 };
    return { x: -dy / len, y: dx / len };
  }

  /** Get midpoint of a segment */
  function midpoint(x1, y1, x2, y2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  /**
   * Detect closed polygons from a set of wall segments.
   * Uses graph traversal to find cycles.
   * Returns array of { wallIds, polygon, area } where wallIds are wall .id values.
   */
  function detectRooms(walls) {
    if (walls.length < 3) return [];

    // Build adjacency: map from point-key to list of { wallId, otherPoint }
    const EPS = 1; // 1 cm tolerance for point matching
    const pointKey = (x, y) => `${Math.round(x / EPS) * EPS},${Math.round(y / EPS) * EPS}`;

    // Build id -> wall lookup for O(1) access
    const wallById = new Map(walls.map(w => [w.id, w]));

    // Collect unique vertices and adjacency
    const adj = new Map();

    function addEdge(key1, key2, wallId) {
      if (!adj.has(key1)) adj.set(key1, []);
      adj.get(key1).push({ to: key2, wallId });
    }

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const k1 = pointKey(w.x1, w.y1);
      const k2 = pointKey(w.x2, w.y2);
      if (k1 === k2) continue;
      addEdge(k1, k2, w.id);
      addEdge(k2, k1, w.id);
    }

    // Find minimal cycles using wall-following (left-hand rule)
    const rooms = [];
    const usedEdgePairs = new Set(); // "wallId:fromKey" to avoid reusing directed edges

    for (const [startKey, edges] of adj) {
      for (const startEdge of edges) {
        const dirKey = `${startEdge.wallId}:${startKey}`;
        if (usedEdgePairs.has(dirKey)) continue;

        // Follow left turns to find a minimal polygon
        const path = [startKey];
        const pathWalls = [];
        let currentKey = startKey;
        let currentEdge = startEdge;
        let found = false;

        for (let step = 0; step < walls.length + 1; step++) {
          const dk = `${currentEdge.wallId}:${currentKey}`;
          if (usedEdgePairs.has(dk) && step > 0) break;

          pathWalls.push(currentEdge.wallId);
          const nextKey = currentEdge.to;

          if (nextKey === startKey && step >= 2) {
            // Found a closed polygon
            found = true;
            break;
          }

          if (path.includes(nextKey) && nextKey !== startKey) break;
          path.push(nextKey);

          // Find the next edge by turning left (smallest CW angle)
          const nextEdges = adj.get(nextKey);
          if (!nextEdges || nextEdges.length < 2) break;

          // Incoming direction
          const w = wallById.get(currentEdge.wallId);
          // Get coordinates from the wall
          const kStart = pointKey(w.x1, w.y1);
          let inX, inY;
          if (currentKey === kStart) {
            // came from (x1,y1), so we arrived at (x2,y2)
            inX = w.x1 - w.x2;
            inY = w.y1 - w.y2;
          } else {
            inX = w.x2 - w.x1;
            inY = w.y2 - w.y1;
          }
          const inAngle = Math.atan2(inY, inX);

          let bestEdge = null;
          let bestAngle = Infinity;

          for (const ne of nextEdges) {
            if (ne.wallId === currentEdge.wallId) continue;
            const nw = wallById.get(ne.wallId);
            const nk1 = pointKey(nw.x1, nw.y1);
            let outX, outY;
            if (nextKey === nk1) {
              outX = nw.x2 - nw.x1;
              outY = nw.y2 - nw.y1;
            } else {
              outX = nw.x1 - nw.x2;
              outY = nw.y1 - nw.y2;
            }
            let outAngle = Math.atan2(outY, outX);
            let diff = outAngle - inAngle;
            while (diff <= 0) diff += Math.PI * 2;
            if (diff < bestAngle) {
              bestAngle = diff;
              bestEdge = ne;
            }
          }

          if (!bestEdge) break;
          currentKey = nextKey;
          currentEdge = bestEdge;
        }

        if (found && pathWalls.length >= 3) {
          // Mark directed edges as used
          let ck = startKey;
          for (let i = 0; i < pathWalls.length; i++) {
            usedEdgePairs.add(`${pathWalls[i]}:${ck}`);
            const w = wallById.get(pathWalls[i]);
            const k1 = pointKey(w.x1, w.y1);
            ck = (ck === k1) ? pointKey(w.x2, w.y2) : k1;
          }

          // Compute signed area to filter out outer boundaries
          // The left-hand rule traces right-turning (smallest CW angle) paths,
          // producing CCW interior faces (negative area) in screen coords (Y-down).
          // Keep only negative area polygons (interior rooms), discard positive (outer boundary).
          const polygon = getPolygonFromWalls(wallById, pathWalls, pointKey, startKey);
          const area = signedPolygonArea(polygon);
          if (area < 0) {
            rooms.push({
              wallIds: [...pathWalls],
              polygon: polygon,
              area: Math.abs(area)
            });
          }
        }
      }
    }

    return rooms;
  }

  /** Get ordered polygon vertices from a sequence of wall IDs */
  function getPolygonFromWalls(wallById, wallIds, pointKeyFn, startKey) {
    const pts = [];
    let currentKey = startKey;
    for (const wid of wallIds) {
      const w = wallById.get(wid);
      const k1 = pointKeyFn(w.x1, w.y1);
      if (currentKey === k1) {
        pts.push({ x: w.x1, y: w.y1 });
        currentKey = pointKeyFn(w.x2, w.y2);
      } else {
        pts.push({ x: w.x2, y: w.y2 });
        currentKey = k1;
      }
    }
    return pts;
  }

  /** Signed area of a polygon (positive = CW in screen coords) */
  function signedPolygonArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return area / 2;
  }

  /** Absolute area of a polygon */
  function polygonArea(pts) {
    return Math.abs(signedPolygonArea(pts));
  }

  /** Centroid of a polygon */
  function polygonCentroid(pts) {
    let cx = 0, cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / pts.length, y: cy / pts.length };
  }

  /** Check if a point is inside a polygon (ray casting) */
  function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  return {
    SNAP_GRID,
    SNAP_THRESHOLD,
    ANGLE_SNAP,
    dist,
    dist2,
    snapToGrid,
    snapPointToGrid,
    snapAngle,
    snapEndpointToAngle,
    closestPointOnSegment,
    distToSegment,
    isPointNearSegment,
    segmentAngle,
    segmentLength,
    segmentNormal,
    midpoint,
    detectRooms,
    polygonArea,
    polygonCentroid,
    pointInPolygon,
    signedPolygonArea
  };
})();
