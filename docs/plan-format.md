# Plan File Format

Room plans are stored as JSON files that can be imported/exported via the toolbar. The formal schema is available in [`plan-schema.json`](plan-schema.json).

## Coordinate System

- **Units**: centimeters (cm). A wall from `(0, 0)` to `(500, 0)` is 5 meters long.
- **Axes**: X increases to the right, Y increases downward (standard screen/canvas convention).
- **Grid**: minor gridlines every 10 cm, major gridlines every 100 cm (1 m).
- **Display**: the UI converts to meters for dimension annotations (÷ 100) and to square meters for room areas (÷ 10 000).

## Top-Level Structure

```jsonc
{
  "walls":    [ ... ],   // Wall segments (required for any useful plan)
  "doors":    [ ... ],   // Doors placed on walls
  "windows":  [ ... ],   // Windows placed on walls
  "labels":   [ ... ],   // Free-form text labels
  "roomMeta": { ... },   // Display metadata for auto-detected rooms
  "nextId":   200        // Next sequential entity ID (auto-corrected on import)
}
```

All arrays default to `[]` and `roomMeta` defaults to `{}` when omitted.

## Entities

### Wall

| Field       | Type    | Required | Default      | Constraints          | Description |
|-------------|---------|----------|--------------|----------------------|-------------|
| `id`        | integer | yes      | —            | unique across all entities | Unique identifier |
| `x1`        | number  | yes      | —            | finite               | First endpoint X (cm) |
| `y1`        | number  | yes      | —            | finite               | First endpoint Y (cm) |
| `x2`        | number  | yes      | —            | finite               | Second endpoint X (cm) |
| `y2`        | number  | yes      | —            | finite               | Second endpoint Y (cm) |
| `thickness` | number  | no       | `20`         | 5–100, step 5        | Wall thickness (cm) |
| `color`     | string  | no       | `"#444444"`  | hex `#RRGGBB`        | Wall color |

Typical conventions: **24 cm** for exterior walls, **12 cm** for interior partitions.

### Door

| Field           | Type    | Required | Default    | Constraints       | Description |
|-----------------|---------|----------|------------|-------------------|-------------|
| `id`            | integer | yes      | —          | unique            | Unique identifier |
| `wallId`        | integer | yes      | —          | must reference an existing wall | Host wall |
| `position`      | number  | yes      | `0.5`      | 0.05–0.95         | Parametric position along wall (0 = start, 1 = end) |
| `width`         | number  | yes      | `80`       | 40–200, step 5    | Door width (cm) |
| `openDirection` | string  | yes      | `"left"`   | `"left"` or `"right"` | Swing arc side relative to the wall normal |

### Window

| Field      | Type    | Required | Default   | Constraints       | Description |
|------------|---------|----------|-----------|-------------------|-------------|
| `id`       | integer | yes      | —         | unique            | Unique identifier |
| `wallId`   | integer | yes      | —         | must reference an existing wall | Host wall |
| `position` | number  | yes      | `0.5`     | 0.05–0.95         | Parametric position along wall |
| `width`    | number  | yes      | `100`     | 30–300, step 10   | Window width (cm) |

### Label

| Field      | Type    | Required | Default      | Constraints     | Description |
|------------|---------|----------|--------------|-----------------|-------------|
| `id`       | integer | yes      | —            | unique          | Unique identifier |
| `x`        | number  | yes      | —            | —               | X position (cm) |
| `y`        | number  | yes      | —            | —               | Y position (cm) |
| `text`     | string  | yes      | `"Label"`    | —               | Displayed text |
| `fontSize` | number  | no       | `14`         | 8–48            | Font size (px at 1:1 zoom) |
| `color`    | string  | no       | `"#333333"`  | hex `#RRGGBB`   | Text color |

## Room Meta

Rooms are **auto-detected** from closed wall polygons using graph traversal. They are never stored as entities — only their display metadata is persisted.

Keys are comma-separated, **sorted** wall IDs (e.g. `"1,3,5,7"`). This creates a stable identity even when walls are reordered in the array.

```json
"roomMeta": {
  "1,2,5,8": { "color": "#E3F2FD", "label": "Living Room" },
  "3,4,6,7": { "color": "#E8F5E9", "label": "Bedroom" }
}
```

| Field   | Type   | Description |
|---------|--------|-------------|
| `color` | string | Room fill color (hex `#RRGGBB`) |
| `label` | string | Optional room display name |

## Import Validation

On import (`Storage.importJSON`), the following checks are enforced before the plan is loaded:

1. Top level must be a non-array object.
2. `walls`, `doors`, `windows`, `labels` — if present, each must be an array.
3. Every wall must have `x1`, `y1`, `x2`, `y2` as finite numbers.
4. Every door's `wallId` must reference an existing wall's `id`.
5. Every window's `wallId` must reference an existing wall's `id`.
6. `roomMeta` — if present, must be a non-null, non-array object.

## Programmatic Loading

To load a plan via the browser console or automation script:

```js
const state = { /* plan JSON */ };
Model.setState(state);
CanvasRenderer.render();
```

Note: `file://` origins do not support `fetch()`. To load from a file path, either serve the app over HTTP or inject the JSON directly as shown above.

## Minimal Example

```json
{
  "walls": [
    { "id": 1, "x1": 0, "y1": 0, "x2": 500, "y2": 0,   "thickness": 24, "color": "#444444" },
    { "id": 2, "x1": 500, "y1": 0, "x2": 500, "y2": 400, "thickness": 24, "color": "#444444" },
    { "id": 3, "x1": 500, "y1": 400, "x2": 0, "y2": 400, "thickness": 24, "color": "#444444" },
    { "id": 4, "x1": 0, "y1": 400, "x2": 0, "y2": 0,     "thickness": 24, "color": "#444444" }
  ],
  "doors": [
    { "id": 5, "wallId": 3, "position": 0.5, "width": 80, "openDirection": "left" }
  ],
  "windows": [
    { "id": 6, "wallId": 1, "position": 0.5, "width": 120 }
  ],
  "labels": [
    { "id": 7, "x": 250, "y": 200, "text": "Room", "fontSize": 16, "color": "#333333" }
  ],
  "roomMeta": {},
  "nextId": 8
}
```

This creates a single 5 m × 4 m room with one door on the bottom wall and one window on the top wall.
