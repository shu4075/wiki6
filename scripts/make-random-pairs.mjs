// 「ランダム」用のお題リスト（index.html の RANDOM_PAIRS）を作るスクリプト
//
// 使い方（wiki6 フォルダで）：
//   node scripts/make-random-pairs.mjs        … 80組つくる
//   node scripts/make-random-pairs.mjs 120    … 120組つくる
//
// 下の WORDS（誰でも知っている言葉）から2つを選び、難しさを調べて、
// 「1歩では着かない」かつ「2歩で着く道が3本以下」の組だけを集める。
// 集まったら index.html の RANDOM_PAIRS を書きかえる（前のリストは消える）。
//
// 知っている言葉どうしだと、多くの組み合わせが2歩で着いてしまう（使えるのは半分くらい）。
// 遊ぶたびに調べると Wikipedia への問い合わせが多くなりすぎるので、前もって調べておく。
// Wikipedia に1秒に1回くらいずつ聞くので、80組で数十分かかる。
// 同じ言葉ばかりにならないよう、1つの言葉は3回までしか使わない。

import { readFileSync, writeFileSync } from 'node:fs';
import { countRoutes, sleep } from './wiki.mjs';

const WORDS = [
  // 食べもの・飲みもの
  'たこ焼き', 'ラーメン', '寿司', '納豆', 'カレーライス', 'コーヒー', 'チョコレート', 'アイスクリーム', 'ハンバーガー', '醤油',
  '日本酒', 'うどん', '味噌汁', 'おにぎり', '天ぷら', 'ピザ', 'パスタ', '緑茶', 'ビール', 'ワイン', 'トマト', 'リンゴ', 'バナナ', 'イチゴ', '豆腐',
  // 生きもの
  'ネコ', 'イヌ', 'ペンギン', 'ジャイアントパンダ', 'ニワトリ', 'カブトムシ', 'ライオン', 'ゾウ', 'キリン', 'イルカ', 'クジラ', 'サメ',
  'ウサギ', 'カラス', 'ミツバチ', 'アリ', 'ティラノサウルス', '恐竜', 'サクラ', 'ヒマワリ', 'タンポポ',
  // 場所・建物
  '富士山', '東京タワー', '東京スカイツリー', '渋谷', '京都市', '大阪市', '北海道', '沖縄県', '鹿苑寺', '厳島神社',
  'アメリカ合衆国', 'フランス', 'イタリア', 'エジプト', 'ブラジル', 'オーストラリア', '南極大陸', 'エベレスト', 'ピラミッド', 'エッフェル塔', '万里の長城', 'アマゾン川',
  // 宇宙・自然
  '月', '太陽', '火星', '地球', '土星', 'ブラックホール', 'ビッグバン', '雪', '雷', '虹', '台風', '地震', '火山', '温泉',
  // 歴史・人物
  '織田信長', '徳川家康', '豊臣秀吉', '江戸時代', '忍者', '侍', '古代エジプト', 'ローマ帝国', '第二次世界大戦',
  'ヴォルフガング・アマデウス・モーツァルト', 'ウィリアム・シェイクスピア', 'アルベルト・アインシュタイン', 'ナポレオン・ボナパルト', 'レオナルド・ダ・ヴィンチ', 'ビートルズ',
  // 乗りもの・道具・技術
  '新幹線', '自転車', '飛行機', 'ロケット', '国際宇宙ステーション', 'コンピュータ', 'インターネット', 'スマートフォン', 'ロボット', '鉛筆', '時計', '電話', 'テレビ', 'カメラ', '原子力発電',
  // 遊び・文化・スポーツ
  '野球', 'サッカー', '相撲', '将棋', '囲碁', '近代オリンピック', 'カラオケ', '折り紙', 'アニメーション', '漫画', 'ピアノ', 'ギター', '映画', '歌舞伎', '柔道', 'テニス', 'マラソン',
  // くらし・学び
  '炬燵', '和服', '傘', '学校', '病院', '図書館', '郵便', 'お金', '数学', '量子力学', '音楽', '絵画', '夏目漱石',
];
const MAX_USE = 3;
const want = Number(process.argv[2]) || 80;

const good = [];
const used = {};
const tried = new Set();
const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
while (good.length < want && tried.size < want * 6) {
  const s = pick(), g = pick();
  if (s === g || tried.has(s + '|' + g) || (used[s] || 0) >= MAX_USE || (used[g] || 0) >= MAX_USE) continue;
  tried.add(s + '|' + g);
  const r = await countRoutes(s, g);
  const ok = r.n >= 0 && r.n <= 3;
  console.log(`${ok ? '◯' : '×'} ${s} → ${g}（${r.n < 0 ? '1歩で着く' : '2歩の道' + r.n + '本' + (r.n > 3 ? '以上' : '')}）  ${good.length + (ok ? 1 : 0)}/${want}`);
  if (ok) { good.push([s, g]); used[s] = (used[s] || 0) + 1; used[g] = (used[g] || 0) + 1; }
  await sleep(1000);
}

// index.html の RANDOM_PAIRS を書きかえる（4組ずつ1行）
const lines = [];
for (let i = 0; i < good.length; i += 4) lines.push('  ' + good.slice(i, i + 4).map(([s, g]) => `['${s}', '${g}']`).join(', ') + ',');
const file = new URL('../index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const next = html.replace(/const RANDOM_PAIRS = \[[\s\S]*?\n\];/, `const RANDOM_PAIRS = [\n${lines.join('\n')}\n];`);
writeFileSync(file, next);
console.log(`\n${good.length}組を index.html の RANDOM_PAIRS に書きこみました`);
