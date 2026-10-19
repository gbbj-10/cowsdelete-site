/* 무카 CAD 테스트 서버 — 2D→3D 복잡도 시험 도면 (단계별)
   각 도면은 무카 CAD 명령 배열. 3D 창의 [시험 도면]에서 불러옴. */
(function () {
  const R = Math.PI / 180;
  const C = (x, y, r, layer) => ({ cmd: 'circle', center: [x, y], r, ...(layer ? { layer } : {}) });
  const PL = (pts, closed = true, extra) => ({ cmd: 'polyline', points: pts, closed, ...(extra || {}) });
  const L = (a, b, layer) => ({ cmd: 'line', from: a, to: b, ...(layer ? { layer } : {}) });
  const CL = (a, b) => L(a, b, '중심선');
  const HL = (a, b) => L(a, b, '숨은선');
  const DL = (p1, p2, at, text) => ({ cmd: 'dim_linear', p1, p2, at, ...(text ? { text } : {}) });
  const TX = (x, y, s, h = 5) => ({ cmd: 'text', at: [x, y], text: s, h });
  // 축 방향 프로파일 [길이, 지름, 모따기] 목록 → 측면도 폴리선
  function shaftSide(x0, segs) {
    const top = [], bot = []; let x = x0;
    segs.forEach(([len, d, ch]) => {
      const r = d / 2, c = ch || 0;
      top.push([x, r - c], [x + c, r], [x + len - c, r], [x + len, r - c]);
      x += len;
    });
    const t = top.filter((p, i) => i === 0 || p[0] !== top[i - 1][0] || p[1] !== top[i - 1][1]);
    for (const p of t) bot.unshift([p[0], -p[1]]);
    return PL(t.concat(bot));
  }
  const flangeFront = () => {
    const c = [C(0, 0, 60), C(0, 0, 30), C(0, 0, 15)];
    for (const a of [45, 135, 225, 315]) c.push(C(45 * Math.cos(a * R), 45 * Math.sin(a * R), 6));
    return c;
  };
  const flangeSide = x => PL([[x, -60], [x + 15, -60], [x + 15, -30], [x + 40, -30], [x + 40, 30], [x + 15, 30], [x + 15, 60], [x, 60]]);

  const cases = [];
  /* 1. 사각 판 + 구멍 */
  cases.push({ id: 'p1', lv: 1, title: '사각 판 + 구멍 5개', expect: '돌출(두께 입력값)', cmds: [
    { cmd: 'rect', from: [0, 0], to: [200, 120] }, C(20, 20, 6), C(180, 20, 6), C(20, 100, 6), C(180, 100, 6), C(100, 60, 25)] });
  /* 2. 둥근 모서리 + 장공 (선·호를 따로 그려 이어 붙여야 함) + 측면도 두께 8 */
  {
    const b = Math.tan(90 * R / 4), w = 220, h = 140, r = 12;
    const outer = PL([[r, 0], [w - r, 0], [w, r], [w, h - r], [w - r, h], [r, h], [0, h - r], [0, r]], true, { bulges: [0, b, 0, b, 0, b, 0, b] });
    const slot = (x, y) => [L([x - 20, y - 7], [x + 20, y - 7]), L([x - 20, y + 7], [x + 20, y + 7]), { cmd: 'arc', center: [x + 20, y], r: 7, start: -90, end: 90 }, { cmd: 'arc', center: [x - 20, y], r: 7, start: 90, end: 270 }];
    cases.push({ id: 'p2', lv: 2, title: '둥근 모서리 판 + 장공 2개', expect: '돌출 두께 8(측면도), 장공 관통', cmds: [
      outer, ...slot(60, 40), ...slot(160, 100), C(160, 40, 8), C(60, 100, 8), { cmd: 'rect', from: [w + 40, 0], to: [w + 48, h] }] });
  }
  /* 3. 플랜지 (정면 + 측면) */
  cases.push({ id: 'p3', lv: 3, title: '플랜지 (보어·볼트 구멍)', expect: '회전체, 보어 Ø30, 구멍 4', cmds: [...flangeFront(), flangeSide(100), CL([-70, 0], [70, 0]), CL([0, -70], [0, 70]), CL([92, 0], [148, 0])] });
  /* 4. 5단 축 + 모따기 */
  {
    const segs = [[30, 25, 1], [40, 30], [60, 40, 1.5], [40, 30], [30, 25, 1]];
    cases.push({ id: 'p4', lv: 4, title: '5단 축 + 모따기', expect: '회전체 5단 + 모따기 경사', cmds: [
      C(-60, 0, 20), C(-60, 0, 15), C(-60, 0, 12.5), C(-60, 0, 11.5), shaftSide(0, segs), CL([-10, 0], [210, 0])] });
  }
  /* 5. V벨트 풀리 2줄 홈 */
  {
    const x = 120, ro = 75, d = 15, t = Math.tan(19 * R) * d, g = (cx) => [[cx - 7 - t, ro], [cx - 7 + 0, ro - d], [cx + 7 - 0, ro - d], [cx + 7 + t, ro]];
    const top = [[x, 25], [x, ro], ...g(x + 13), ...g(x + 37), [x + 50, ro], [x + 50, 25]];
    const bot = top.slice().reverse().map(p => [p[0], -p[1]]);
    cases.push({ id: 'p5', lv: 5, title: 'V벨트 풀리 (홈 2줄)', expect: '회전체, V홈 2줄, 보어 Ø25', cmds: [
      C(0, 0, 75), C(0, 0, 60), C(0, 0, 12.5), PL(top.concat(bot)), HL([x, 12.5], [x + 50, 12.5]), HL([x, -12.5], [x + 50, -12.5])] });
  }
  /* 6. 키홈 축 (키홈은 측면도에만 보임) */
  {
    const segs = [[40, 30], [100, 45], [40, 30]];
    cases.push({ id: 'p6', lv: 6, title: '키홈 있는 축', expect: '축은 됨, 키홈은 빠짐(부분)', cmds: [
      C(-60, 0, 22.5), C(-60, 0, 15), shaftSide(0, segs),
      L([70, 6], [110, 6]), L([70, -6], [110, -6]), { cmd: 'arc', center: [110, 0], r: 6, start: -90, end: 90 }, { cmd: 'arc', center: [70, 0], r: 6, start: 90, end: 270 }] });
  }
  /* 7. ㄱ자 브래킷 (측면도가 ㄱ자) */
  cases.push({ id: 'p7', lv: 7, title: 'ㄱ자 브래킷', expect: '판 두께만(부분)', cmds: [
    { cmd: 'rect', from: [0, 0], to: [100, 80] }, C(25, 55, 5), C(75, 55, 5), PL([[140, 0], [200, 0], [200, 8], [148, 8], [148, 80], [140, 80]])] });
  /* 8. 3면도 블록 + 카운터보어 */
  cases.push({ id: 'p8', lv: 8, title: '3면도 블록 + 카운터보어', expect: '블록+관통구멍, 카운터보어는 빠짐(부분)', cmds: [
    { cmd: 'rect', from: [0, 0], to: [120, 80] }, C(35, 40, 10), C(35, 40, 6), C(85, 40, 10), C(85, 40, 6),
    { cmd: 'rect', from: [0, 110], to: [120, 170] }, HL([25, 110], [25, 170]), HL([45, 110], [45, 170]), HL([75, 110], [75, 170]), HL([95, 110], [95, 170]),
    { cmd: 'rect', from: [150, 0], to: [210, 80] }] });
  /* 9. 손그림처럼 선 끝이 덜 붙은 도면 */
  cases.push({ id: 'p9', lv: 9, title: '손그림식: 선 끝 0.5mm 벌어짐·비뚤', expect: '오차를 메워 돌출', cmds: [
    L([0, 0], [180.4, 0.6]), L([180.9, 0.3], [180.2, 100.5]), L([179.6, 100.9], [0.3, 99.6]), L([-0.4, 99.9], [0.4, 0.5]), C(40, 50, 10.2), C(140.5, 49.6, 9.8),
    L([220, 0.2], [232.3, 0.4]), L([232.6, 0.1], [232, 100.4]), L([231.6, 100.6], [220.4, 100.2]), L([220.1, 100.5], [219.7, 0.6])] });
  /* 10. 실제 도면 형식: 도곽 + 표제란 + 치수 + 문자 */
  {
    const F = [-130, -150], W = 420, H = 297;
    const frame = [{ cmd: 'rect', from: F, to: [F[0] + W, F[1] + H] }, { cmd: 'rect', from: [F[0] + 10, F[1] + 10], to: [F[0] + W - 10, F[1] + H - 10] },
      { cmd: 'rect', from: [F[0] + W - 190, F[1] + 10], to: [F[0] + W - 10, F[1] + 50] }, L([F[0] + W - 190, F[1] + 30], [F[0] + W - 10, F[1] + 30]), L([F[0] + W - 100, F[1] + 10], [F[0] + W - 100, F[1] + 50]),
      TX(F[0] + W - 185, F[1] + 36, '품명: 플랜지 A-120', 5), TX(F[0] + W - 185, F[1] + 16, '재질: SS400  수량: 2', 5), TX(F[0] + W - 95, F[1] + 16, 'S=1:1', 5)];
    cases.push({ id: 'p10', lv: 10, title: '실제 도면 형식 (도곽·표제란·치수)', expect: '도곽은 건너뛰고 플랜지만', cmds: [
      ...frame, ...flangeFront(), flangeSide(100), CL([-70, 0], [70, 0]), CL([0, -70], [0, 70]),
      DL([100, -60], [115, -60], [107, -80]), DL([100, -30], [140, -30], [120, -95]), TX(-40, 80, '4-Ø12 P.C.D 90', 5)] });
  }
  /* 11. 큰 타공판: 구멍 1,014개 */
  {
    const c = [{ cmd: 'rect', from: [0, 0], to: [1200, 800] }];
    for (let i = 0; i < 39; i++) for (let j = 0; j < 26; j++) c.push(C(30 + i * 30, 25 + j * 30, 4));
    cases.push({ id: 'p11', lv: 11, title: '타공판 1200×800, 구멍 1,014개', expect: '돌출, 구멍 1,014개', cmds: c });
  }
  window.LABCASES = cases;
})();
