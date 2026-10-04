# 橋 Kiu

Cantonese ↔ Mandarin bridge app (PWA). Static files, no build.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy (Netlify, auto on push)
1. Push this repo to GitHub.
2. Netlify → Add new site → Import from Git → pick repo. Build command: none. Publish directory: `.`
3. On iPhone: open the site in Safari → Share → Add to Home Screen.

Updating via git push redeploys to the same URL, so saved progress persists (it is stored in that origin's localStorage). If you move to a new URL, progress does NOT carry over.

## Offline
After the first visit everything except Scan and "Translate with AI" works offline, including Add
(an offline dictionary, `dict.json`, downloads in the background on first launch).

## Add/Scan AI setup (standalone)
Settings (gear) → paste your Anthropic API key (console.anthropic.com). Only needed for Scan and the
"Translate with AI" fallback in Add.

## Rebuilding the offline dictionary
`dict.json` is generated and committed. To rebuild (e.g. after editing `scripts/canto-mando-pairs.txt`):

    bash scripts/fetch-dict-sources.sh        # downloads inputs into dict-src/ (gitignored)
    node scripts/build-dict.mjs dict-src
    node scripts/test-lookup.mjs

Then bump `CACHE_NAME` in `sw.js`.

## Shipping a change
Bump `CACHE_NAME` in `sw.js` so installed copies refresh.
