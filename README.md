# 2D Room Planner

A browser-based 2D floor plan editor built with vanilla JavaScript and HTML5 Canvas. No frameworks, no build tools, no dependencies -- just open `index.html` in a browser and start drawing.

## Features

- **Wall drawing** -- click to place polyline chains, click the start point to close into a polygon, or double-click to end an open chain
- **Door placement** -- place doors on any wall with configurable width and swing direction (left/right), visualized with a swing arc
- **Window placement** -- place windows on any wall with configurable width
- **Text labels** -- add annotations anywhere on the plan; double-click to edit in place
- **Automatic room detection** -- closed wall polygons are detected as rooms with calculated area (m^2), customizable name and fill color
- **Smart snapping** -- grid snap (10 cm), endpoint snap to existing wall corners, angle snap (15 degree increments)
- **Zoom and pan** -- scroll to zoom (0.1x--5x), middle-click or Space+drag to pan
- **Undo/redo** -- up to 100 history states
- **Auto-save** -- plan is saved to localStorage automatically (500 ms debounce)
- **JSON import/export** -- save and load full plan state as `.json` files
- **PNG export** -- download the current canvas view as an image
- **Properties panel** -- context-sensitive editing for walls (thickness, color), doors (width, swing), windows (width), labels (text, size, color), and rooms (name, color)

## Quick Start

```bash
git clone <repository-url>
cd ai_room_planer
```

Open `index.html` in any modern browser. That's it -- no install, no build step, no server required.

## Usage Guide

### Drawing Walls

1. Press **W** or click the **Wall** button in the toolbar.
2. Click on the canvas to place the first point.
3. Move the mouse and click to place additional points. A dashed preview line shows the segment being drawn with its length in meters.
4. To create a closed room, click on the first point (an orange snap indicator appears when you're close enough).
5. To end an open wall chain, **double-click** on the last point.

Walls snap to a 10 cm grid by default. While drawing, the endpoint also snaps to 15-degree angle increments relative to the previous point.

### Placing Doors and Windows

1. Press **D** (door) or **N** (window).
2. Hover over a wall -- it will highlight in blue.
3. Click to place the door or window at that position along the wall.
4. With the **Select** tool, drag a placed door or window to slide it along its wall.

### Adding Labels

1. Press **L** or click the **Label** button.
2. Click anywhere on the canvas.
3. Type your text in the input that appears and press **Enter**.
4. To edit an existing label, switch to **Select** (V), then **double-click** the label.

### Working with Rooms

Rooms are detected automatically whenever walls form a closed polygon. Each room appears in the **Rooms** panel on the left sidebar with its area.

- Click a room on the canvas or in the Rooms panel to select it.
- In the **Properties** panel, set a custom name (e.g., "Kitchen") and fill color.
- Room area is displayed in m^2 at the centroid of the polygon.

### Selecting and Editing

1. Press **V** or click **Select** to switch to the selection tool.
2. Click an element to select it -- the Properties panel shows editable fields.
3. Drag a **wall** to move it entirely, or drag an **endpoint** to reshape it.
4. Drag a **label** to reposition it.
5. Press **Delete** or **Backspace** to remove the selected element.

### Navigation

| Action | Input |
|--------|-------|
| Zoom in/out | Scroll wheel |
| Pan | Middle-click + drag, or Space + left-click + drag |
| Toggle grid snapping | Press **G** |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `W` | Wall tool |
| `D` | Door tool |
| `N` | Window tool |
| `L` | Label tool |
| `G` | Toggle grid snapping |
| `Escape` | Cancel current action / deselect |
| `Delete` / `Backspace` | Delete selected element |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Export plan as JSON |
| `Scroll` | Zoom in/out |
| `Middle-click + drag` | Pan |
| `Space + drag` | Pan |

## Saving and Exporting

| Method | Description |
|--------|-------------|
| **Auto-save** | Plan state is saved to `localStorage` automatically with a 500 ms debounce. Your work persists across browser sessions. |
| **Export JSON** | Click **Save** or press `Ctrl+S` to download a `room-plan.json` file containing the full plan state. |
| **Import JSON** | Click **Load** and select a previously exported `.json` file. |
| **Export PNG** | Click **Export** to download a `room-plan.png` screenshot of the current canvas view. |
| **Clear** | Click **Clear** to reset the entire plan (with confirmation). This also clears localStorage and history. |

## Project Structure

```
ai_room_planer/
  index.html          Main HTML file (entry point)
  css/
    style.css          All styles (toolbar, sidebar, canvas, overlays)
  js/
    geometry.js        Pure math utilities (distance, snapping, polygon detection)
    model.js           Central data store (walls, doors, windows, labels, rooms)
    history.js         Undo/redo via JSON state snapshots
    canvas.js          Rendering engine (grid, zoom/pan, drawing)
    tools.js           Tool state machine (mouse/keyboard interaction)
    storage.js         localStorage auto-save, JSON/PNG export/import
    app.js             Entry point -- wires DOM events, toolbar, properties panel
```

## Architecture

The app uses the **revealing module pattern**. Each JavaScript file defines a global singleton via an IIFE that returns a public API. Scripts are loaded in dependency order via `<script>` tags in `index.html`:

```
Geometry -> Model -> History -> CanvasRenderer -> Tools -> Storage -> app.js
```

### Key design decisions

- **Coordinate system** -- all internal coordinates are in centimeters. The grid snaps to 10 cm (minor) and 100 cm / 1 m (major). Display values are converted to meters.
- **Entity IDs** -- sequential integers from `Model._nextId`. Walls, doors, windows, and labels each carry a numeric `id`.
- **Wall-attached elements** -- doors and windows reference a `wallId` and store a `position` value (0--1 parametric along the wall). Removing a wall cascades deletion to its doors and windows.
- **Room detection** -- rooms are auto-detected from closed wall polygons using graph traversal with a left-hand (clockwise) rule. Room identity is keyed by a sorted wall-ID string (e.g., `"1,3,5"`). Room metadata (color, label) is stored separately in `roomMeta` so it survives re-detection.
- **State serialization** -- `Model.getState()` and `Model.setState()` produce and consume plain objects. This is used by History (undo/redo snapshots), Storage (localStorage + JSON export), and import.
- **No module system** -- all modules communicate through globals. Load order in `index.html` matters.

## Browser Compatibility

Requires a modern browser with support for:

- HTML5 Canvas 2D context
- `localStorage`
- ES6+ (arrow functions, `const`/`let`, template literals, `Map`, `Set`)

Tested in Chrome, Firefox, Edge, and Safari.

## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
