# Changelog

All notable changes to PageGlass are listed here. Versions follow [Semantic Versioning](https://semver.org).

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
