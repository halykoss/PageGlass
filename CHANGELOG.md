# Changelog

All notable changes to PageGlass are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [1.0.1] — 2026-11-25

### Fixed
- Tab stacks: the accordion arrow of the active stack was a solid accent/stack-coloured block that spilled out of the glass. A collapsed stack holding the active tab is now one glass tile with a quiet chevron; the stack colour survives only as an accent (chevron, counter ring, faint frame and tint).
- Narrow vertical strips show icons only (no clipped title letters) and no permanent scrollbar.
- Vivaldi sometimes replaces a toolbar element outright; the glass is now re-applied immediately from the last capture.
- Captures resume as soon as a hidden window becomes visible again.
- Panel strip: the active panel showed Vivaldi's accent background around the icon; it now gets a glass tile that fits inside the pane.
- Sidebar styles could silently switch off: Vivaldi rewrites the `class` of `#panels-container` when a panel opens or closes, removing PageGlass's classes. They are now restored immediately and the glass is re-measured.
- Light appearance: the URL host was drawn white on light glass.
- The floating panel card now uses the same 4 px inset as the strip.

## [1.0.0] — 2026-11-25

First public release.

### Added
- Glass toolbars that project the visible tab, blurred and tinted, and follow it while scrolling (GPU transforms between captures).
- Glossy base bar with a lacquer highlight; frosted capsules for buttons, extensions and the address field.
- Safari-style capsules: adjacent toolbar buttons merge into one seamless shape; spacers and dividers are excluded.
- Reflections of the adjacent page in the bar touching it (top or bottom address bar) and in the vertical strip beside it.
- Floating glass pane for narrow vertical strips and a floating card for wide panels.
- Light/dark appearance, *Reduce motion* and *Reduce transparency* support.
- On/off button in the address bar; the choice persists across restarts.
- Cross-platform installer (`pageglass.py`) with `install`, `uninstall`, `status`, `--vivaldi` and `--dry-run`; byte-exact restore from backup.
