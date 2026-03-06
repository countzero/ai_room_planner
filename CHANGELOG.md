# Changelog

## [1.1.0] - 2026-03-06

### Added

- Add dark theme with toolbar toggle, OS preference detection via `prefers-color-scheme`, and persistent choice in localStorage ([`3a0a962`](https://github.com/countzero/ai_room_planner/commit/3a0a962))
- Add collapsible shortcuts panel with persistent collapsed state ([`7fca5f7`](https://github.com/countzero/ai_room_planner/commit/7fca5f7))
- Add JSON import validation for structure, types, and referential integrity ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))

### Fixed

- Fix `_nextId` becoming `NaN` when loading state files where entities lack an `id` property, breaking all subsequent entity creation ([`fd70b5e`](https://github.com/countzero/ai_room_planner/commit/fd70b5e))
- Fix dark theme room colors never being applied by wiring up `ROOM_COLORS_DARK` palette and migrating auto-assigned colors on theme toggle ([`fd70b5e`](https://github.com/countzero/ai_room_planner/commit/fd70b5e))
- Fix color picker `change` event without prior `input` silently dropping the edit ([`fd70b5e`](https://github.com/countzero/ai_room_planner/commit/fd70b5e))
- Fix room detection using wall array indices instead of entity IDs, causing incorrect rooms after wall deletion ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix walls not visually cut at door/window positions by computing gap segments instead of overdrawing with background color ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix door swing arc rendering for certain wall orientations in both canvas and SVG export ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix properties panel pushing multiple undo snapshots during color picker drag ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix PNG export rendering with current theme colors instead of forcing light theme ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix potential XSS via unsanitized values in properties panel HTML, rooms list HTML, and SVG export ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix entity ID collisions after state restore and stale room metadata accumulation ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))
- Fix `NaN` values when parsing invalid numeric property inputs ([`123837f`](https://github.com/countzero/ai_room_planner/commit/123837f))

## [1.0.0] - 2026-03-06

_First release._

[1.1.0]: https://github.com/countzero/ai_room_planner/releases/tag/v1.1.0
[1.0.0]: https://github.com/countzero/ai_room_planner/releases/tag/v1.0.0
