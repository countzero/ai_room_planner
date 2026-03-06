# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Common Changelog](https://common-changelog.org),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-06

### Added

- Add wall drawing tool with click-to-place polyline chains, polygon closing, and double-click to end open chains
- Add door placement tool with configurable width (40–200 cm) and swing direction, visualized with swing arc and hinge point
- Add window placement tool with configurable width (30–300 cm) and three-line visual representation
- Add text label tool with inline editing, configurable font size and color, and double-click to edit existing labels
- Add select tool with priority-based hit testing across walls, doors, windows, labels, and rooms
- Add drag operations for walls, wall endpoints, doors (slide along wall), windows (slide along wall), and labels
- Add grab/pan tool with dedicated shortcut (H), middle-click+drag, and Space+drag panning
- Add automatic room detection from closed wall polygons using graph-based left-hand-rule cycle traversal
- Add room properties with customizable name, fill color (10 preset pastel colors), and area display in m²
- Add wall dimension annotations with tick marks, dashed reference lines, and length display in meters
- Add smart snapping system with grid snap (10 cm), endpoint snap with visual indicator, and angle snap (15° increments)
- Add two-level grid display with minor (10 cm) and major (1 m) grid lines and origin crosshair
- Add scroll-wheel zoom (0.1×–5×) pivoting around cursor position with zoom percentage display
- Add fit-to-view to auto-zoom and center all plan content (F key)
- Add context-sensitive properties panel for editing wall thickness/color, door width/swing, window width, label text/size/color, and room name/color
- Add rooms list panel with color swatches, names, and area display
- Add undo/redo with full state-snapshot history up to 100 levels (Ctrl+Z / Ctrl+Y)
- Add auto-save to localStorage with 500 ms debounce and automatic restore on page load
- Add JSON export/import for full plan state (Ctrl+S to export, Load button to import)
- Add PNG export of current canvas view
- Add SVG export with resolution-independent vector output of the full plan including all visual layers
- Add clear plan action with confirmation dialog to reset all data, history, and localStorage
- Add 16 keyboard shortcuts for tools, actions, and navigation with in-sidebar quick reference
- Add toast notifications for save, load, export, snap toggle, and other actions
- Add high-DPI canvas rendering via devicePixelRatio scaling
- Add Pointer Events API support for cross-input compatibility (mouse, touch, pen) with pointer capture
- Add real-time cursor position display in meters
