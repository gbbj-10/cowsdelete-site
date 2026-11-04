/* 무카 CAD AI 팀 2회차 — 개발1: 규격 플랜지 KS 10K SOP 3D 자동설계 (설계 모듈)
 * window.AUTO3D_FLANGE = { SIZES, TABLE, design({std,size,face}) }
 * 치수: KS B 1511(=JIS B 2220) 10K SOP — 공개 자료 3곳·운영자 공유 블록 대조값(aiteam2/02_반대_반박.md)
 * 안지름 d0 는 운영자 공유 블록 값(참고값). 사용 기록·네트워크 전송 없음.
 */
(function () {
  'use strict';
  // D 외경 · C 볼트 중심원 · n 구멍 수 · h 구멍 지름 · bolt 볼트 · t 두께(RF 포함) · d0 안지름(참고) · g RF 지름 · f RF 높이  [mm]
  var ROWS = [
    ['15A', 95, 70, 4, 15, 'M12', 12, 22.2, 51, 1],
    ['20A', 100, 75, 4, 15, 'M12', 14, 27.7, 56, 1],
    ['25A', 125, 90, 4, 19, 'M16', 14, 34.5, 67, 1],
    ['32A', 135, 100, 4, 19, 'M16', 16, 43.2, 76, 2],
    ['40A', 140, 105, 4, 19, 'M16', 16, 49.1, 81, 2],
    ['50A', 155, 120, 4, 19, 'M16', 16, 61.1, 96, 2],
    ['65A', 175, 140, 4, 19, 'M16', 18, 77.1, 116, 2],
    ['80A', 185, 150, 8, 19, 'M16', 18, 90, 126, 2],
    ['100A', 210, 175, 8, 19, 'M16', 18, 115.4, 151, 2],
    ['125A', 250, 210, 8, 23, 'M20', 20, 141.2, 182, 2],
    ['150A', 280, 240, 8, 23, 'M20', 22, 166.6, 212, 2],
    ['200A', 330, 290, 12, 23, 'M20', 22, 218, 262, 2],
    ['250A', 400, 355, 12, 25, 'M22', 24, 269.5, 324, 2],
    ['300A', 445, 400, 16, 25, 'M22', 24, 321, 368, 3]
  ];
  var SIZES = [], TABLE = {};
  ROWS.forEach(function (r) {
    SIZES.push(r[0]);
    TABLE[r[0]] = Object.freeze({ D: r[1], C: r[2], n: r[3], h: r[4], bolt: r[5], t: r[6], d0: r[7], g: r[8], f: r[9] });
  });
  Object.freeze(SIZES); Object.freeze(TABLE);

  var SRC = 'KS B 1511(=JIS B 2220) 10K SOP — 공개 자료 대조값, 제작 전 규격판으로 확인하세요';
  var IN_STD_NOT_TABLE = ['90A', '175A', '225A'];
  function unsupported() {
    return '이번 표에 없는 호칭입니다(지원 14종: ' + SIZES.join(', ') + '). ' + IN_STD_NOT_TABLE.join('·') + ' 는 규격에는 있습니다.';
  }
  function normSize(s) {
    var x = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
    if (/^\d+$/.test(x)) x += 'A';
    return x;
  }
  function normStd(s) {
    return String(s == null ? 'KS10K' : s).trim().toUpperCase().replace(/[\s_\-]/g, '');
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  function volume(P, face) {
    var q = Math.PI / 4, holes = P.n * P.h * P.h;
    if (face === 'FF') return q * P.t * (P.D * P.D - P.d0 * P.d0 - holes);
    return q * ((P.t - P.f) * (P.D * P.D - P.d0 * P.d0 - holes) + P.f * (P.g * P.g - P.d0 * P.d0));
  }

  function makeCode(size, P, face) {
    var name = '플랜지 KS10K ' + size + ' ' + face;
    var G = { D: P.D, C: P.C, n: P.n, h: P.h, t: P.t, d0: P.d0, g: P.g, f: P.f };
    var plateT = face === 'RF' ? 'P.t-P.f' : 'P.t';
    var code = [
      '// ' + name + ' — KS B 1511(=JIS B 2220) 10K SOP, 치수 mm (안지름은 참고값)',
      'const P=' + JSON.stringify(G) + ';',
      'const T=' + plateT + ';',
      'let s=tube([0,0,0],[0,0,T],P.D/2,P.d0/2);',
      'const holes=[];for(let i=0;i<P.n;i++){const a=360/P.n*(i+0.5);const q=polar([0,0],P.C/2,a);holes.push(cyl([q[0],q[1],-1],[q[0],q[1],T+1],P.h/2));}',
      's=cut(s,holes);'
    ];
    if (face === 'RF') code.push('s=union(s,tube([0,0,T],[0,0,P.t],P.g/2,P.d0/2));');
    code.push('part("F1",' + JSON.stringify(name) + ',"steel",s);');
    return { code: code, name: name };
  }

  function design(input) {
    try {
      var o = input || {};
      var std = normStd(o.std);
      if (std !== 'KS10K' && std !== 'JIS10K' && std !== 'KSB1511' && std !== 'JISB2220') {
        return { ok: false, error: '이번에는 KS 10K(KS B 1511 = JIS B 2220 10K) 플랜지만 됩니다. 5K·20K·ASME 는 아직 표가 없습니다.' };
      }
      var size = normSize(o.size);
      if (!size || !Object.prototype.hasOwnProperty.call(TABLE, size)) return { ok: false, error: unsupported() };
      var face = String(o.face == null || o.face === '' ? 'RF' : o.face).trim().toUpperCase();
      if (face !== 'RF' && face !== 'FF') return { ok: false, error: '면 모양은 RF(돌출면) 또는 FF(평면) 중에서 고르세요.' };
      var P = TABLE[size];
      if (face === 'RF' && !(P.g < P.C - P.h)) return { ok: false, error: 'RF 지름이 볼트 구멍과 겹칩니다(표 확인 필요): ' + size };
      var c = makeCode(size, P, face);
      var notes = [
        '안지름은 참고값입니다(운영자 공유 블록 값, 공개 자료마다 조금 다름).',
        face === 'RF' ? ('전체 두께 ' + P.t + ' mm 안에 RF 높이 ' + P.f + ' mm 포함 (판 ' + (P.t - P.f) + ' + RF Ø' + P.g + '×' + P.f + ').') : ('FF(평면) — 두께 ' + P.t + ' mm 원판.'),
        '볼트 ' + P.n + '-' + P.bolt + ', 구멍 ' + P.n + '-Ø' + P.h + ', PCD Ø' + P.C + '.',
        '이번 표 14종 밖(90A·175A·225A 등)은 규격에는 있지만 아직 넣지 않았습니다.',
        '제작 전 사용하는 규격판(KS B 1511)과 한 번 더 대조하세요.'
      ];
      return {
        ok: true,
        title: c.name,
        dims: { D: P.D, C: P.C, n: P.n, h: P.h, bolt: P.bolt, t: P.t, d0: P.d0, g: P.g, f: P.f, face: face },
        code: c.code,
        expect: { vol_mm3: r1(volume(P, face)), size_mm: [P.D, P.D, P.t], holes: { n: P.n, d: P.h }, pcd: P.C },
        src: SRC,
        notes: notes
      };
    } catch (e) {
      return { ok: false, error: '플랜지 설계 중 오류: ' + String((e && e.message) || e).slice(0, 120) };
    }
  }

  try {
    window.AUTO3D_FLANGE = { SIZES: SIZES, TABLE: TABLE, design: design };
  } catch (_) { /* 무시 */ }
})();
