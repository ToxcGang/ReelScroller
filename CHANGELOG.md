# Changelog

All notable changes to Reel Scroller are documented here.

## 0.2.0 - 2026-05-06

### Changed

- Replaced per-tab enabled state with one global toolbar toggle.
- Defaulted the extension to enabled when no saved preference exists.
- Broadcast toggle changes to all open Instagram tabs.
- Made the content script safe to inject multiple times without stacking duplicate listeners.
- Scoped auto-scroll behavior to Instagram Reels routes.
- Tightened ad skipping to visible sponsored-label detection.
- Updated the extension description.

### Fixed

- Reduced false positives from broad ad-link and call-to-action heuristics.
- Cleaned up video listeners, observers, and intervals when disabled.

## 0.1.1 - 2026-04-15

### Added

- Initial Firefox extension structure.
- Toolbar toggle support.
- Instagram content script for scrolling when Reels end.
- Early sponsored/ad detection heuristics.
