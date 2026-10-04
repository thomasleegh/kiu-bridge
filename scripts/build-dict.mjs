// Builds dict.json — the offline English ↔ Cantonese/Mandarin dictionary the app
// lazy-loads for Add. Run: node scripts/build-dict.mjs <src-dir>
//
// <src-dir> must contain (see README "Rebuilding the offline dictionary"):
//   cedict.json          CC-CEDICT as JSON (npm: cedict-json)            CC BY-SA 4.0
//   cccanto-webdist.txt  CC-CANTO (github.com/amadeusine/cc-canto-data)  CC BY-SA 3.0
//   hkcancor_freq.json   word counts from HKCanCor (pip: pycantonese)    CC BY 4.0
//   jieba-dict.txt       jieba's word-frequency list (pip: jieba)        MIT
//   to-jyutping.mjs      dist/index.mjs from npm: to-jyutping            BSD-2-Clause
//
// Output row: [trad, simp|"", pinyin, jyutping, glosses joined by "/", mandoFreq, cantoFreq, flags]
//   freqs are log2(count+1), rounded; flags bit 1 = Cantonese-only word, bit 2 = rare/literary/regional.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = process.argv[2];
if(!SRC){ console.error('usage: node scripts/build-dict.mjs <src-dir>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dict.json');
const { getJyutpingText } = await import(pathToFileURL(path.join(SRC, 'to-jyutping.mjs')));

const jieba = new Map();
for(const line of fs.readFileSync(path.join(SRC, 'jieba-dict.txt'), 'utf8').split('\n')){
  const [w, n] = line.split(' ');
  if(w) jieba.set(w, +n);
}
const hk = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(SRC, 'hkcancor_freq.json'), 'utf8'))));
const q = (n) => n ? Math.round(Math.log2(n + 1)) : 0;

// Characters that only exist in written Cantonese — a word containing one is never Mandarin.
const CANTO_CHARS = /[嘅咗嚟啲冇喺嘢佢哋睇咩乜噉嗰唔嘞喎㗎啩嚿揾搵咁冚攞嘥嚡瞓諗𠵱𢳂嬲氹靚咪掂嗱噏咋嘛嚕呃嘈攰癐踎擰揼掟㩒孭褸嘢]/;
const CANTO_GLOSS = /\(Cantonese\)|Cantonese:/;
const RARE_GLOSS = /\((literary|archaic|old|classical|Tw|dialect|Taiwan|Hokkien|Wu|Shanghainese|Hakka|Teochew|loanword from Japanese)\)/i;
const JUNK_GLOSS = /^(surname |(old |archaic |ancient )?variant of|see |used in |CL:|abbr\. for|Japanese variant|erhua variant|\(Buddhism\)|\(TCM\)|\(chemistry\)|\(zoology\)|\(botany\)|\(medicine\)|\(math\.?\)|\(physics\)|\(geology\)|\(computing\)|\(Chinese medicine\))/i;

const TONE_MARKS = { a:'āáǎàa', e:'ēéěèe', i:'īíǐìi', o:'ōóǒòo', u:'ūúǔùu', 'ü':'ǖǘǚǜü' };
function markSyllable(syl){
  const m = syl.match(/^([a-zü:]+?)([1-5])$/i);
  if(!m) return syl;
  let [, base, tone] = m;
  base = base.replace(/u:|v/g, 'ü');
  const t = +tone - 1;
  const lower = base.toLowerCase();
  let idx = lower.search(/[ae]/);
  if(idx === -1) idx = lower.indexOf('ou');
  if(idx === -1){ // last vowel
    for(let i = lower.length - 1; i >= 0; i--) if('iouü'.includes(lower[i])){ idx = i; break; }
  }
  if(idx === -1) return base;
  const v = lower[idx];
  let marked = TONE_MARKS[v][t];
  if(base[idx] !== v) marked = marked.toUpperCase();
  return base.slice(0, idx) + marked + base.slice(idx + 1);
}
// "xie4 xie5" -> "xièxie" (one word, apostrophe before a vowel-initial syllable, like the built-in vocab)
function toPinyin(numbered){
  return numbered.trim().split(/\s+/).map((s, i) => {
    const m = markSyllable(s);
    return (i > 0 && /^[aeoāáǎàēéěèōóǒò]/i.test(m)) ? "'" + m : m;
  }).join('').replace(/,/g, ', ');
}
const isHan = (s) => /^[㐀-鿿豈-﫿\u{20000}-\u{2ffff}]+$/u.test(s);

function cleanGlosses(list){
  return list.map(g => g.replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim())
    .filter(g => g && !JUNK_GLOSS.test(g) && !/^Mandarin equivalent/.test(g) && g.length <= 90);
}

const byKey = new Map(); // trad|pinyin -> row
function add(t, s, py, jp, glosses, flags){
  const key = t + '|' + py;
  const ex = byKey.get(key);
  if(ex){
    for(const g of glosses) if(!ex.g.includes(g)) ex.g.push(g);
    ex.flags |= flags;
    if(!ex.j && jp) ex.j = jp;
    return;
  }
  byKey.set(key, { t, s, p: py, j: jp, g: [...glosses], flags });
}

// CC-CANTO: Cantonese-only vocabulary (with its own Jyutping).
const cantoRows = [];
for(const line of fs.readFileSync(path.join(SRC, 'cccanto-webdist.txt'), 'utf8').split('\n')){
  const m = line.match(/^(\S+) (\S+) \[([^\]]*)\] \{([^}]*)\} \/(.*)\/(?:\s*#.*)?$/);
  if(!m) continue;
  const [, t, s, py, jp, gl] = m;
  if(!isHan(t)) continue;
  cantoRows.push({ t, s, py, jp, gl: gl.split('/') });
}

const cedict = JSON.parse(fs.readFileSync(path.join(SRC, 'cedict.json'), 'utf8'));
const MIN_MANDO = +(process.env.MIN_MANDO || 60);  // jieba count — keeps everyday vocabulary, drops the long tail
for(const e of cedict){
  const t = e.traditional, s = e.simplified;
  if(!isHan(t) || /^[A-Z]/.test(e.pinyin)) continue; // skip proper nouns
  const glosses = cleanGlosses(e.english);
  if(!glosses.length) continue;
  const mCount = jieba.get(s) || 0, cCount = hk.get(t) || 0;
  const cantoOnly = CANTO_GLOSS.test(e.english.join('/')) || CANTO_CHARS.test(t);
  if(mCount < MIN_MANDO && cCount === 0 && !cantoOnly) continue;
  let flags = cantoOnly ? 1 : 0;
  if(!cantoOnly && glosses.every(g => RARE_GLOSS.test(g))) flags |= 2;
  // to-jyutping picks the everyday reading (食 sik6, 看 hon3); CC-CANTO's first-listed reading is often a rare one.
  const jp = getJyutpingText(t);
  add(t, s === t ? '' : s, toPinyin(e.pinyin), jp, glosses.map(g => g.replace(CANTO_GLOSS, '').replace(/\s+/g,' ').trim()).filter(Boolean), flags);
}
// Cantonese-only entries CC-CEDICT lacks: keep the ones people actually say (in HKCanCor) or written in Cantonese-only characters.
const haveTrad = new Set([...byKey.values()].map(r => r.t));
for(const r of cantoRows){
  if(haveTrad.has(r.t) && !(hk.get(r.t) > 0)) continue;
  const cCount = hk.get(r.t) || 0;
  if(cCount === 0 && !CANTO_CHARS.test(r.t)) continue;
  const glosses = cleanGlosses(r.gl).map(g => g.replace(CANTO_GLOSS, '').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(!glosses.length) continue;
  add(r.t, r.s === r.t ? '' : r.s, toPinyin(r.py), r.jp, glosses, CANTO_CHARS.test(r.t) ? 1 : 0);
}

// Hand-checked Cantonese/Mandarin pairs (scripts/canto-mando-pairs.txt). A reading can be pinned with "字 [reading]".
const pinyinOf = new Map();
for(const e of cedict){
  if(!isHan(e.traditional) || /^[A-Z]/.test(e.pinyin)) continue;
  const n = jieba.get(e.simplified) || 0;
  const ex = pinyinOf.get(e.traditional);
  if(!ex || n > ex.n) pinyinOf.set(e.traditional, { p: toPinyin(e.pinyin), n });
}
// Pinyin for a word CC-CEDICT lacks as a whole (多少錢): longest known pieces, space-separated.
function pinyinFor(word){
  if(pinyinOf.has(word)) return pinyinOf.get(word).p;
  const out = [];
  for(let i = 0; i < word.length;){
    let len = word.length - i;
    while(len > 0 && !pinyinOf.has(word.slice(i, i + len))) len--;
    if(!len) return null;
    out.push(pinyinOf.get(word.slice(i, i + len)).p); i += len;
  }
  return out.join(' ');
}
const pairs = [];
const pairFile = path.join(path.dirname(new URL(import.meta.url).pathname), 'canto-mando-pairs.txt');
for(const line of fs.readFileSync(pairFile, 'utf8').split('\n')){
  if(!line.trim() || line.startsWith('#')) continue;
  const [eng, canto, mando] = line.split('|').map(x => x.trim());
  const [, c, cPin] = canto.match(/^(\S+)(?:\s*\[(.+)\])?$/);
  const [, m, mPin] = mando.match(/^(\S+)(?:\s*\[(.+)\])?$/);
  const jp = cPin || getJyutpingText(c);
  const py = mPin || pinyinFor(m);
  if(!py || /[^a-z0-9 ]/.test(jp)) throw new Error(`no reading for pair: ${line}`);
  pairs.push([eng.split(',').map(x => x.trim()), c, jp, m, py]);
}

const rows = [...byKey.values()].map(r => {
  const simp = r.s || r.t;
  // HKCanCor counts characters, not readings: 噉 is counted as gam2 ("like that"), so its rare daam6
  // "to eat" entry mustn't inherit that count. Only the everyday reading gets the Cantonese frequency.
  const cf = r.j === getJyutpingText(r.t) ? q(hk.get(r.t)) : 0;
  return [r.t, r.s, r.p, r.j, r.g.slice(0, 4).join('/'), q(jieba.get(simp)), cf, r.flags];
});
fs.writeFileSync(OUT, JSON.stringify({ v: 1, pairs, rows }));
console.log(`wrote ${rows.length} entries + ${pairs.length} pairs, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${OUT}`);
