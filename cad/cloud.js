/* 무카 CAD — 웹 배포판 계정·클라우드 모듈 (카카오 로그인 · 닉네임 · 내 도면 저장 · 사용 기록)
   - 로그인 없이도 캐드는 그대로 쓸 수 있음. 로그인은 '클라우드 저장'에만 필요
   - 도면은 기본 비공개: 데이터베이스 행 수준 보안(RLS)으로 본인만 읽고 씀
   - 사용 기록은 명령 이름·오류 메시지만 (도면 내용은 보내지 않음)
   - 앱 본체(index.html)의 전역 변수·함수(doc, pushUndo, normDoc, changed, zoomExtents, sel, log, modal)를 사용 */
(function () {
  'use strict';
  const CFG = window.COWS_CONFIG || {};
  const READY = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
  const GRADES = ['', '기능사', '산업기사', '기사', '기술사', '명장'];
  const gradeImg = (g, cls) => { g = Math.min(5, Math.max(1, g | 0 || 1)); const i = document.createElement('img'); i.className = cls || 'gr'; i.src = `/assets/grade/g${g}.png`; i.srcset = `/assets/grade/g${g}.png 1x, /assets/grade/g${g}@2x.png 2x`; i.alt = GRADES[g]; i.title = GRADES[g]; i.width = 18; i.height = 18; return i; };
  const APP_VER = CFG.appVer || 'web';
  const NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;
  const RESERVED = ['관리자', '운영자', 'admin', 'administrator', '카우스소거법', '카우스', '무카캐드', '무카', 'cowsdelete', 'mucca', 'muccacad'];
  const MAX_BYTES = 3 * 1000 * 1000;
  const SYNC_SKIP = ['muccacad.ai.code'];

  const sb = READY ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  }) : null;
  window.__muccaCloud = { sb, ready: READY };

  let user = null, profile = null, cur = null; // cur = {id, name} 지금 열려 있는 클라우드 도면

  /* ---------- 작은 도우미 ---------- */
  const $ = (t, a = {}, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } for (const c of kids) e.append(c); return e; };
  const say = (m, c) => { try { log(m, c); } catch (_) { console.log(m); } };
  const fmt = d => { const x = new Date(d); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
  const kb = n => n > 1e6 ? (n / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1e3)) + 'KB';
  function sheet(title, inner, foot, opts = {}) {
    const m = modal(title, inner, foot);
    if (opts.locked) { const x = m.querySelector('[data-x]'); if (x) x.remove(); m.addEventListener('pointerdown', e => { if (e.target === m) e.stopImmediatePropagation(); }, true); }
    return m;
  }

  /* ---------- 스타일 ---------- */
  document.head.append($('style', {}, `
  .acct{display:flex;align-items:center;gap:6px}
  .acct .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rule);border-radius:999px;padding:3px 10px 3px 4px;background:var(--chrome-2);color:var(--ink)}
  .acct .chip img{width:20px;height:20px;border-radius:50%;object-fit:cover;background:var(--rule)}
  .acct .chip img.gr,.cl-gr{width:18px;height:18px;border-radius:0;background:none;object-fit:contain}
  .cl-wallet{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;border:1px solid var(--rule);border-radius:8px;padding:12px;margin:0 0 12px}
  .cl-wallet img{width:48px;height:48px}
  .cl-wallet b{font-size:16px}
  .cl-bar{height:6px;border-radius:3px;background:var(--rule);overflow:hidden;margin:6px 0 4px}
  .cl-bar i{display:block;height:100%;background:#f1c232}
  .acct .beta{font-size:11px;color:var(--tag-ink);background:var(--tag);border-radius:4px;padding:1px 6px;font-weight:600}
  .kakao{background:#FEE500;color:#191600;font-weight:600;border-radius:5px;padding:5px 10px;border:0}
  .kakao:hover{filter:brightness(.97)}
  .cl-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rule)}
  .cl-row .n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cl-row .m{color:var(--ink-dim);font-size:12px}
  .cl-in{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--rule);background:var(--ground);color:var(--ink)}
  .cl-hint{font-size:12px;color:var(--ink-dim);margin:6px 0 0}
  .cl-bad{color:var(--danger)} .cl-ok{color:var(--ok)}
  .cl-p{margin:0 0 10px;line-height:1.6}
  .cl-gate{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:#0a1220;
    background-image:linear-gradient(#1a2a44 1px,transparent 1px),linear-gradient(90deg,#1a2a44 1px,transparent 1px);background-size:48px 48px}
  .cl-gate .g{width:min(460px,100%);background:#0f1a2b;border:1px solid #24395a;border-radius:14px;padding:30px 28px;color:#e6eef8;box-shadow:0 30px 80px -40px rgba(56,214,245,.45)}
  .cl-gate .lg{display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:22px}
  .cl-gate .lg img{width:36px;height:36px;border-radius:50%}
  .cl-gate h2{font-size:26px;letter-spacing:-.03em;line-height:1.25;margin:0 0 10px}
  .cl-gate p{color:#a3b4cc;margin:0 0 20px;line-height:1.65}
  .cl-gate .kakao{width:100%;padding:13px;font-size:16px;border-radius:8px}
  .cl-gate .links{display:flex;gap:14px;margin-top:18px;font-size:13px}
  .cl-gate .links a{color:#6f83a0}
  .cl-gate .cl-in{background:#07101c;border-color:#24395a;font-size:16px;padding:12px}
  .cl-gate .go{width:100%;margin-top:14px;padding:12px;font-size:16px}
  .cl-gate .sub{font-size:13px;margin:12px 0 0}
  a.tbtn{text-decoration:none;display:inline-flex;align-items:center}
  .cl-share .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .cl-share label{display:block;font-size:13px;color:var(--ink-dim);margin:10px 0 4px}
  .cl-share .pv{width:100%;aspect-ratio:16/10;background:#111418 center/contain no-repeat;border:1px solid var(--rule);border-radius:6px}
  .cl-share .chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:8px 0 0;color:var(--ink)}
  .cl-share .chk input{margin-top:3px}
  .cl-ta{width:100%;min-height:120px;padding:8px 10px;border-radius:6px;border:1px solid var(--rule);background:var(--ground);color:var(--ink);resize:vertical}
  `));

  /* ---------- 상단 버튼 ---------- */
  const bar = document.getElementById('bPanel') && document.getElementById('bPanel').parentNode;
  const acct = $('span', { class: 'acct' });
  const bCloudSave = $('button', { class: 'tbtn', title: '클라우드에 저장 (로그인 필요)', text: '클라우드 저장' });
  const bMine = $('button', { class: 'tbtn', title: '내가 저장한 도면', text: '내 도면' });
  const bFeedback = $('button', { class: 'tbtn', title: '의견·없는 기능 알려주기', text: '의견' });
  const bHome = $('a', { class: 'tbtn', href: CFG.homeUrl || '../', title: '카우스 소거법 홈', text: '홈' });
  const bShare = $('button', { class: 'tbtn', title: '블록이나 도면을 커뮤니티에 공유', text: '공유' });
  const bComm = $('a', { class: 'tbtn', href: '/community/', target: '_blank', rel: 'noopener', title: '공유 블록·도면 찾기', text: '커뮤니티' });
  if (bar) {
    const panelBtn = document.getElementById('bPanel');
    bar.insertBefore(bHome, panelBtn);
    bar.insertBefore($('span', { class: 'sep' }), panelBtn);
    if (READY) { bar.insertBefore(bCloudSave, panelBtn); bar.insertBefore(bMine, panelBtn); bar.insertBefore(bShare, panelBtn); bar.insertBefore(bComm, panelBtn); }
    bar.insertBefore(bFeedback, panelBtn);
    bar.insertBefore(acct, panelBtn);
    bar.insertBefore($('span', { class: 'sep' }), panelBtn);
  }

  function renderAcct() {
    acct.textContent = '';
    acct.append($('span', { class: 'beta', text: '베타' }));
    if (!READY) return;
    if (!user) { acct.append($('button', { class: 'kakao', text: '카카오 로그인', onclick: login })); return; }
    const img = $('img', { alt: '' }); const pic = user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture); if (pic) img.src = pic;
    const chip = $('button', { class: 'chip', title: '계정 · 크레딧', onclick: openAccount }, img, $('span', { text: profile ? profile.nickname : '닉네임 설정 필요' }));
    if (profile) chip.append(gradeImg(profile.grade));
    acct.append(chip);
  }

  /* ---------- 로그인 ---------- */
  async function login() {
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } });
    if (error) say('로그인 실패: ' + error.message, 'err');
  }
  async function logout() { await sb.auth.signOut(); user = null; profile = null; cur = null; renderAcct(); gate('login'); }

  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('nickname,grade,created_at').eq('id', user.id).maybeSingle();
    if (error) { say('프로필 불러오기 실패: ' + error.message, 'err'); return; }
    profile = data; renderAcct();
    if (!profile) gate('nickname'); else { gate('off'); pullSettings(); runImport(); }
  }

  function checkNick(n) {
    if (!NICK_RE.test(n)) return '한글·영문·숫자·밑줄(_) 2~12자로 정해 주세요';
    return '';
  }
  function openNickname(first) {
    const inp = $('input', { class: 'cl-in', maxlength: '12', placeholder: '예: 도면장인_01', autocomplete: 'off' });
    if (profile) inp.value = profile.nickname;
    const hint = $('p', { class: 'cl-hint', text: '한글·영문·숫자·밑줄(_) 2~12자 · 카카오 이름 대신 이 닉네임만 보입니다' });
    const ok = $('button', { class: 'tbtn primary', text: '저장' });
    const body = [$('p', { class: 'cl-p', text: first ? '무카 CAD에서 쓸 닉네임을 정해 주세요. 나중에 블록을 공유하면 이 닉네임으로 표시됩니다.' : '새 닉네임을 입력하세요.' }), inp, hint];
    const foot = first ? [$('button', { class: 'tbtn', text: '로그아웃', onclick: () => { m.remove(); logout(); } }), ok] : [ok];
    const m = sheet(first ? '닉네임 정하기' : '닉네임 바꾸기', body, foot, { locked: first });
    let t = 0;
    inp.oninput = () => {
      const n = inp.value.trim(); const bad = checkNick(n); hint.className = 'cl-hint ' + (bad ? 'cl-bad' : '');
      hint.textContent = bad || '확인 중…'; clearTimeout(t); if (bad) return;
      t = setTimeout(async () => { const { data, error } = await sb.rpc('nickname_available', { n }); if (inp.value.trim() !== n) return;
        if (error) { hint.textContent = '확인 실패: ' + error.message; hint.className = 'cl-hint cl-bad'; return; }
        const mine = profile && profile.nickname.toLowerCase() === n.toLowerCase();
        hint.textContent = (data || mine) ? '쓸 수 있는 닉네임입니다' : (RESERVED.includes(n.toLowerCase()) ? '운영용으로 남겨 둔 닉네임입니다' : '이미 쓰는 닉네임입니다'); hint.className = 'cl-hint ' + ((data || mine) ? 'cl-ok' : 'cl-bad'); }, 350);
    };
    ok.onclick = async () => {
      const n = inp.value.trim(); const bad = checkNick(n); if (bad) { hint.textContent = bad; hint.className = 'cl-hint cl-bad'; return; }
      ok.disabled = true;
      const { error } = await sb.from('profiles').upsert({ id: user.id, nickname: n }, { onConflict: 'id' });
      ok.disabled = false;
      if (error) { hint.textContent = error.code === '23505' ? '이미 쓰는 닉네임입니다' : error.code === '23514' ? '운영용으로 남겨 둔 닉네임입니다' : '저장 실패: ' + error.message; hint.className = 'cl-hint cl-bad'; return; }
      profile = { nickname: n }; renderAcct(); m.remove(); say(`닉네임 "${n}"(으)로 저장했습니다`, 'ok');
    };
    setTimeout(() => inp.focus(), 50);
  }

  async function openAccount() {
    const wbox = $('div', { class: 'cl-wallet' }, $('span', { class: 'cl-hint', text: '불러오는 중…' }));
    const rows = [
      wbox,
      $('p', { class: 'cl-p', text: `닉네임: ${profile ? profile.nickname : '(없음)'}` }),
      $('p', { class: 'cl-hint', text: '저장한 도면은 본인만 볼 수 있습니다(비공개). 회사 기밀 도면은 올리지 않기를 권장합니다.' })
    ];
    const m = sheet('계정', rows, [
      $('button', { class: 'tbtn', text: '닉네임 바꾸기', onclick: () => { m.remove(); openNickname(false); } }),
      $('button', { class: 'tbtn', text: '계정 삭제', onclick: () => { m.remove(); openDelete(); } }),
      $('button', { class: 'tbtn primary', text: '로그아웃', onclick: () => { m.remove(); logout(); } })
    ]);
    const { data: w, error } = await sb.rpc('my_wallet');
    wbox.textContent = '';
    if (error || !w) { wbox.append($('span', { class: 'cl-hint', text: '크레딧을 불러오지 못했습니다' })); return; }
    if (profile && profile.grade !== w.grade) { profile.grade = w.grade; renderAcct(); }
    const pct = w.next ? Math.min(100, Math.round(w.points / w.next * 100)) : 100;
    const bar = $('div', { class: 'cl-bar' }); const fill = document.createElement('i'); fill.style.width = pct + '%'; bar.append(fill);
    wbox.append(gradeImg(w.grade, 'cl-big'), $('div', {},
      $('b', { text: `${GRADES[w.grade]} · 기여 ${w.points}점` }), bar,
      $('div', { class: 'cl-hint', text: w.grade >= 5 ? `명장 · 전체 ${w.users}명 중 ${w.rank}위 (상위 ${w.master_pct}%)` : w.grade === 4 ? `명장은 전체 상위 ${w.master_pct}% · 지금 컷 ${w.master_cut}점 (현재 ${w.users}명 중 ${w.rank}위)` : `${GRADES[w.grade + 1]}까지 ${Math.max(0, w.next - w.points)}점 · ${w.users}명 중 ${w.rank}위` }),
      $('div', { class: 'cl-p', text: `크레딧 ${w.credits}${w.pending ? ` (확정 대기 ${w.pending})` : ''}` }),
      $('div', { class: 'cl-hint', text: '공유가 확정되면 +1점, 다른 사람이 내 블록을 가져갈 때마다 +1점, 요청에 답해 채택되면 +2점' }),
      $('a', { href: '/requests/', target: '_blank', rel: 'noopener', class: 'cl-hint', text: '요청 게시판 보기' })));
  }
  function openDelete() {
    const inp = $('input', { class: 'cl-in', placeholder: profile ? profile.nickname : '' });
    const go = $('button', { class: 'tbtn', text: '삭제' });
    const m = sheet('계정 삭제', [$('p', { class: 'cl-p', text: '계정과 저장한 도면·설정이 모두 지워지고 되돌릴 수 없습니다. 계속하려면 닉네임을 입력하세요.' }), inp], [go]);
    go.onclick = async () => {
      if (!profile || inp.value.trim() !== profile.nickname) { inp.focus(); return; }
      go.disabled = true; const { error } = await sb.rpc('delete_my_account'); if (error) { go.disabled = false; const missing = /function|schema cache|PGRST202/i.test(error.message + (error.code || '')); say(missing ? '계정 삭제 기능을 준비 중입니다. [의견 보내기]로 삭제를 요청해 주시면 처리해 드립니다.' : '계정 삭제 실패: ' + error.message, 'err'); return; }
      m.remove(); await sb.auth.signOut(); user = null; profile = null; cur = null; renderAcct(); gate('login');
    };
  }

  /* ---------- 클라우드 저장·열기 ---------- */
  function needLogin() {
    if (!user) { sheet('로그인이 필요합니다', [$('p', { class: 'cl-p', text: '클라우드 저장은 카카오 로그인 뒤에 쓸 수 있습니다. 로그인 없이도 캐드와 파일 저장은 그대로 쓸 수 있습니다.' })], [$('button', { class: 'kakao', text: '카카오 로그인', onclick: login })]); return true; }
    if (!profile) { gate('nickname'); return true; }
    return false;
  }
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `도면 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`; }
  async function cloudSave(asNew) {
    if (needLogin()) return;
    const json = JSON.stringify(doc); const size = new Blob([json]).size;
    if (size > MAX_BYTES) { say(`도면이 너무 큽니다 (${kb(size)}). 클라우드 저장은 3MB까지입니다. 파일 저장을 이용하세요.`, 'err'); return; }
    if (!cur || asNew) {
      const inp = $('input', { class: 'cl-in', maxlength: '80', value: cur ? cur.name + ' (사본)' : stamp() });
      const ok = $('button', { class: 'tbtn primary', text: '저장' });
      const m = sheet('클라우드에 저장', [$('p', { class: 'cl-p', text: '도면 이름' }), inp, $('p', { class: 'cl-hint', text: '본인만 볼 수 있게 저장됩니다(비공개).' })], [ok]);
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
      inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); e.stopPropagation(); };
      ok.onclick = async () => {
        const name = inp.value.trim() || stamp(); ok.disabled = true;
        const { data, error } = await sb.from('drawings').insert({ name, data: JSON.parse(json) }).select('id,name').single();
        ok.disabled = false; if (error) { say('클라우드 저장 실패: ' + error.message, 'err'); return; }
        cur = data; m.remove(); say(`클라우드에 저장했습니다: ${name} (${kb(size)})`, 'ok'); pushSettings();
      };
      return;
    }
    const { error } = await sb.from('drawings').update({ data: JSON.parse(json) }).eq('id', cur.id);
    if (error) { say('클라우드 저장 실패: ' + error.message, 'err'); return; }
    say(`클라우드에 덮어썼습니다: ${cur.name} (${kb(size)})`, 'ok'); pushSettings();
  }
  async function openMine() {
    if (needLogin()) return;
    const list = $('div', {}, $('p', { class: 'cl-hint', text: '불러오는 중…' }));
    const m = sheet('내 도면', [list], [$('button', { class: 'tbtn', text: '다른 이름으로 저장', onclick: () => { m.remove(); cloudSave(true); } })]);
    const { data, error } = await sb.from('drawings').select('id,name,updated_at,size_bytes').order('updated_at', { ascending: false }).limit(200);
    list.textContent = '';
    if (error) { list.append($('p', { class: 'cl-bad', text: '불러오기 실패: ' + error.message })); return; }
    if (!data.length) { list.append($('p', { class: 'cl-p', text: '아직 저장한 도면이 없습니다. 상단 [클라우드 저장]으로 저장하세요.' })); return; }
    for (const r of data) {
      const row = $('div', { class: 'cl-row' },
        $('div', {}, $('div', { class: 'n', text: r.name + (cur && cur.id === r.id ? '  · 열려 있음' : '') }), $('div', { class: 'm', text: `${fmt(r.updated_at)} · ${kb(r.size_bytes || 0)}` })),
        $('button', { class: 'tbtn primary', text: '열기', onclick: async () => { const ok = await openOne(r.id); if (ok) m.remove(); } }),
        $('button', { class: 'tbtn', text: '삭제', onclick: async () => {
          if (row.dataset.confirm !== '1') { row.dataset.confirm = '1'; row.lastChild.textContent = '한 번 더 눌러 삭제'; return; }
          const { error } = await sb.from('drawings').delete().eq('id', r.id); if (error) { say('삭제 실패: ' + error.message, 'err'); return; }
          if (cur && cur.id === r.id) cur = null; row.remove(); say(`삭제했습니다: ${r.name}`, 'ok'); } }));
      list.append(row);
    }
  }
  async function openOne(id) {
    const { data, error } = await sb.from('drawings').select('id,name,data').eq('id', id).single();
    if (error) { say('열기 실패: ' + error.message, 'err'); return false; }
    try { const d = data.data; if (!d || !d.entities || !d.layers) throw new Error('무카 CAD 도면이 아닙니다');
      pushUndo(); doc = normDoc(d); sel.clear(); changed(); zoomExtents(); cur = { id: data.id, name: data.name }; say(`클라우드 도면 열기: ${data.name}`, 'ok'); return true;
    } catch (e) { say('열기 실패: ' + e.message, 'err'); return false; }
  }

  /* ---------- 설정 동기화 (단축키·플롯 스타일 등 브라우저 설정) ---------- */
  function localSettings() { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('muccacad.') && !SYNC_SKIP.includes(k)) o[k] = localStorage.getItem(k); } } catch (_) {} return o; }
  async function pushSettings() { if (!user || !profile) return; const value = localSettings(); await sb.from('user_settings').upsert({ owner: user.id, key: 'local', value }, { onConflict: 'owner,key' }); }
  async function pullSettings() {
    const { data } = await sb.from('user_settings').select('value').eq('key', 'local').maybeSingle();
    if (!data || !data.value) { pushSettings(); return; }
    const loc = localSettings(); let changedN = 0;
    for (const [k, v] of Object.entries(data.value)) { if (typeof v === 'string' && loc[k] !== v) { try { localStorage.setItem(k, v); changedN++; } catch (_) {} } }
    if (changedN) say(`내 설정(단축키 등) ${changedN}개를 불러왔습니다 — 새로고침하면 적용됩니다`, 'ok');
  }

  /* ---------- 사용 기록 · 의견 ---------- */
  const sent = { unknown_cmd: new Set(), n: 0, err: 0 };
  async function evt(kind, payload) {
    if (!sb) return;
    if (kind === 'unknown_cmd') { const c = String(payload.cmd || '').toUpperCase(); if (!/^[A-Z0-9_.\-]{1,24}$/.test(c) || sent.unknown_cmd.has(c)) return; sent.unknown_cmd.add(c); payload = { cmd: c }; }
    if (kind === 'error' && ++sent.err > 5) return;
    if (++sent.n > 40) return;
    try { await sb.from('events').insert({ kind, payload, app_ver: APP_VER, page: 'cad' }); } catch (_) {}
  }
  window.__muccaEvt = evt;
  window.addEventListener('error', e => evt('error', { msg: String(e.message || '').slice(0, 200), at: `${String(e.filename || '').split('/').pop()}:${e.lineno || 0}` }));
  window.addEventListener('unhandledrejection', e => evt('error', { msg: String((e.reason && e.reason.message) || e.reason || '').slice(0, 200), at: 'promise' }));

  bFeedback.onclick = () => {
    const ta = $('textarea', { class: 'cl-ta', maxlength: '1000', placeholder: '예: DIMORD(세로좌표 치수)가 없어요 / 해치 패턴 ANSI32가 필요해요 / 이 버튼이 헷갈려요' });
    ta.onkeydown = e => e.stopPropagation();
    const ok = $('button', { class: 'tbtn primary', text: '보내기' });
    const m = sheet('의견 보내기', [$('p', { class: 'cl-p', text: '없는 기능, 불편한 점, 오토캐드와 다르게 동작하는 곳을 알려 주세요.' }), ta, $('p', { class: 'cl-hint', text: '회사명·고객명·단가·실제 도면 내용은 적지 말아 주세요. 보낸 내용은 기능 개선에만 씁니다.' })], [ok]);
    setTimeout(() => ta.focus(), 50);
    ok.onclick = async () => { const t = ta.value.trim(); if (t.length < 2) { ta.focus(); return; } if (!sb) { m.remove(); return; } ok.disabled = true;
      const { error } = await sb.from('events').insert({ kind: 'feedback', payload: { text: t.slice(0, 1000) }, app_ver: APP_VER, page: 'cad' });
      ok.disabled = false; if (error) { say('보내기 실패: ' + error.message, 'err'); return; } m.remove(); say('의견을 보냈습니다. 고맙습니다!', 'ok'); };
  };

  /* ---------- 새 도면·파일 열기 → 클라우드 연결 끊기 ---------- */
  const bNew = document.getElementById('bNew'), fileIn = document.getElementById('fileIn');
  if (bNew) { const o = bNew.onclick; bNew.onclick = e => { cur = null; return o && o.call(bNew, e); }; }
  if (fileIn) { const o = fileIn.onchange; fileIn.onchange = e => { cur = null; return o && o.call(fileIn, e); }; }
  bCloudSave.onclick = () => cloudSave(false);
  bMine.onclick = openMine;
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's') && READY) { e.preventDefault(); cloudSave(false); } }, true);


  /* ---------- 로그인 게이트: 로그인 + 닉네임 전에는 캐드를 쓸 수 없음 ---------- */
  const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('dev') === '1';
  const gateEl = $('div', { class: 'cl-gate', role: 'dialog', 'aria-modal': 'true', 'aria-label': '무카 CAD 시작하기' });
  let gateState = '';
  function gate(state) {
    if (DEV || !READY) state = 'off';
    if (state === gateState) return; gateState = state;
    if (state === 'off') { gateEl.remove(); return; }
    gateEl.textContent = '';
    const box = $('div', { class: 'g' }, $('div', { class: 'lg' }, $('img', { src: '/assets/logo.jpg', alt: '' }), $('span', { text: '무카 CAD 베타' })));
    if (state === 'loading') { box.append($('p', { text: '불러오는 중…' })); }
    if (state === 'login') {
      box.append($('h2', { text: '카카오로 로그인하고 시작하세요' }),
        $('p', { text: '로그인하면 도면을 클라우드에 저장하고, 공유 블록을 내 캐드로 가져올 수 있습니다. 무료 베타입니다.' }),
        $('button', { class: 'kakao', text: '카카오로 시작하기', onclick: login }),
        $('div', { class: 'links' }, $('a', { href: '/', text: '홈' }), $('a', { href: '/community/', text: '커뮤니티 둘러보기' }), $('a', { href: '/beta/', text: '베타 이용 안내' }), $('a', { href: '/privacy/', text: '개인정보처리방침' })));
    }
    if (state === 'nickname') {
      const inp = $('input', { class: 'cl-in', maxlength: '12', placeholder: '예: 도면장인_01', autocomplete: 'off', 'aria-label': '닉네임' });
      const hint = $('p', { class: 'cl-hint sub', text: '한글, 영문, 숫자, 밑줄(_) 2~12자. 카카오 이름 대신 이 닉네임만 보입니다.' });
      const go = $('button', { class: 'tbtn primary go', text: '이 닉네임으로 시작' });
      box.append($('h2', { text: '닉네임을 정해 주세요' }), $('p', { text: '공유한 블록과 도면에 이 닉네임이 표시됩니다. 나중에 바꿀 수 있어요.' }), inp, hint, go,
        $('div', { class: 'links' }, $('a', { href: '#', text: '다른 계정으로 로그인', onclick: e => { e.preventDefault(); logout(); } })));
      let t = 0;
      inp.oninput = () => { const n = inp.value.trim(), bad = checkNick(n); hint.className = 'cl-hint sub ' + (bad ? 'cl-bad' : ''); hint.textContent = bad || '확인 중…'; clearTimeout(t); if (bad) return;
        t = setTimeout(async () => { const { data, error } = await sb.rpc('nickname_available', { n }); if (inp.value.trim() !== n) return;
          hint.textContent = error ? '확인하지 못했습니다: ' + error.message : (data ? '쓸 수 있는 닉네임입니다' : (RESERVED.includes(n.toLowerCase()) ? '운영용으로 남겨 둔 닉네임입니다' : '이미 쓰는 닉네임입니다')); hint.className = 'cl-hint sub ' + (!error && data ? 'cl-ok' : 'cl-bad'); }, 350); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') go.click(); };
      go.onclick = async () => { const n = inp.value.trim(), bad = checkNick(n); if (bad) { hint.textContent = bad; hint.className = 'cl-hint sub cl-bad'; return; }
        go.disabled = true; const { error } = await sb.from('profiles').insert({ id: user.id, nickname: n }); go.disabled = false;
        if (error) { hint.textContent = error.code === '23505' ? '이미 쓰는 닉네임입니다' : error.code === '23514' ? '운영용으로 남겨 둔 닉네임입니다' : '저장하지 못했습니다: ' + error.message; hint.className = 'cl-hint sub cl-bad'; return; }
        profile = { nickname: n }; renderAcct(); gate('off'); say(`환영합니다, ${n}님`, 'ok'); pullSettings(); runImport(); };
      setTimeout(() => inp.focus(), 60);
    }
    gateEl.append(box); document.body.append(gateEl);
  }
  gate(READY && !DEV ? 'loading' : 'off');

  /* ---------- 썸네일 (현재 도면 또는 블록 하나) ---------- */
  function thumbOf(blockName) {
    const keepDoc = doc, keepView = Object.assign({}, view), keepSel = new Set(sel), keepGrid = flags.grid;
    try {
      if (blockName) doc = Object.assign({}, keepDoc, { entities: [{ id: 999999, type: 'insert', name: blockName, p: { x: 0, y: 0 }, sx: 1, sy: 1, rot: 0, layer: '0', color: null, lt: null, lw: null }] });
      sel.clear(); flags.grid = false; zoomExtents(); render();
      const cvs = document.getElementById('cv'), w = 640, h = 400, o = document.createElement('canvas'); o.width = w; o.height = h;
      const g = o.getContext('2d'); g.fillStyle = '#111418'; g.fillRect(0, 0, w, h);
      const k = Math.min(w / cvs.width, h / cvs.height); const dw = cvs.width * k, dh = cvs.height * k;
      g.drawImage(cvs, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return o.toDataURL('image/jpeg', 0.82);
    } catch (e) { return null; }
    finally { doc = keepDoc; Object.assign(view, keepView); sel = keepSel; flags.grid = keepGrid; dirty = true; }
  }

  /* ---------- 커뮤니티에 공유 ---------- */
  const TEXT_TYPES = ['text', 'table', 'attdef'];
  function stripText(d) { const c = structuredClone(d); c.entities = (c.entities || []).filter(e => !TEXT_TYPES.includes(e.type)).map(e => { if (e.type === 'insert') delete e.attrs; return e; });
    for (const b of Object.values(c.blocks || {})) b.ents = (b.ents || []).filter(e => !TEXT_TYPES.includes(e.type)); return c; }
  function openShare() {
    if (needLogin()) return;
    const blocks = Object.keys(BL());
    const what = $('select', { class: 'cl-in' }, $('option', { value: '', text: '지금 도면 전체' }), ...blocks.map(n => $('option', { value: n, text: '블록: ' + n })));
    const title = $('input', { class: 'cl-in', maxlength: '60', placeholder: '예: M10 육각볼트 (KS B 1002)' });
    const desc = $('textarea', { class: 'cl-ta', maxlength: '600', placeholder: '어디에 쓰는지, 규격, 기준점 위치 등을 적어 주세요' }); desc.style.minHeight = '72px'; desc.style.height = '84px';
    const tags = $('input', { class: 'cl-in', maxlength: '120', placeholder: '태그를 쉼표로: 볼트, KS, 체결' });
    const noText = $('input', { type: 'checkbox' }); noText.checked = true;
    const c1 = $('input', { type: 'checkbox' }), c2 = $('input', { type: 'checkbox' });
    const pv = $('div', { class: 'pv' });
    const go = $('button', { class: 'tbtn primary', text: '공유하기' });
    const refresh = () => { const u = thumbOf(what.value || null); pv.style.backgroundImage = u ? `url(${u})` : ''; pv.dataset.u = u || ''; if (!title.value && what.value) title.value = what.value; };
    for (const el of [title, desc, tags]) el.onkeydown = e => e.stopPropagation();
    what.onchange = refresh;
    const body = $('div', { class: 'cl-share' },
      $('div', { class: 'row2' }, $('div', {}, $('label', { text: '무엇을 공유할까요' }), what, $('label', { text: '이름' }), title, $('label', { text: '태그' }), tags), $('div', {}, $('label', { text: '미리보기' }), pv)),
      $('label', { text: '설명 (선택)' }), desc,
      $('label', { class: 'chk' }, noText, $('span', { text: '문자(표제란·주기·표) 빼고 공유 — 회사명이나 품번이 남지 않게 권장' })),
      $('label', { class: 'chk' }, c1, $('span', { text: '회사 기밀이나 고객 정보가 들어 있지 않습니다' })),
      $('label', { class: 'chk' }, c2, $('span', { text: '내가 그렸거나 공유해도 되는 도면입니다. 공유하면 누구나 보고 복사해 쓸 수 있고, 무카 CAD 개선(블록 모음·AI 예시)에도 쓰일 수 있습니다' })));
    const m = sheet('커뮤니티에 공유', [body], [go]);
    setTimeout(refresh, 30);
    go.onclick = async () => {
      if (!c1.checked || !c2.checked) { say('공유 전에 확인 항목 두 개를 체크해 주세요', 'err'); return; }
      const t = title.value.trim(); if (t.length < 2) { title.focus(); return; }
      let kind = 'drawing', data;
      if (what.value) { const b = BL()[what.value]; if (!b) return; kind = 'block';
        const used = new Set((b.ents || []).map(e => e.layer)); data = { name: what.value, block: structuredClone(b), layers: doc.layers.filter(l => used.has(l.name)) };
        if (noText.checked) data.block.ents = data.block.ents.filter(e => !TEXT_TYPES.includes(e.type)); }
      else { data = noText.checked ? stripText(doc) : structuredClone(doc); }
      const json = JSON.stringify(data); if (new Blob([json]).size > 2e6) { say('공유는 2MB까지입니다. 필요한 부분만 블록으로 만들어 공유해 주세요', 'err'); return; }
      const tg = [...new Set(tags.value.split(',').map(x => x.trim()).filter(Boolean))].slice(0, 8).map(x => x.slice(0, 20));
      go.disabled = true;
      const { data: row, error } = await sb.from('shared_items').insert({ kind, title: t, description: desc.value.trim(), tags: tg, data, thumb: pv.dataset.u || null }).select('id').single();
      go.disabled = false;
      if (error) { say('공유하지 못했습니다: ' + error.message, 'err'); return; }
      m.remove(); say(`커뮤니티에 공유했습니다: ${t} — 크레딧 +1 대기 (7일 뒤 또는 누군가 가져가면 확정)`, 'ok'); evt('share', { kind });
      sheet('공유했습니다', [$('p', { class: 'cl-p', text: '커뮤니티에서 누구나 찾아볼 수 있습니다. 크레딧 +1이 대기 중이며, 7일 동안 신고가 없거나 다른 사람이 가져가면 확정됩니다. 빈 도면·이미 있는 모양·하루 4번째 공유부터는 크레딧이 없습니다. 요청 게시판에 같은 걸 찾는 글이 있으면 답으로 걸어 보세요.' })],
        [$('a', { class: 'tbtn primary', href: '/community/?id=' + row.id, target: '_blank', rel: 'noopener', text: '커뮤니티에서 보기' })]);
    };
  }
  bShare.onclick = openShare;

  /* ---------- 커뮤니티에서 가져오기 (?import=아이디) ---------- */
  let imported = false;
  async function runImport() {
    const id = new URLSearchParams(location.search).get('import'); if (!id || imported) return; imported = true;
    history.replaceState(null, '', location.pathname);
    const { data, error } = await sb.rpc('community_copy', { item_id: id });
    if (error) { say('가져오지 못했습니다: ' + error.message, 'err'); return; }
    const d = data.data;
    if (data.paid) say('크레딧 1개를 써서 가져왔습니다', 'ok');
    if (data.kind === 'block') {
      let name = d.name || data.title, n = name, i = 2; while (BL()[n]) n = `${name}_${i++}`;
      pushUndo(); for (const l of d.layers || []) { if (!doc.layers.find(x => x.name === l.name)) doc.layers.push(l); }
      for (const e of (d.block && d.block.ents) || []) if (e.layer) ensureLayer(e.layer);
      BL()[n] = d.block; changed();
      say(`블록 "${n}"을(를) 가져왔습니다 (${data.author}님 공유). I 명령으로 삽입하세요`, 'ok');
    } else {
      if (!d || !d.entities || !d.layers) { say('가져온 도면 형식이 올바르지 않습니다', 'err'); return; }
      pushUndo(); doc = normDoc(d); sel.clear(); changed(); zoomExtents(); cur = null;
      say(`"${data.title}" 도면을 열었습니다 (${data.author}님 공유). Ctrl+Z로 이전 도면으로 돌아갑니다`, 'ok');
    }
  }

  /* ---------- 시작 ---------- */
  renderAcct();
  if (!READY) return;
  sb.auth.onAuthStateChange((ev, session) => {
    const u = session ? session.user : null;
    if ((u && u.id) === (user && user.id)) return;
    user = u; profile = null; renderAcct();
    if (user) { gate('loading'); setTimeout(loadProfile, 0); } else gate('login');
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) gate('login'); });
  const q = new URLSearchParams(location.search); const err = q.get('error_description') || new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (err) say('로그인 실패: ' + err, 'err');
})();
