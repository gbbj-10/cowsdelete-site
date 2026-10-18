// 검색엔진용 정적 페이지 만들기 — GitHub Actions 가 30분마다 실행 (Node 20+, 외부 패키지 없음)
//  · /p/<글>/   엔지니어 갤러리 글 (본문 + 댓글)
//  · /s/<항목>/ 공유 블록·도면
//  · /r/<요청>/ 요청 게시판 글
//  · /sitemap.xml
// 공개 읽기 권한(RLS)으로 보이는 것만 씀. 지워지거나 숨겨진 글의 페이지는 지운다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://cowsdelete.com';
const cfg = fs.readFileSync(path.join(ROOT, 'assets/config.js'), 'utf8');
const URL_ = process.env.SB_URL || /supabaseUrl:\s*'([^']+)'/.exec(cfg)[1];
const KEY = /supabaseKey:\s*'([^']+)'/.exec(cfg)[1];

const GAL = { mech: '기계', arch: '건축', civil: '토목', elec: '전기·전자', plant: '플랜트·배관', cad: 'CAD·도면', license: '자격증·취업', office: '회사생활', humor: '유머', worry: '고민' };
const GRADE = ['', '기능사', '산업기사', '기사', '기술사', '명장'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = t => esc(t).replace(/https?:\/\/[^\s<>"']+/g, u => `<a href="${u}" target="_blank" rel="nofollow ugc noopener">${u}</a>`);
const pad = n => String(n).padStart(2, '0');
const kst = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const snip = (t, n = 150) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const gi = (g, size = 18) => { g = Math.min(5, Math.max(1, g | 0 || 1)); return `<img class="gr" src="/assets/grade/g${g}.png" srcset="/assets/grade/g${g}.png 1x, /assets/grade/g${g}@2x.png 2x" width="${size}" height="${size}" alt="${GRADE[g]}" title="${GRADE[g]}">`; };
const jsonld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

async function all(table, select, filter = '') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' }
    });
    if (!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function page({ title, desc, canonical, body, head = '', tail = '', css = '' }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/og.jpg">
<link rel="icon" href="/assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Nanum+Gothic+Coding:wght@400;700&display=swap">
<link rel="stylesheet" href="/assets/site.css?v=20261018b">
<link rel="stylesheet" href="/assets/board.css?v=20261018b">${css}
${head}
</head>
<body>
<header class="site-top"><div class="wrap">
  <a class="brand" href="/" aria-label="카우스 소거법 홈"><img src="/assets/logo.jpg" alt=""><span class="bt">카우스 소거법<small>Development Storage</small></span></a>
  <nav class="site-nav">
    <a href="/cad/">무카 CAD</a>
    <a href="/community/" aria-current="page">커뮤니티</a>
    <span class="who" data-who></span>
  </nav>
</div></header>
<main>
${body}
</main>
<footer class="titleblock"><div class="wrap">
  <div class="tb">
    <div><span class="h">도명</span>카우스 소거법, 소처럼 일하는 흑우들을 없애자</div>
    <div><span class="h">커뮤니티</span><a href="/community/">블록·도면</a> / <a href="/board/">갤러리</a> / <a href="/requests/">요청</a></div>
    <div><span class="h">안내</span><a href="/beta/">베타 이용 안내</a><br><a href="/privacy/">개인정보처리방침</a></div>
    <div><span class="h">채널</span><a href="https://www.youtube.com/@cowsdelete" target="_blank" rel="noopener">YouTube @cowsdelete</a></div>
  </div>
</div></footer>
<script src="/assets/config.js?v=20261018b"></script>
<script src="/assets/vendor/supabase.js"></script>
<script src="/assets/site.js?v=20261018b"></script>
${tail}
</body>
</html>
`;
}
const tabs = cur => `<div class="wrap" style="padding-top:22px"><nav class="ctabs" aria-label="커뮤니티">${[['/community/', '블록·도면 공유'], ['/board/', '엔지니어 갤러리'], ['/requests/', '요청']].map(([h, n]) => `<a href="${h}"${h === cur ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav></div>`;
const chips = cur => `<nav class="gchips" aria-label="갤러리"><a href="/board/">전체</a>${Object.entries(GAL).map(([s, n]) => `<a href="/board/?g=${s}"${s === cur ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;

function write(rel, html) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === html) return false;
  fs.writeFileSync(f, html); return true;
}
function prune(dir, keep) {
  const d = path.join(ROOT, dir); if (!fs.existsSync(d)) return 0; let n = 0;
  for (const name of fs.readdirSync(d)) if (!keep.has(name)) { fs.rmSync(path.join(d, name), { recursive: true, force: true }); n++; }
  return n;
}

const posts = await all('board_posts', 'id,gallery,title,body,author_nick,author_grade,likes,comments,created_at,updated_at', '&status=eq.public&order=created_at.desc');
const cmts = posts.length ? await all('board_comments', 'post_id,body,author_nick,author_grade,created_at', '&status=eq.public&order=created_at.asc') : [];
const byPost = new Map(); for (const c of cmts) { if (!byPost.has(c.post_id)) byPost.set(c.post_id, []); byPost.get(c.post_id).push(c); }
const items = await all('shared_items', 'id,kind,title,description,tags,author_nick,author_grade,thumb,copies,likes,created_at,updated_at', '&status=eq.public&order=created_at.desc');
const reqs = await all('requests', 'id,title,body,tags,author_nick,author_grade,bounty,status,answers,created_at,updated_at', '&order=created_at.desc');

let changed = 0;
for (const p of posts) {
  const url = `${SITE}/p/${p.id}/`, g = GAL[p.gallery] || p.gallery, cs = (byPost.get(p.id) || []).slice(0, 200);
  const body = `${tabs('/board/')}
<div class="wrap board" id="board">${chips(p.gallery)}<article class="post">
  <header class="ph"><a class="pgal" href="/board/?g=${p.gallery}">${esc(g)} 갤러리</a><h1>${esc(p.title)}</h1>
    <div class="pm"><span class="au">${gi(p.author_grade)}${esc(p.author_nick)}</span><time datetime="${p.created_at}">${kst(p.created_at)}</time><span>추천 <b>${p.likes}</b></span><span>댓글 ${p.comments}</span></div></header>
  <div class="pb">${linkify(p.body)}</div>
</article>
<section class="cmts" aria-label="댓글"><h2>댓글 ${cs.length}</h2><div id="clist">${cs.map(c => `<div class="cmt"><span class="ca">${gi(c.author_grade, 16)}${esc(c.author_nick)}</span><div class="cb">${linkify(c.body)}</div><span class="cd">${kst(c.created_at)}</span></div>`).join('')}</div></section>
<div class="backrow"><a class="btn line sm" href="/board/?g=${p.gallery}">${esc(g)} 목록</a></div></div>`;
  const ld = jsonld({ '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: p.title, text: snip(p.body, 500), url, datePublished: p.created_at, dateModified: p.updated_at,
    author: { '@type': 'Person', name: p.author_nick }, interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.likes },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comments }], isPartOf: { '@type': 'WebPage', name: `${g} 갤러리`, url: `${SITE}/board/?g=${p.gallery}` } });
  if (write(`p/${p.id}/index.html`, page({ title: `${p.title} — ${g} 갤러리 | 카우스 소거법`, desc: snip(p.body), canonical: url, body, head: ld,
    tail: `<script>window.BOARD_POST_ID=${JSON.stringify(p.id)}</script>\n<script src="/assets/board.js?v=20261018b"></script>` }))) changed++;
}

const thumbOk = t => typeof t === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t) && t.length < 200000;
for (const it of items) {
  const url = `${SITE}/s/${it.id}/`, kind = it.kind === 'block' ? '블록' : '도면';
  const tags = (it.tags || []).map(t => `<span>#${esc(t)}</span>`).join(' ');
  const body = `${tabs('/community/')}
<div class="wrap board"><article class="post">
  <header class="ph"><a class="pgal" href="/community/">공유 ${kind}</a><h1>${esc(it.title)}</h1>
    <div class="pm"><span class="au">${gi(it.author_grade)}${esc(it.author_nick)}</span><time datetime="${it.created_at}">${kst(it.created_at)}</time><span>가져감 ${it.copies}</span><span>좋아요 ${it.likes}</span></div></header>
  ${thumbOk(it.thumb) ? `<div style="background:#111418;padding:16px;text-align:center"><img src="${it.thumb}" alt="${esc(it.title)} 미리보기" style="max-width:100%;height:auto;max-height:420px"></div>` : ''}
  <div class="pb">${it.description ? linkify(it.description) : `무카 CAD 사용자가 공유한 ${kind}입니다.`}${tags ? `\n\n${tags}` : ''}</div>
  <div class="pact"><a class="btn primary" href="/community/?id=${it.id}">무카 CAD로 가져오기</a></div>
</article><div class="backrow"><a class="btn line sm" href="/community/">공유 블록·도면 목록</a></div></div>`;
  const ld = jsonld({ '@context': 'https://schema.org', '@type': 'CreativeWork', name: it.title, description: snip(it.description || `${kind} — 무카 CAD 공유`, 300), url, dateCreated: it.created_at, author: { '@type': 'Person', name: it.author_nick }, keywords: (it.tags || []).join(', ') });
  if (write(`s/${it.id}/index.html`, page({ title: `${it.title} (${kind}) — 무카 CAD 공유 | 카우스 소거법`, desc: snip(it.description || `${it.title} ${kind}. 무카 CAD에서 바로 가져와 쓸 수 있습니다. ${(it.tags || []).join(' ')}`), canonical: url, body, head: ld }))) changed++;
}

for (const q of reqs) {
  const url = `${SITE}/r/${q.id}/`;
  const body = `${tabs('/requests/')}
<div class="wrap board"><article class="post">
  <header class="ph"><a class="pgal" href="/requests/">요청 게시판</a><h1>${esc(q.title)}</h1>
    <div class="pm"><span class="au">${gi(q.author_grade)}${esc(q.author_nick)}</span><time datetime="${q.created_at}">${kst(q.created_at)}</time><span>${q.status === 'filled' ? '채워짐' : q.status === 'open' ? '찾는 중' : '닫힘'}</span><span>답 ${q.answers}</span>${q.bounty ? `<span>현상금 ${q.bounty} 크레딧</span>` : ''}</div></header>
  <div class="pb">${q.body ? linkify(q.body) : '이 블록·도면을 찾고 있습니다.'}${(q.tags || []).length ? '\n\n' + q.tags.map(t => `<span>#${esc(t)}</span>`).join(' ') : ''}</div>
  <div class="pact"><a class="btn primary" href="/requests/?id=${q.id}">답하러 가기</a></div>
</article><div class="backrow"><a class="btn line sm" href="/requests/">요청 목록</a></div></div>`;
  if (write(`r/${q.id}/index.html`, page({ title: `${q.title} — 요청 게시판 | 카우스 소거법`, desc: snip(q.body || `${q.title} 블록·도면을 찾습니다.`), canonical: url, body }))) changed++;
}

const removed = prune('p', new Set(posts.map(p => p.id))) + prune('s', new Set(items.map(i => i.id))) + prune('r', new Set(reqs.map(r => r.id)));

const day = iso => String(iso || new Date().toISOString()).slice(0, 10);
const latest = [...posts, ...items, ...reqs].reduce((m, x) => (x.updated_at || x.created_at) > m ? (x.updated_at || x.created_at) : m, '2026-10-18');
const urls = [
  ['/', latest, '1.0'], ['/mucca/', latest, '0.9'], ['/board/', latest, '0.9'], ...Object.keys(GAL).map(s => [`/board/?g=${s}`, latest, '0.7']),
  ['/community/', latest, '0.8'], ['/requests/', latest, '0.7'], ['/beta/', '2026-10-18', '0.4'], ['/privacy/', '2026-10-18', '0.3'],
  ...posts.map(p => [`/p/${p.id}/`, p.updated_at, '0.6']), ...items.map(i => [`/s/${i.id}/`, i.updated_at, '0.6']), ...reqs.map(r => [`/r/${r.id}/`, r.updated_at, '0.5'])
];
const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d, pr]) => `  <url><loc>${SITE}${esc(u)}</loc><lastmod>${day(d)}</lastmod><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
if (write('sitemap.xml', sm)) changed++;
console.log(`posts ${posts.length}, items ${items.length}, requests ${reqs.length} · changed ${changed}, removed ${removed}`);
