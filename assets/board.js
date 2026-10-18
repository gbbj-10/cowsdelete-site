/* 엔지니어 갤러리 (자유게시판)
   · /board/            전체 또는 ?g=갤러리 목록 (?p=쪽)  — 추천 3개 이상 받은 글 중 상위 5개는 위에 고정
   · /board/?id=글      글 보기 (새 글은 정적 페이지가 만들어지기 전까지 여기서 보임)
   · /p/글/             검색엔진용 정적 페이지 — 같은 화면으로 바로 이어서 살아 있는 내용으로 바꿈 (window.BOARD_POST_ID) */
(function () {
  'use strict';
  const S = window.COWS, esc = S.esc, sb = S.sb;
  const root = document.getElementById('board');
  if (!root) return;
  const Q = new URLSearchParams(location.search);
  const PAGE = 30, HOT_MIN = 3, HOT_MAX = 5;
  const GALLERIES = [['mech','기계','기계 설계·가공·장비 이야기'],['arch','건축','건축 설계·시공·인테리어'],['civil','토목','토목·구조·측량'],['elec','전기·전자','전기 설비·제어·회로'],
    ['plant','플랜트·배관','플랜트·배관·설비'],['cad','CAD·도면','CAD 사용법·도면 질문·팁'],['license','자격증·취업','기사·기능사·이직 정보'],['office','회사생활','현장·사무실 이야기'],
    ['humor','유머','엔지니어만 웃는 이야기'],['worry','고민','진로·회사·사람 고민 상담']];
  const gname = s => (GALLERIES.find(g => g[0] === s) || [s, s])[1];
  const COLS = 'id,gallery,title,author_nick,author_grade,likes,comments,created_at';

  const pad = n => String(n).padStart(2, '0');
  function when(iso) {
    const d = new Date(iso), n = new Date();
    if (d.toDateString() === n.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getFullYear() === n.getFullYear()) return pad(d.getMonth() + 1) + '.' + pad(d.getDate());
    return String(d.getFullYear()).slice(2) + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  const full = iso => { const d = new Date(iso); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  /* 본문: 글자 그대로 보여 주고 주소만 링크로 (nofollow ugc) */
  const linkify = t => esc(t).replace(/https?:\/\/[^\s<>"']+/g, u => `<a href="${u}" target="_blank" rel="nofollow ugc noopener">${u}</a>`);
  const postUrl = id => '/p/' + id + '/';

  function chips(cur) {
    return `<nav class="gchips" aria-label="갤러리">` + [['', '전체']].concat(GALLERIES).map(([s, n]) =>
      `<a href="/board/${s ? '?g=' + s : ''}"${s === cur ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('') + `</nav>`;
  }
  function row(p, hot, showG) {
    return `<li class="prow${hot ? ' hot' : ''}"><span class="pg">${hot ? '<span class="badge">인기</span>' : (showG ? esc(gname(p.gallery)) : '')}</span>` +
      `<a class="pt" href="${postUrl(p.id)}">${esc(p.title)}${p.comments ? `<span class="cc">[${p.comments}]</span>` : ''}</a>` +
      `<span class="pa">${S.gradeIcon(p.author_grade, 16)}${esc(p.author_nick)}</span><span class="pd">${when(p.created_at)}</span><span class="pl">♥ ${p.likes}</span></li>`;
  }

  async function needNick() {
    await S.ready;
    if (!S.user) { S.login(location.href); return false; }
    if (!S.nick) { dialog('닉네임이 필요합니다', `<p>글과 댓글에는 닉네임이 보입니다. 무카 CAD에서 닉네임을 먼저 정해 주세요.</p><p><a class="btn primary" href="/cad/">무카 CAD에서 닉네임 정하기</a></p>`); return false; }
    return true;
  }
  function dialog(title, html) {
    const d = document.createElement('div'); d.className = 'dlg';
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="btn line sm" data-x type="button">닫기</button></header><div class="in">${html}</div></div>`;
    document.body.append(d);
    const close = () => { d.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') close(); };
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', k);
    d.close = close; return d;
  }

  /* ---------------- 목록 ---------------- */
  async function list(g, page) {
    const meta = GALLERIES.find(x => x[0] === g);
    document.title = (meta ? meta[1] + ' 갤러리' : '엔지니어 갤러리') + ' — 카우스 소거법';
    root.innerHTML = chips(g) + `<div class="btop"><div><h2>${meta ? esc(meta[1]) + ' 갤러리' : '전체 글'}</h2><p>${meta ? esc(meta[2]) : '모든 갤러리의 새 글'}</p></div><button class="btn primary sm" id="bWrite" type="button">글쓰기</button></div>` +
      `<ol class="plist" id="plist"><li class="prow headrow"><span>${meta ? '' : '갤러리'}</span><span>제목</span><span>글쓴이</span><span style="text-align:center">날짜</span><span style="text-align:center">추천</span></li><li class="empty-b">불러오는 중…</li></ol><nav class="pager" id="pager"></nav>`;
    document.getElementById('bWrite').onclick = () => write(g);
    if (!sb) return;
    let hq = sb.from('board_posts').select(COLS).eq('status', 'public').gte('likes', HOT_MIN).order('likes', { ascending: false }).order('created_at', { ascending: false }).limit(HOT_MAX);
    let lq = sb.from('board_posts').select(COLS, { count: 'exact' }).eq('status', 'public').order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
    if (g) { hq = hq.eq('gallery', g); lq = lq.eq('gallery', g); }
    const [h, l] = await Promise.all([hq, lq]);
    const ol = document.getElementById('plist');
    ol.querySelector('.empty-b').remove();
    const hot = h.data || [], rows = l.data || [];
    ol.insertAdjacentHTML('beforeend', hot.map(p => row(p, true, !g)).join(''));
    if (l.error) ol.insertAdjacentHTML('beforeend', `<li class="empty-b">글을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</li>`);
    else if (!rows.length) ol.insertAdjacentHTML('beforeend', `<li class="empty-b">아직 글이 없습니다. 첫 글을 남겨 주세요.</li>`);
    else ol.insertAdjacentHTML('beforeend', rows.map(p => row(p, false, !g)).join(''));
    const pages = Math.max(1, Math.ceil((l.count || 0) / PAGE));
    if (pages > 1) {
      const base = '/board/?' + (g ? 'g=' + g + '&' : '') + 'p=';
      const from = Math.max(1, page - 4), to = Math.min(pages, from + 9);
      let h2 = page > 1 ? `<a href="${base + (page - 1)}">이전</a>` : '';
      for (let i = from; i <= to; i++) h2 += i === page ? `<span aria-current="page">${i}</span>` : `<a href="${base + i}">${i}</a>`;
      if (page < pages) h2 += `<a href="${base + (page + 1)}">다음</a>`;
      document.getElementById('pager').innerHTML = h2;
    }
  }

  /* ---------------- 글쓰기 ---------------- */
  async function write(g) {
    if (!(await needNick())) return;
    const d = dialog('글쓰기', `<form class="wfrm" id="wf">
      <div class="field"><label for="wG">갤러리</label><select id="wG">${GALLERIES.map(([s, n]) => `<option value="${s}"${s === g ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="field"><label for="wT">제목</label><input id="wT" maxlength="80" required placeholder="제목 (2~80자)"></div>
      <div class="field"><label for="wB">내용</label><textarea id="wB" maxlength="5000" required placeholder="자유롭게 적어 주세요. 주소를 붙이면 링크가 됩니다."></textarea></div>
      <p class="bnote">회사 기밀, 고객명, 단가, 실제 도면은 올리지 마세요. 신고가 5번 쌓이면 글이 숨겨집니다. 글은 검색엔진에도 보입니다.</p>
      <p class="berr" id="wE" role="alert"></p>
      <div><button class="btn primary" type="submit" id="wS">올리기</button></div></form>`);
    d.querySelector('#wT').focus();
    d.querySelector('#wf').onsubmit = async e => {
      e.preventDefault();
      const t = d.querySelector('#wT').value.trim(), b = d.querySelector('#wB').value.trim(), gg = d.querySelector('#wG').value, er = d.querySelector('#wE'), bt = d.querySelector('#wS');
      if (t.length < 2) { er.textContent = '제목을 2자 이상 적어 주세요.'; return; }
      if (!b) { er.textContent = '내용을 적어 주세요.'; return; }
      bt.disabled = true; er.textContent = '';
      const { data, error } = await sb.from('board_posts').insert({ gallery: gg, title: t, body: b }).select('id').single();
      bt.disabled = false;
      if (error) { er.textContent = /닉네임|하루/.test(error.message) ? error.message : '올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; return; }
      location.href = '/board/?id=' + data.id;
    };
  }

  /* ---------------- 글 보기 ---------------- */
  async function view(id) {
    if (!sb) return;
    const { data: p, error } = await sb.from('board_posts').select('id,gallery,title,body,author_nick,author_grade,likes,comments,status,user_id,created_at,updated_at').eq('id', id).maybeSingle();
    if (error || !p || p.status !== 'public') {
      if (!window.BOARD_POST_ID) root.innerHTML = chips('') + `<div class="post"><div class="pb">지워졌거나 숨겨진 글입니다.</div></div><div class="backrow"><a class="btn line sm" href="/board/">목록으로</a></div>`;
      else if (!error) { const pb = root.querySelector('.post .pb'); if (pb) pb.textContent = '지워졌거나 숨겨진 글입니다.'; }
      return;
    }
    await S.ready;
    const mine = S.user && S.user.id === p.user_id;
    let liked = false;
    if (S.user) { const { data: l } = await sb.from('board_likes').select('post_id').eq('post_id', id).eq('user_id', S.user.id).maybeSingle(); liked = !!l; }
    document.title = p.title + ' — ' + gname(p.gallery) + ' 갤러리';
    root.innerHTML = chips(p.gallery) + `<article class="post">
      <header class="ph"><a class="pgal" href="/board/?g=${p.gallery}">${esc(gname(p.gallery))} 갤러리</a><h1>${esc(p.title)}</h1>
        <div class="pm"><span class="au">${S.gradeIcon(p.author_grade, 18)}${esc(p.author_nick)}</span><time datetime="${p.created_at}">${full(p.created_at)}</time><span>추천 <b id="lkN">${p.likes}</b></span><span>댓글 ${p.comments}</span></div></header>
      <div class="pb">${linkify(p.body)}</div>
      <div class="pact"><button class="likebtn" id="lk" type="button" aria-pressed="${liked}"><b>♥</b><span id="lkC">${p.likes}</span></button></div>
      <div class="ptools"><button class="linkbtn" id="shr" type="button">주소 복사</button><button class="linkbtn" id="rpt" type="button">신고</button>${mine ? '<button class="linkbtn" id="del" type="button">삭제</button>' : ''}</div>
    </article>
    <section class="cmts" aria-label="댓글"><h2>댓글 <span id="cN">${p.comments}</span></h2><div id="clist"></div>
      <form class="cform" id="cf"><textarea id="cT" maxlength="1000" placeholder="${S.user ? '댓글을 남겨 주세요' : '로그인하면 댓글을 남길 수 있습니다'}" aria-label="댓글"></textarea><button class="btn primary sm" type="submit">등록</button></form></section>
    <div class="backrow"><a class="btn line sm" href="/board/?g=${p.gallery}">${esc(gname(p.gallery))} 목록</a><button class="btn primary sm" id="bWrite" type="button">글쓰기</button></div>`;
    document.getElementById('bWrite').onclick = () => write(p.gallery);
    const lk = document.getElementById('lk');
    lk.onclick = async () => {
      if (!(await needNick())) return;
      lk.disabled = true;
      const on = lk.getAttribute('aria-pressed') === 'true';
      const r = on ? await sb.from('board_likes').delete().eq('post_id', id).eq('user_id', S.user.id) : await sb.from('board_likes').insert({ post_id: id });
      if (!r.error) {
        const { data: n } = await sb.from('board_posts').select('likes').eq('id', id).single();
        lk.setAttribute('aria-pressed', String(!on)); document.getElementById('lkC').textContent = n ? n.likes : '';
        document.getElementById('lkN').textContent = n ? n.likes : '';
      }
      lk.disabled = false;
    };
    document.getElementById('shr').onclick = async e => { try { await navigator.clipboard.writeText(location.origin + postUrl(id)); e.target.textContent = '복사했습니다'; } catch (_) { e.target.textContent = location.origin + postUrl(id); } };
    document.getElementById('rpt').onclick = async () => {
      if (!(await needNick())) return;
      const d = dialog('신고하기', `<form class="wfrm" id="rf"><div class="field"><label for="rR">이유</label><select id="rR"><option>광고·도배</option><option>욕설·비하</option><option>음란물</option><option>회사 기밀·개인정보 노출</option><option>저작권 침해</option><option>기타</option></select></div>
        <p class="bnote">신고가 5번 쌓이면 글이 자동으로 숨겨지고 운영자가 확인합니다.</p><p class="berr" id="rE" role="alert"></p><div><button class="btn primary" type="submit">신고</button></div></form>`);
      d.querySelector('#rf').onsubmit = async e => {
        e.preventDefault();
        const { error } = await sb.from('board_reports').insert({ post_id: id, reason: d.querySelector('#rR').value });
        if (error && error.code === '23505') { d.querySelector('#rE').textContent = '이미 신고한 글입니다.'; return; }
        if (error) { d.querySelector('#rE').textContent = '신고하지 못했습니다.'; return; }
        d.querySelector('.in').innerHTML = '<p>신고했습니다. 고맙습니다.</p>';
      };
    };
    if (mine) document.getElementById('del').onclick = async () => {
      const d = dialog('글 삭제', `<p>이 글을 지울까요? 지운 글은 되돌릴 수 없습니다.</p><p><button class="btn primary" id="dOk" type="button">삭제</button></p>`);
      d.querySelector('#dOk').onclick = async () => {
        const { error } = await sb.from('board_posts').update({ status: 'deleted' }).eq('id', id);
        if (!error) location.href = '/board/?g=' + p.gallery;
      };
    };
    const cf = document.getElementById('cf');
    cf.onsubmit = async e => {
      e.preventDefault();
      if (!(await needNick())) return;
      const t = document.getElementById('cT').value.trim(); if (!t) return;
      const { error } = await sb.from('board_comments').insert({ post_id: id, body: t });
      if (error) { alertBox(/닉네임|하루|댓글/.test(error.message) ? error.message : '댓글을 남기지 못했습니다.'); return; }
      document.getElementById('cT').value = ''; comments(id);
    };
    comments(id);
  }
  function alertBox(msg) { dialog('알림', `<p>${esc(msg)}</p>`); }
  async function comments(id) {
    const { data } = await sb.from('board_comments').select('id,body,author_nick,author_grade,user_id,created_at').eq('post_id', id).eq('status', 'public').order('created_at', { ascending: true }).limit(500);
    const c = data || [];
    document.getElementById('cN').textContent = c.length;
    document.getElementById('clist').innerHTML = c.length ? c.map(x => `<div class="cmt"><span class="ca">${S.gradeIcon(x.author_grade, 16)}${esc(x.author_nick)}</span><div class="cb">${linkify(x.body)}</div><span class="cd">${when(x.created_at)}${S.user && S.user.id === x.user_id ? ` <button class="linkbtn" data-cdel="${x.id}" type="button">삭제</button>` : ''}</span></div>`).join('')
      : '<p class="empty-b" style="border:0;margin:0">첫 댓글을 남겨 주세요.</p>';
    document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { await sb.from('board_comments').update({ status: 'deleted' }).eq('id', b.dataset.cdel); comments(id); });
  }

  const id = window.BOARD_POST_ID || Q.get('id');
  if (id && /^[0-9a-f-]{36}$/i.test(id)) view(id);
  else list(GALLERIES.some(g => g[0] === Q.get('g')) ? Q.get('g') : '', Math.max(1, parseInt(Q.get('p'), 10) || 1));
})();
