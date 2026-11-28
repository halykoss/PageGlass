# Changelog

All notable changes to PageGlass are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [1.0.3] — 2026-11-28

### Fixed
- On insecure (`http`) pages the site-info button's “Not secure” label spilled over the URL and its icon over the Reload button: the button was fixed at 26 px. Address-field buttons now size to their content — icon-only ones stay 26 px circles, labelled ones become a pill.

## [1.0.2] — 2026-11-27

### Changed
- New glass material, closer to Apple's Liquid Glass and away from the Aero look: no gloss band across the bar, no tinted plastic fills and no dark outlines. Glass is clear and neutral, takes its colour from the page, and gets its light from a thin rim, an inner edge ring and a soft corner glint; controls float on wide soft shadows. Dark glass dims what is behind it instead of brightening it.
- Reload (and Stop) is always its own glass circle.
- Back and Forward share one capsule only while both are available; if either is unavailable they become two separate circles, the unavailable one dimmed. Buttons are recognised by Vivaldi's language-independent `data-name`, and capsules update as soon as a button's state changes.
- Every stand-alone toolbar button is now a perfect 32 px circle instead of a short pill.

### Fixed
- Extension icons without a `viewBox` (e.g. a VPN badge) were cropped; toolbar icons now keep their native size.
- No visible seam inside multi-button capsules.
- The close button (×) of tabs no longer appeared on hover in vertical tab bars: 1.0.1 hid it together with the titles. It is back, exactly where Vivaldi puts it.
- Tab titles are hidden only in truly icon-only strips (narrower than 70 px), not in every narrow vertical bar.

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
