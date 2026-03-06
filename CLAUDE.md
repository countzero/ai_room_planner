# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based 2D room planner built with vanilla JavaScript and HTML5 Canvas. No build tools, no bundler, no frameworks — just open `index.html` in a browser.

## Running

Open `index.html` directly in a browser. No server, build step, or package manager required.

## Architecture

The app uses the **revealing module pattern** — each JS file defines a global singleton (IIFE returning a public API). Scripts are loaded in dependency order via `<script>` tags in `index.html`:

1. **`geometry.js`** → `Geometry` — Pure math utilities (distance, snapping, polygon detection). All coordinates are in **centimeters** internally.
2. **`model.js`** → `Model` — Central data store for walls, doors, windows, labels, and auto-detected rooms. Rooms are computed via `Geometry.detectRooms()` whenever walls change.
3. **`history.js`** → `History` — Undo/redo via JSON-serialized state snapshots of the full Model.
4. **`canvas.js`** → `CanvasRenderer` — Rendering engine handling grid, zoom/pan, and drawing all elements. Manages screen↔world coordinate transforms.
5. **`tools.js`** → `Tools` — Tool state machine (select, wall, door, window, label). Handles all mouse/keyboard interaction, snapping logic, and drag operations.
6. **`storage.js`** → `Storage` — localStorage auto-save (debounced 500ms), JSON import/export, PNG export.
7. **`app.js`** — Entry point. Wires DOM events to Tools, binds toolbar buttons, manages the properties panel and rooms list UI.

## Key Conventions

- **Coordinate system**: World units are centimeters. Grid snaps to 10cm (minor) / 100cm=1m (major). Display converts to meters.
- **Entity IDs**: Sequential integers from `Model._nextId`. Walls, doors, windows, and labels each have a numeric `id`.
- **Doors/windows are wall-attached**: They reference a `wallId` and store a `position` (0–1 parametric along the wall). Removing a wall cascades to its doors/windows.
- **Room detection**: Rooms are auto-detected from closed wall polygons using graph traversal (left-hand rule). Room identity is keyed by sorted wall-ID string (e.g., `"1,3,5"`). Room metadata (color, label) is stored separately in `roomMeta`.
- **State serialization**: `Model.getState()` / `Model.setState()` produce/consume plain objects. Used by History, Storage, and JSON export.
- **No module system**: All modules communicate through globals. Load order in `index.html` matters.
