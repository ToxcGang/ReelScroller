# Reel Scroller

Reel Scroller is a Firefox extension that automatically advances Instagram Reels. It scrolls to the next Reel when the focused video ends, skips visibly sponsored Reels, and can be toggled from the browser toolbar.

## Features

- Auto-scrolls to the next Instagram Reel when the current Reel finishes.
- Skips Reels that show visible ad labels such as `Ad`, `Sponsored`, `Paid promotion`, or `Advertisement`.
- Uses one global toolbar toggle across Instagram tabs.
- Starts enabled by default.
- Stores only the on/off preference in Firefox extension storage.

## Install for Development

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select `manifest.json` from this project folder.
5. Open `https://www.instagram.com/reels/`.

Temporary add-ons are removed when Firefox restarts. Reload the extension from `about:debugging` after making code changes.

## Usage

- Open Instagram Reels.
- The extension starts enabled by default.
- Click the Reel Scroller toolbar button to toggle auto-scroll on or off.
- When enabled, the toolbar badge shows `ON`.

## How It Works

The background script stores a single global setting named `reelScrollerEnabled`. It sends `ENABLE` and `DISABLE` messages to Instagram tabs whenever the toolbar button is clicked or an Instagram tab finishes loading.

The content script runs on Instagram pages, but only attaches scrolling behavior on `/reel/` and `/reels/` routes. It watches visible video elements, scrolls after the focused video ends, and checks nearby visible text for ad labels.

## Troubleshooting

- If the extension does not respond after editing code, reload it in `about:debugging`.
- If a tab was already open before loading the extension, refresh the Instagram tab.
- If Instagram changes its page structure, sponsored detection may need adjustment.
- Browser autoplay rules can block programmatic video playback after scrolling, but the scroll itself should still occur.

## Privacy

Reel Scroller does not collect data. It only stores the global enabled/disabled preference locally in Firefox extension storage.
