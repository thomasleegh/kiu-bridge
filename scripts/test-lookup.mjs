// Checks the offline lookup in index.html against dict.json: node scripts/test-lookup.mjs
// Evals the <offline-dict> block exactly as the app ships it, so this tests the real code.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const block = html.slice(html.indexOf('// <offline-dict>'), html.indexOf('// </offline-dict>'));
const OfflineDict = new Function(block + '\nreturn OfflineDict;')();
OfflineDict.setData(JSON.parse(fs.readFileSync(path.join(root, 'dict.json'), 'utf8')));

// [query, expected Cantonese chars, expected Mandarin chars] for the top result.
const CASES = [
  // hand-checked pairs (Cantonese and Mandarin differ)
  ['eat', '食', '吃'], ['to eat', '食', '吃'], ['Look', '睇', '看'], ['he', '佢', '他'], ['like', '鍾意', '喜歡'],
  ['now', '而家', '現在'], ['tomorrow', '聽日', '明天'], ['how much?', '幾多錢', '多少錢'], ['thank you', '多謝', '謝謝'],
  // everything else: same word, both readings
  ['water', '水', '水'], ['receipt', '收據', '收據'], ['computer', '電腦', '電腦'], ['airport', '機場', '機場'],
  ['hospital', '醫院', '醫院'], ['dog', '狗', '狗'], ['beef', '牛肉', '牛肉'], ['coffee', '咖啡', '咖啡'],
  ['weather', '天氣', '天氣'], ['birthday', '生日', '生日'], ['green', '綠色', '綠色'], ['cup', '杯', '杯'], ['phone', '電話', '電話'], ['rice', '飯', '米飯'],
  ['teacher', '老師', '老師'], ['expensive', '貴', '貴'], ['station', null, null], ['menu', '菜單', '菜單'],
  // Chinese input
  ['食', '食', '吃'], ['吃', '食', '吃'], ['佢哋', '佢哋', '他們'], ['唔該', '唔該', '麻煩你'], ['電話', '電話', '電話'],
  ['我想食飯', '我想食飯', '我想吃飯'], ['佢鍾意睇書', '佢鍾意睇書', '他喜歡看書'], ['我走先', '我走先', '我走先'], ['佢喺邊度', '佢喺邊度', '他在哪裡'], ['我們明天去吃飯', '我哋聽日去食飯', '我們明天去吃飯'],
  ['食物', '食物', '食物'], ['你好', '你好', '你好'],
];
let fail = 0;
for(const [q, c, m] of CASES){
  const t0 = performance.now();
  const res = OfflineDict.search(q);
  const ms = (performance.now() - t0).toFixed(1);
  const top = res[0];
  const got = top ? `${top.cChar} ${top.cRom} | ${top.mChar} ${top.mRom}` : '(none)';
  const ok = top && (c === null || top.cChar === c) && (m === null || top.mChar === m);
  if(!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${q.padEnd(10)} -> ${got}   [${res.length} results, ${ms}ms]${ok ? '' : `  expected ${c} | ${m}`}`);
}
console.log(fail ? `${fail} failing` : 'all passing');
process.exit(fail ? 1 : 0);
