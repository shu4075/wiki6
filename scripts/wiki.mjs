// チェック用スクリプト（check-pairs.mjs / make-random-pairs.mjs）で共通に使う部分
//
// ・Wikipedia API への問い合わせ（「アクセスが多すぎ（429）」なら待ってやり直す）
// ・index.html から PAIRS などのリストを読み取る
// ・お題の「2歩の道の数」を数える（＝お題が簡単すぎないかの判定）

import { readFileSync } from 'node:fs';

const API = 'https://ja.wikipedia.org/w/api.php';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2' })) u.searchParams.set(k, v);
  for (let tries = 0; tries < 6; tries++) {
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

// index.html の中の `const 名前 = [ ... ];` を読み取る（// のコメントは読み飛ばす）
export function readList(name) {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!m) return null;
  const body = m[1].replace(/\/\/.*$/gm, '').replace(/'/g, '"').replace(/,(\s*\])/g, '$1');
  return JSON.parse(body);
}

// お題の難しさを調べる。
//   返り値 { n: -1 }        … 1歩で着く（スタートにゴールへのリンクがある）
//   返り値 { n: 0〜3, via } … 2歩で着く道が n 本（via は途中の記事）。3本以下なら「難しい」として使う
//   返り値 { n: 4以上 }     … 2歩で着く道が4本以上ある＝簡単すぎ（4本見つけた時点で数えるのをやめる）
// ゴールへの転送ページ（例：「モーツァルト」）へのリンクも、ゴールへのリンクとして数える。
export const MAX_ROUTES = 3;
export async function countRoutes(start, goal, gapMs = 1000) {
  const r = await api({ action: 'query', titles: goal, redirects: 1, prop: 'redirects', rdnamespace: 0, rdlimit: 'max' });
  const p = r.query.pages[0];
  const names = [p.title, ...(p.redirects || []).map(x => x.title)].slice(0, 50).join('|');
  await sleep(gapMs);
  const one = await api({ action: 'query', titles: start, redirects: 1, prop: 'links', plnamespace: 0, pllimit: 'max', pltitles: names });
  if (one.query.pages[0].links?.length) return { n: -1 };
  // スタートからリンクしている記事を500件ずつ取り出し、その中にゴールへリンクしている記事があるか調べる
  const via = new Set();
  let cont = {};
  for (let i = 0; i < 60; i++) {
    await sleep(gapMs);
    const j = await api({ action: 'query', generator: 'links', titles: start, redirects: 1, gplnamespace: 0, gpllimit: 'max', prop: 'links', pllimit: 'max', pltitles: names, ...cont });
    for (const q of j.query?.pages || []) if (q.links?.length) via.add(q.title);
    if (via.size > MAX_ROUTES) return { n: via.size };
    if (!j.continue) break;
    cont = { ...j.continue };
  }
  return { n: via.size, via: [...via] };
}
