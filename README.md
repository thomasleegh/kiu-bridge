# 橋 Kiu

Cantonese ↔ Mandarin bridge app (PWA). Static files, no build.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy (Netlify, auto on push)
1. Push this repo to GitHub.
2. Netlify → Add new site → Import from Git → pick repo. Build command: none. Publish directory: `.`
3. On iPhone: open the site in Safari → Share → Add to Home Screen.

Updating via git push redeploys to the same URL, so saved progress persists (it is stored in that origin's localStorage). If you move to a new URL, progress does NOT carry over.

## Add/Scan setup (standalone)
Settings (gear) → paste your Anthropic API key (console.anthropic.com). Everything else works without one.

## Shipping a change
Bump `CACHE_NAME` in `sw.js` so installed copies refresh.
