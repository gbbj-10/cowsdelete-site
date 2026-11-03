/* 무카 CAD AI 팀 실험판 — 치수 목록 뽑기 (DIMEXTRACT) 계산 부분 (개발1, 2026-11-04)
   window.DIMX = { list(opts), toCSV(rows), KIND_KO }  +  AI 명령 {"cmd":"dim_list"}
   - 측정 치수만: linear·aligned·radius·diameter·angular·arclen·jogged (풍선·지시선·거칠기·중심표시 등 type 'dim' 의 다른 kind 는 뺌)
   - 값 = 측정값(dimGeom(e)._v) × 측정 축척(DS(e).lfac, e.lfac 우선). 각도는 도(°), 축척 안 곱함. 소수 셋째 자리 반올림
     dimGeom 이 없거나 실패하면 좌표로 직접 계산
   - 화면 글자 = dimGeom(e).text.s (+ 공차 글자 extra). 머리말·공차·쉼표 소수점 그대로
   - override = 사용자가 '<>' 없이 글자를 덮어씀
   - skipped.block = 이름이 *D 로 시작하는 블록 insert 수 (좌표를 못 읽어 블록으로 들어온 치수)
   도면은 바꾸지 않음. */
(function () {
  'use strict';
  if (typeof doc !== 'object' || !doc) return;
  const KINDS = ['linear', 'aligned', 'radius', 'diameter', 'angular', 'arclen', 'jogged'];
  const KSET = new Set(KINDS);
  const KIND_KO = { linear: '선형', aligned: '정렬', radius: '반지름', diameter: '지름', angular: '각도', arclen: '호 길이', jogged: '꺾인 반지름' };
  const R3 = x => Math.round(x * 1000) / 1000;
  const RAD = Math.PI / 180;
  const has = f => { try { return typeof f === 'function'; } catch (_) { return false; } };
  const hasDimGeom = () => { try { return typeof dimGeom === 'function'; } catch (_) { return false; } };
  const hasDS = () => { try { return typeof DS === 'function'; } catch (_) { return false; } };
  const n360 = a => { a = a % 360; return a < 0 ? a + 360 : a; };
  const dxy = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  /* 좌표로 측정값 계산 (dimGeom 이 없거나 실패했을 때) */
  function rawValue(e) {
    try {
      switch (e.kind) {
        case 'linear': {
          const p1 = e.p1, p2 = e.p2; let dir = e.dir;
          if (!dir) {
            const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y), minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x), at = e.at || p1;
            if (at.y > maxY || at.y < minY) dir = 'h'; else if (at.x > maxX || at.x < minX) dir = 'v'; else dir = (maxX - minX >= maxY - minY) ? 'h' : 'v';
          }
          return dir === 'h' ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y);
        }
        case 'aligned': return dxy(e.p1, e.p2);
        case 'radius': case 'jogged': return +e.r;
        case 'diameter': return 2 * e.r;
        case 'angular': return n360(e.a1 - e.a0) || 360;
        case 'arclen': return e.r * (n360(e.a1 - e.a0) || 360) * RAD;
      }
    } catch (_) { }
    return NaN;
  }
  function lfacOf(e) {
    if (e.lfac != null && +e.lfac > 0) return +e.lfac;
    if (hasDS()) { try { const s = DS(e); if (s && +s.lfac > 0) return +s.lfac; } catch (_) { } }
    return 1;
  }
  function screenText(G, e, v, ang) {
    if (G && G.text) {
      let parts = [G.text.s].concat((G.extra || []).map(x => x && x.s)).filter(s => s != null && s !== '').map(String);
      let s = parts.join(' ');
      if (/%%|\\[Uu]\+/.test(s) && has(typeof cadCodes === 'undefined' ? null : cadCodes)) { try { s = cadCodes(s); } catch (_) { } }
      return s;
    }
    const m = isFinite(v) ? String(v) + (ang ? '°' : '') : '';
    if (e.text != null && e.text !== '') return String(e.text).replace('<>', m);
    return m;
  }

  function rowOf(e) {
    let G = null;
    if (hasDimGeom()) { try { G = dimGeom(e); } catch (_) { G = null; } }
    const ang = e.kind === 'angular';
    let v = G && typeof G._v === 'number' && isFinite(G._v) ? G._v : rawValue(e);
    if (!ang) v *= lfacOf(e);
    const value = isFinite(v) ? R3(v) : null;
    const t = e.text;
    const override = t != null && t !== '' && !String(t).includes('<>');
    return { id: e.id, kind: e.kind, value, unit: ang ? '°' : 'mm', text: screenText(G, e, value, ang), override, layer: e.layer == null ? '' : String(e.layer) };
  }

  function list(opts) {
    opts = opts || {};
    let src = doc.entities || [];
    if (Array.isArray(opts.ids)) { const want = new Set(opts.ids.map(String)); src = src.filter(e => e && want.has(String(e.id))); }
    const rows = []; let block = 0;
    for (const e of src) {
      if (!e) continue;
      if (e.type === 'dim' && KSET.has(e.kind)) { const r = rowOf(e); r.no = rows.length + 1; rows.push(r); }
      else if (e.type === 'insert' && typeof e.name === 'string' && /^\*D/i.test(e.name)) block++;
    }
    return { rows: rows.map(r => ({ no: r.no, id: r.id, kind: r.kind, value: r.value, unit: r.unit, text: r.text, override: r.override, layer: r.layer })), skipped: { block }, total: rows.length };
  }

  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  function toCSV(rows) {
    const out = [['번호', '종류', '값', '단위', '화면 글자', '덮어씀', '도면층'].map(q).join(',')];
    for (const r of rows || []) out.push([r.no, KIND_KO[r.kind] || r.kind, r.value == null ? '' : r.value, r.unit, r.text, r.override ? '예' : '', r.layer].map(q).join(','));
    return out.join('\r\n');
  }

  window.DIMX = { list, toCSV, KIND_KO, KINDS: KINDS.slice() };

  /* AI 명령: {"cmd":"dim_list","ids":[...]?} — 도면은 바꾸지 않음 */
  if (typeof COMMANDS === 'object' && COMMANDS) {
    COMMANDS.dim_list = c => {
      c = c || {};
      const r = list(Array.isArray(c.ids) && c.ids.length ? { ids: c.ids } : {});
      return { ok: true, count: r.total, skipped_block: r.skipped.block, rows: r.rows.slice(0, 200) };
    };
  }
  const GUIDE = `치수 목록
 · {"cmd":"dim_list"} 또는 {"cmd":"dim_list","ids":[...]} — 측정 치수(선형·정렬·반지름·지름·각도·호 길이·꺾인 반지름) 목록. 값은 측정값×측정 축척(각도는 °). 앞 200개만, count·skipped_block(블록으로 들어와 못 읽은 치수 수) 함께. 도면은 안 바꿈`;
  const hook = () => { const g = window.LAB2D; if (g && typeof g.guide === 'string') { if (!g.guide.includes('"cmd":"dim_list"')) g.guide += '\n\n' + GUIDE; return true; } return false; };
  if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 40) clearInterval(t); }, 500); }
})();
