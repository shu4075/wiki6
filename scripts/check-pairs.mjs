// お題（PAIRS）と「ランダム」用のお題（RANDOM_PAIRS）を調べるスクリプト
//
// 使い方（wiki6 フォルダで）：
//   node scripts/check-pairs.mjs          … 記事があるか ＋ PAIRS が簡単すぎないか
//   node scripts/check-pairs.mjs --all    … RANDOM_PAIRS が簡単すぎないかも調べる（時間がかかる）
//
// Wikipedia に負担をかけないよう、まとめて聞ける所はまとめ、1回ごとに間をあける。
// 「アクセスが多すぎ（429）」と言われたら、言われた時間だけ待ってやり直す。
//
// 結果の見かた：
//   OK       … そのままの名前で記事がある
//   転送     … 別の名前に転送される。→ の右側の正式名に直すとよい
//   曖昧     … 曖昧さ回避ページ（同じ名前のものの一覧ページ）。別の記事名にする
//   なし     … 記事が見つからない。差し替える
//   簡単すぎ … 1歩で着く、または2歩で着く道が4本以上ある。差し替える
//              （2歩で着いても、道が3本以下なら見つけにくいので「難しい」として残す）

import { api, readList, countRoutes, sleep, MAX_ROUTES } from './wiki.mjs';

const BATCH = 20;
const PAIRS = readList('PAIRS') || [];
const RANDOM_PAIRS = readList('RANDOM_PAIRS') || [];
const checkAll = process.argv.includes('--all');

// 記事名のまとまりを調べて、{ 元の名前: { status, title } } を返す
async function checkBatch(titles) {
  const j = await api({ action: 'query', titles: titles.join('|'), redirects: 1, prop: 'pageprops', ppprop: 'disambiguation' });
  const q = j.query;
  const rename = new Map((q.normalized || []).map(n => [n.from, n.to]));
  const redirect = new Map((q.redirects || []).map(r => [r.from, r.to]));
  const pages = new Map(q.pages.map(p => [p.title, p]));
  const out = {};
  for (const t of titles) {
    let name = rename.get(t) || t;
    const wasRedirect = redirect.has(name);
    name = redirect.get(name) || name;
    const p = pages.get(name);
    if (!p || p.missing || p.invalid) out[t] = { status: 'なし' };
    else if (p.pageprops && 'disambiguation' in p.pageprops) out[t] = { status: '曖昧', title: p.title };
    else if (wasRedirect || p.title !== t) out[t] = { status: '転送', title: p.title };
    else out[t] = { status: 'OK' };
  }
  return out;
}

const titles = [...new Set([...PAIRS.flat(), ...RANDOM_PAIRS.flat()])];
console.log(`お題${PAIRS.length}組＋ランダム用${RANDOM_PAIRS.length}組（記事${titles.length}個）があるか調べます\n`);
const results = {};
for (let i = 0; i < titles.length; i += BATCH) {
  Object.assign(results, await checkBatch(titles.slice(i, i + BATCH)));
  await sleep(2000);
}
const bad = [];
for (const t of titles) {
  const res = results[t];
  if (res.status === 'OK') continue;
  const line = `${res.status}  ${t}${res.title ? ' → ' + res.title : ''}`;
  console.log(line); bad.push(line);
}
if (!bad.length) console.log('記事はすべてOK');

const targets = checkAll ? [...PAIRS, ...RANDOM_PAIRS] : PAIRS;
console.log(`\n${targets.length}組が簡単すぎないか調べます（2歩の道が${MAX_ROUTES}本以下ならOK）`);
for (const [s, g] of targets) {
  if (results[s].status !== 'OK' || results[g].status !== 'OK') continue;
  const r = await countRoutes(s, g);
  const what = r.n < 0 ? '1歩で着く' : r.n > MAX_ROUTES ? `2歩の道が${r.n}本以上` : `2歩の道${r.n}本${r.n ? '（' + r.via.join('・') + '）' : ''}`;
  if (r.n < 0 || r.n > MAX_ROUTES) { const line = `簡単すぎ  ${s} → ${g}（${what}）`; console.log(line); bad.push(line); }
  else console.log(`OK  ${s} → ${g}（${what}）`);
  await sleep(1000);
}

console.log('\n' + (bad.length ? `直したほうがいいもの：${bad.length}件\n` + bad.join('\n') : 'すべてOK！'));
process.exit(bad.length ? 1 : 0);
