/* 카우스 소거법 사이트 공통 스크립트 — 로그인 상태 표시 (무카 CAD와 같은 계정) */
(function () {
  'use strict';
  const C = window.COWS_CONFIG || {};
  const sb = (C.supabaseUrl && window.supabase) ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  }) : null;
  const S = window.COWS = { sb, user: null, nick: null, grade: 1, ready: null };
  /* 기여 등급: 기능사 → 산업기사 → 기사 → 기술사 (아이콘은 구글 플로우로 만든 육각 너트) */
  S.GRADES = ['', '기능사', '산업기사', '기사', '기술사', '명장'];
  S.gradeIcon = function (g, size) {
    g = Math.min(5, Math.max(1, (g | 0) || 1)); size = size || 18;
    return `<img class="gr" src="/assets/grade/g${g}.png" srcset="/assets/grade/g${g}.png 1x, /assets/grade/g${g}@2x.png 2x" width="${size}" height="${size}" alt="${S.GRADES[g]}" title="${S.GRADES[g]}">`;
  };
  S.wallet = async function () { if (!sb || !S.user) return null; const { data, error } = await sb.rpc('my_wallet'); return error ? null : data; };
  S.gradeGuide = function () {
    const d = document.createElement('div'); d.className = 'dlg';
    const rows = [[1, '처음 닉네임을 정하면'], [2, '기여 3점'], [3, '기여 10점'], [4, '기여 30점'], [5, '전체 상위 10%<br>(기술사 이상)']]
      .map(([g, t]) => `<li${g === 5 ? ' class="top"' : ''}>${S.gradeIcon(g, 40)}<span><b>${S.GRADES[g]}</b><br><span class="muted">${t}</span></span></li>`).join('');
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="기여 등급 안내" style="width:min(680px,100%)"><header><h3>기여 등급과 크레딧</h3><button class="x" data-x>닫기</button></header>
      <div class="in"><ul class="ladder">${rows}</ul>
      <p class="muted" style="font-size:14px;margin:16px 0 6px"><b style="color:var(--ink)">명장</b> 점수 기준이 아니라 전체 사용자 중 기여 점수 상위 10%에게 주는 등급입니다. 기술사 점수(30점) 이상인 사람만 후보이고, 순위는 공유·가져감이 생길 때마다 다시 매깁니다.</p>
      <p class="muted" style="font-size:14px;margin:0 0 6px"><b style="color:var(--ink)">기여 점수</b> 공유가 확정되면 +1, 다른 사람이 내 블록·도면을 가져갈 때마다 +1, 요청에 답해 채택되면 +2</p>
      <p class="muted" style="font-size:14px;margin:0 0 6px"><b style="color:var(--ink)">크레딧</b> 처음 3개. 공유하면 +1이 대기했다가 7일 동안 신고가 없거나 누군가 가져가면 확정. 누군가 찾았는데 없던 것을 올리면 +2 더. 요청 게시판 현상금으로도 받습니다.</p>
      <p class="muted" style="font-size:14px;margin:0">빈 도면, 이미 있는 모양, 하루 4번째 공유부터는 크레딧이 없습니다. 신고로 숨겨지면 받은 크레딧을 돌려놓습니다.</p></div></div>`;
    document.body.append(d);
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  };

  S.login = async function (back) {
    if (!sb) return;
    const redirectTo = back || (location.origin + location.pathname + location.search);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } });
    if (error) alert('로그인을 시작하지 못했습니다: ' + error.message);
  };
  S.logout = async function () { if (sb) await sb.auth.signOut(); location.reload(); };
  /* 미리보기 그림: base64 이미지 데이터 주소만 허용 (따옴표·스크립트가 끼어들 수 없게) */
  S.thumb = t => (typeof t === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(t)) ? `background-image:url('${t}')` : '';
  S.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function paint() {
    const slot = document.querySelector('[data-who]'); if (!slot) return;
    slot.textContent = '';
    if (!sb) return;
    if (!S.user) {
      const b = document.createElement('button'); b.className = 'btn kakao sm'; b.type = 'button'; b.textContent = '카카오 로그인';
      b.onclick = () => S.login(); slot.append(b); return;
    }
    const a = document.createElement('a'); a.className = 'nick'; a.href = '/cad/'; a.title = '무카 CAD 열기';
    const img = document.createElement('img'); img.alt = ''; const m = S.user.user_metadata || {}; if (m.avatar_url || m.picture) img.src = m.avatar_url || m.picture;
    const t = document.createElement('span'); t.textContent = S.nick || '닉네임 정하기';
    a.append(img, t); if (S.nick) a.insertAdjacentHTML('beforeend', S.gradeIcon(S.grade)); slot.append(a);
  }

  S.ready = (async function () {
    if (!sb) { paint(); return S; }
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    if (S.user) {
      const { data: p } = await sb.from('profiles').select('nickname,grade').eq('id', S.user.id).maybeSingle();
      S.nick = p ? p.nickname : null; S.grade = p ? p.grade : 1;
    }
    paint();
    return S;
  })();
})();
