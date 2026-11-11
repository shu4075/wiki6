// お題（PAIRS）と「ランダム」用の言葉（WORDS）の記事が日本語版Wikipediaに本当にあるか調べるスクリプト
//
// 使い方（wiki6 フォルダで）：
//   node scripts/check-pairs.mjs
//
// index.html の中の PAIRS を読み取り、記事名を Wikipedia API に問い合わせる。
// Wikipedia に負担をかけないよう、20件ずつまとめて聞き、1回ごとに2秒あける。
// 「アクセスが多すぎ（429）」と言われたら、言われた時間だけ待ってやり直す。
//
// 結果の見かた：
//   OK    … そのままの名前で記事がある
//   転送  … 別の名前に転送される。→ の右側の正式名に直すとよい
//   曖昧  … 曖昧さ回避ページ（同じ名前のものの一覧ページ）。別の記事名にする
//   なし  … 記事が見つからない。差し替える
//   簡単すぎ … お題のスタートの記事にゴールへのリンクがあり、1歩で着いてしまう。差し替える
//   （「ランダム」の組み合わせは、遊ぶときにゲームの中で同じ確認をして選び直している）

import { readFileSync } from 'node:fs';

const API = 'https://ja.wikipedia.org/w/api.php';
const BATCH = 20;
const WAIT_MS = 2000;

// index.html から PAIRS の部分だけを取り出す
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/const PAIRS = (\[[\s\S]*?\]);/);
if (!m) { console.error('index.html に PAIRS が見つかりません'); process.exit(1); }
const PAIRS = JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]$/, ']'));
// 「ランダム」用の WORDS も一緒に調べる（// のコメント行は読み飛ばす）
const w = html.match(/const WORDS = (\[[\s\S]*?\]);/);
const WORDS = w ? [...w[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(x => x[1]) : [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2' })) u.searchParams.set(k, v);
  for (let tries = 0; tries < 5; tries++) {
    const r = await fetch(u, { headers: { 'User-Agent': 'wiki6-check-pairs/1.0 (small puzzle checker; runs rarely)' } });
    if (r.status === 429) {
      const wait = (Number(r.headers.get('retry-after')) || 30) * 1000;
      console.log(`  …アクセスが多すぎると言われたので ${wait / 1000} 秒待ちます`);
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  throw new Error('何度やっても 429 でした。しばらく時間をおいてください');
}

// 記事名のまとまりを調べて、{ 元の名前: { status, title } } を返す
async function checkBatch(titles) {
  const j = await api({ action: 'query', titles: titles.join('|'), redirects: 1, prop: 'pageprops', ppprop: 'disambiguation' });
  const q = j.query;
  const rename = new Map();
  for (const n of q.normalized || []) rename.set(n.from, n.to);
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

const titles = [...new Set([...PAIRS.flat(), ...WORDS])];
console.log(`お題${PAIRS.length}組＋ランダム用${WORDS.length}語（重なりを除いて${titles.length}記事）を調べます\n`);

const results = {};
for (let i = 0; i < titles.length; i += BATCH) {
  Object.assign(results, await checkBatch(titles.slice(i, i + BATCH)));
  if (i + BATCH < titles.length) await sleep(WAIT_MS);
}

const bad = [];
for (const t of titles) {
  const res = results[t];
  const line = res.status === 'OK' ? `OK    ${t}` : `${res.status}  ${t}${res.title ? ' → ' + res.title : ''}`;
  console.log(line);
  if (res.status !== 'OK') bad.push(line);
}

// お題が簡単すぎないか：スタートの記事にゴールへの直接リンク（転送ページへのリンクも含む）があると1歩で着いてしまう
// 組ごとに2〜4回問い合わせるので、1組ごとに2秒あける
async function isOneStep(start, goal) {
  const r = await api({ action: 'query', titles: goal, redirects: 1, prop: 'redirects', rdnamespace: 0, rdlimit: 'max' });
  const p = r.query.pages[0];
  if (!p || p.missing) return false;
  const names = [p.title, ...(p.redirects || []).map(x => x.title)];
  for (let i = 0; i < names.length && i < 150; i += 50) {
    const j = await api({ action: 'query', titles: start, redirects: 1, prop: 'links', plnamespace: 0, pllimit: 'max', pltitles: names.slice(i, i + 50).join('|') });
    const s = j.query.pages[0];
    if (s && s.links && s.links.length) return true;
  }
  return false;
}
console.log(`\nお題${PAIRS.length}組が簡単すぎないか（1歩で着かないか）調べます`);
for (const [s, g] of PAIRS) {
  if (results[s].status !== 'OK' || results[g].status !== 'OK') continue;
  if (await isOneStep(s, g)) {
    const line = `簡単すぎ  ${s} → ${g}（1歩で着く）`;
    console.log(line); bad.push(line);
  }
  await sleep(WAIT_MS);
}
console.log('\n' + (bad.length ? `直したほうがいいもの：${bad.length}件\n` + bad.join('\n') : 'すべてOK！'));
process.exit(bad.length ? 1 : 0);
