# 橋 Kiu — Cantonese ↔ Mandarin Bridge App

Personal PWA (a "my own Duolingo"). User is a heritage Cantonese *listener* (passive, never spoke it) learning to activate Cantonese speaking and learn Mandarin in parallel. Sound/romanization first (Jyutping + Pinyin); characters are secondary, shown small/muted after reveal.

## Stack & files
- Single-file app: `index.html` (~90KB, vanilla JS, no build step, no dependencies).
- `manifest.json`, `sw.js` (stale-while-revalidate; bump `CACHE_NAME` when shipping), `icon-192.png`, `icon-512.png`.
- Deploy: Netlify (static, publish dir = repo root). Same URL = same localStorage = progress preserved. Target device: iPhone Safari → Add to Home Screen.

## Hard rules
1. **One file, one version.** `index.html` auto-detects its environment: `const IS_STANDALONE = typeof window.storage === 'undefined'`. If standalone, it installs a localStorage polyfill (`kiu_` prefix) and registers the service worker. Never fork or hand-patch a "standalone copy" — an earlier bug came from a polyfill leaking into the in-chat build and wiping progress.
2. Storage API used everywhere: `window.storage.get/set/delete/list` (async, returns `{value}`). Keys: `progress`, `meta`, `customWords`, `apiKey` (standalone only).
3. All buttons need `-webkit-appearance:none` + explicit height (iOS Safari otherwise changes tab heights).
4. Keep romanization primary; characters Traditional, secondary styling.
5. Test on mobile width (390×844). Playwright + Chromium works for headless checks.

## Data model
- `VOCAB` (65 built-ins; cats: Greetings, Pronouns, Family, Food, Time, Verbs, Phrases): `{id, cat, eng, cChar, cRom, mChar, mRom, same, cLit?, mLit?, note?}`
- `CONVOS` (4 dialogues), `SCENARIOS` (3 role-plays: convenience store, market, mall)
- `customWords[]` — user-added via Add/Scan; cat `Custom` (words) or `Phrases`
- `progress[id] = {status:'new'|'learning'|'known', shakyCount:n}`; `shakyCount` increments on every "Still shaky" and persists after graduating to Known. Known/Learning lists sort by `shakyCount` desc.
- `meta = {streak, lastPracticeDate}`

## UI structure
- Home: stats row (Known / Learning — tappable, open progress list scrolled to section via `state.focus`), secondary tabs **Add | Scan** (~40px), primary tabs **Words | Phrases | Speaking** (~56px). All share one container/gold active style.
- Top bar: gear (Settings), book (progress list), streak.
- Words/Phrases: Learn (8 cards: reveal → Got it / Still shaky), Quiz (meaning→sound MCQ), browse by category.
- Speaking: pick language → scenario → NPC line (romanization + TTS) → mic (SpeechRecognition `zh-HK`/`zh-CN`) → transcript for self-assessment, "Need help" shows model answer. No auto-scoring.
- Settings: in Claude shows "no setup needed"; standalone shows API-key input.
- Palette: `--ink:#14161B --surface:#1D2027 --paper:#EDEAE1 --canto:#E8543E --mando:#45A395 --gold:#D8A657`. Fonts: Noto Serif TC (chars), Space Grotesk (UI), IBM Plex Mono (romanization). Bridge cards: Cantonese rail red on top, Mandarin rail teal below; `lit. "..."` italic subtext only when literal meaning differs.

## Claude API features (Add + Scan)
- Both call `https://api.anthropic.com/v1/messages` with model `claude-sonnet-4-6` via `apiHeaders()`.
  - In Claude artifact sandbox: no auth headers needed.
  - Standalone: user's own key from Settings, sent with `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`. Errors: `nokey`, `badkey` (401/403), `network`, `api`, `parse`, `incomplete`.
- `translateEntry(eng)` → JSON `{type, cChar, cRom, mChar, mRom, lit, note}`; parsing uses first `{`…last `}` extraction (tolerant of stray text).
- `scanImageForText(base64)` → image resized client-side to 1024px JPEG, returns JSON array.
- **Known security tradeoff:** key lives in browser localStorage. Fine for personal use. If this goes beyond personal use, replace with a tiny serverless proxy (e.g. Netlify Function) holding the key server-side.
- TTS: `SpeechSynthesisUtterance`, `zh-HK` / `zh-CN`, best-voice pick with toast fallback.

## Previously fixed bugs (don't regress)
- Polyfill leaking into in-chat file (progress reset on reopen).
- Stale error toast after successful retry (`hideAudioNote()` on new attempt + on success).
- Fragile JSON parsing.
- iOS tab height mismatch (see rule 3).

## Possible next steps
- Netlify Function proxy for Add/Scan so no key lives on the phone.
- Cantonese listening drills (audio-first, no romanization shown) — core to the user's listening→speaking goal.
- Spaced-repetition scheduling instead of random 8-card sessions.
- Export/import progress JSON (localStorage is per-browser and can be cleared).
- Speaking: optional AI feedback on transcript vs model answer.

## Working style (user: Thomas)
Casual, direct. Concise numbered answers over long prose. Honest, evidence-based; push back when something won't work. Minimal edits that preserve his voice. Prefers interactive things over static output. Mobile-first testing on iPhone.
