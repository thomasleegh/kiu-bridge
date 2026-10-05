// End-to-end checks in a real (headless) browser at iPhone size: node scripts/e2e.mjs
// Each feature's whole loop is exercised, including the state changes a phone goes through
// (offline -> online, no API key, app resumed without an 'online' event, AI failing then recovering).
// The Anthropic API is mocked — no key or network needed. Needs Playwright + Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
for(const p of ['playwright', '/opt/node22/lib/node_modules/playwright']){ try{ playwright = require(p); break; }catch(e){} }
if(!playwright){ console.error('Playwright not found (npm i -g playwright)'); process.exit(1); }
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Tiny static server for the repo root.
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if(p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const browser = await playwright.chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
let failures = 0;
async function test(name, fn){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try{
    await fn(page, ctx);
    if(errors.length) throw new Error('page errors: ' + errors.join(' | '));
    console.log('ok   ' + name);
  }catch(e){
    failures++;
    console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]);
  }finally{ await ctx.close(); }
}
const assert = (cond, msg) => { if(!cond) throw new Error(msg); };
const eventually = async (page, fn, msg, ms = 4000) => {
  const end = Date.now() + ms;
  while(Date.now() < end){ if(await fn()) return; await page.waitForTimeout(100); }
  throw new Error(msg);
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kiu_customWords') || '[]'));
const pending = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kiu_pendingAdds') || '[]'));

async function open(page, { apiKey, progress } = {}){
  await page.addInitScript(([k, p]) => {
    if(k) localStorage.setItem('kiu_apiKey', k);
    if(p) localStorage.setItem('kiu_progress', JSON.stringify(p));
  }, [apiKey, progress]);
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('.topbar');
}
async function openAdd(page){
  await page.click('[data-tab="add"]');
  await page.waitForFunction(() => document.getElementById('dictStatus')?.textContent.includes('ready'), null, { timeout: 15000 });
}
// Mock of the Messages API: replies with a translation, or with an HTTP error while `fail` is set.
function mockAI(page, state = { fail: false, calls: 0 }){
  return page.route('https://api.anthropic.com/**', route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if(route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    state.calls++;
    if(state.fail) return route.fulfill({ status: 500, headers: cors, body: '{}' });
    const t = { type: 'phrase', cChar: '唔該埋單', cRom: 'm4 goi1 maai4 daan1', mChar: '買單', mRom: 'mǎidān', lit: '', note: '' };
    route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(t) }] }) });
  }).then(() => state);
}
// iOS often doesn't fire 'online' for a home-screen app coming back from the background;
// this swallows the event so the app has to notice on its own (when it becomes visible again).
const swallowOnlineEvents = (page) => page.addInitScript(() => {
  window.addEventListener('online', e => e.stopImmediatePropagation(), true);
});
const resume = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
async function queueOffline(page, ctx, text){
  await ctx.setOffline(true);
  await page.fill('#addEng', text);
  await page.click('#addSubmit');
}

// ---------- Add: save-for-later loop ----------
await test('No API key: a word saved offline is added from the offline dictionary', async (page, ctx) => {
  await open(page); await openAdd(page);
  await queueOffline(page, ctx, 'umbrella');
  await eventually(page, async () => (await saved(page)).some(w => w.cChar === '遮' && w.mChar === '雨傘'), 'umbrella never reached Your words');
  assert((await pending(page)).length === 0, 'umbrella still in the waiting list');
  await eventually(page, async () => !/waiting to translate/i.test(await page.innerText('body')), 'waiting section still shown', 1500);
  assert(/your words \(1\)/i.test(await page.innerText('body')), 'Your words count not updated');
});

await test('Item already stuck in the queue from an older version gets added on the next launch', async (page) => {
  await page.addInitScript(() => localStorage.setItem('kiu_pendingAdds', JSON.stringify(['umbrella'])));
  await open(page);
  await eventually(page, async () => (await pending(page)).length === 0 && (await saved(page)).some(w => w.cChar === '遮'), 'stuck item not resolved on launch', 8000);
});

await test('With API key: saved offline, AI-translated after the app resumes online (no "online" event)', async (page, ctx) => {
  const ai = await mockAI(page);
  await swallowOnlineEvents(page);
  await open(page, { apiKey: 'test-key' }); await openAdd(page);
  await queueOffline(page, ctx, 'can I get the check?');
  assert((await pending(page)).length === 1, 'not queued while offline');
  assert(ai.calls === 0, 'called AI while offline');
  await ctx.setOffline(false);
  await resume(page);
  await eventually(page, async () => (await saved(page)).some(w => w.eng === 'can I get the check?' && w.cat === 'Phrases'), 'never translated after resuming online');
  assert((await pending(page)).length === 0, 'still pending after it was added');
});

await test('AI failure keeps the item with a visible reason, then succeeds on the next try', async (page, ctx) => {
  const ai = await mockAI(page, { fail: true, calls: 0 });
  await open(page, { apiKey: 'test-key' }); await openAdd(page);
  await queueOffline(page, ctx, 'can I get the check?');
  await ctx.setOffline(false); await resume(page);
  await eventually(page, async () => ai.calls > 0, 'AI never retried');
  await eventually(page, async () => /couldn.t translate/i.test(await page.innerText('body')), 'no visible reason after the AI failed');
  assert((await pending(page)).length === 1, 'item lost after a failed attempt');
  ai.fail = false; await resume(page);
  await eventually(page, async () => (await pending(page)).length === 0 && (await saved(page)).length === 1, 'not added once the AI recovered');
});

await test('No API key and no dictionary match: item stays, says it needs a key', async (page, ctx) => {
  await open(page); await openAdd(page);
  await queueOffline(page, ctx, 'zqxwv');
  await ctx.setOffline(false); await resume(page);
  await eventually(page, async () => /api key/i.test(await page.textContent('#pendingList').catch(() => '')), 'no reason shown on the waiting item');
  assert((await pending(page)).length === 1, 'item dropped without being added');
});

await test('A word already saved is not added twice', async (page, ctx) => {
  await open(page); await openAdd(page);
  await page.fill('#addEng', 'umbrella'); await page.waitForTimeout(250);
  await page.click('.dict-add[data-i="0"]');
  await queueOffline(page, ctx, 'umbrella');
  await page.waitForTimeout(500);
  assert((await saved(page)).length === 1, 'duplicate umbrella saved');
  assert((await pending(page)).length === 0, 'duplicate left waiting');
});

await test('"Translate with AI" button is a normal size', async (page) => {
  await open(page); await openAdd(page);
  const h = await page.$eval('#addSubmit', b => b.getBoundingClientRect().height);
  assert(h > 30 && h < 60, `button is ${h}px tall`);
});

// ---------- Library ----------
const progress = { w22: { status: 'known' }, w01: { status: 'learning', shakyCount: 2 } };
const rows = (page) => page.$$eval('.lib-row', rs => rs.map(r => ({ eng: r.querySelector('.p-eng').textContent.trim(), dot: r.querySelector('.p-dot').className })));

await test('Library: one alphabetical list of every word, each with a status dot', async (page) => {
  await open(page, { progress });
  await page.click('#progressBtn');
  const r = await rows(page);
  assert(r.length === 65, `expected 65 rows, got ${r.length}`);
  const keys = r.map(x => x.eng.toLowerCase().replace(/^(to|the|a|an) /, ''));
  assert(keys.every((k, i) => i === 0 || keys[i - 1].localeCompare(k) <= 0), 'not alphabetical: ' + keys.slice(0, 8).join(', '));
  assert(r.find(x => x.eng === 'Eat').dot.includes('known'), 'Eat not marked known');
  assert(r.find(x => x.eng === 'Hello').dot.includes('learning'), 'Hello not marked learning');
  assert(r.find(x => x.eng === 'Water').dot.includes('new'), 'Water not marked new');
});

await test('Library search: English, Jyutping, Pinyin (no tones) and characters; keyboard stays up', async (page) => {
  await open(page, { progress });
  await page.click('#progressBtn');
  for(const [q, want] of [['eat', 'Eat'], ['sik6', 'Eat'], ['chi', 'Eat'], ['食', 'Eat'], ['tomorrow', 'Tomorrow'], ['ting1 jat6', 'Tomorrow']]){
    await page.fill('#libSearch', q); await page.waitForTimeout(150);
    const r = await rows(page);
    assert(r.some(x => x.eng === want), `"${q}" didn't find ${want} (got ${r.map(x => x.eng).join(', ') || 'nothing'})`);
  }
  await page.fill('#libSearch', ''); await page.click('#libSearch'); await page.keyboard.type('wat', { delay: 30 });
  assert(await page.evaluate(() => document.activeElement.id) === 'libSearch', 'search box lost focus while typing');
  assert((await rows(page)).every(x => /wat/i.test(x.eng)), 'search results include non-matches');
});

await test('Library filters agree with the home stats (Known / Learning taps)', async (page) => {
  await open(page, { progress });
  const knownStat = (await page.textContent('#statKnown .n')).split('/')[0];
  const learningStat = await page.textContent('#statLearning .n');
  await page.click('#statKnown');
  let r = await rows(page);
  assert(String(r.length) === knownStat && r.every(x => x.dot.includes('known')), `Known stat ${knownStat} vs ${r.length} rows`);
  await page.click('.session-top .icon-btn');
  await page.click('#statLearning');
  r = await rows(page);
  assert(String(r.length) === learningStat && r.every(x => x.dot.includes('learning')), `Learning stat ${learningStat} vs ${r.length} rows`);
});

await test('Library includes words you added', async (page) => {
  await open(page); await openAdd(page);
  await page.fill('#addEng', 'umbrella'); await page.waitForTimeout(250);
  await page.click('.dict-add[data-i="0"]');
  await page.click('#progressBtn');
  await page.fill('#libSearch', 'umbrella'); await page.waitForTimeout(150);
  const r = await rows(page);
  assert(r.length === 1 && r[0].dot.includes('new'), 'added word missing from library');
});

// ---------- Offline start ----------
await test('Offline relaunch: app opens from cache and the dictionary still works', async (page, ctx) => {
  await open(page); await openAdd(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('.topbar');
  await openAdd(page);
  await page.fill('#addEng', 'tomorrow'); await page.waitForTimeout(250);
  assert((await page.textContent('.dict-card')).includes('ting1 jat6'), 'no offline result');
});

await browser.close(); server.close();
console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
