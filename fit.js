// FITTING MATEMATICO
// Tutte le funzioni lavorano in coordinate cartesiane (y verso l'alto).

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// Minimi quadrati lineari: rows[i] · w ≈ ys[i]
function lsq(rows, ys) {
  const m = rows[0].length;
  const A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
  rows.forEach((r, i) => {
    for (let j = 0; j < m; j++) {
      b[j] += r[j] * ys[i];
      for (let k = 0; k < m; k++) A[j][k] += r[j] * r[k];
    }
  });
  return solve(A, b);
}

const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

// Retta: minimi quadrati totali (PCA), distanza ortogonale
function fitLine(Q) {
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of Q) { sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
  sxx /= Q.length; sxy /= Q.length; syy /= Q.length;
  const m = (sxx + syy) / 2, d = Math.hypot((sxx - syy) / 2, sxy);
  return { th: 0.5 * Math.atan2(2 * sxy, sxx - syy), major: Math.sqrt(m + d), minor: Math.sqrt(Math.max(m - d, 0)) };
}

// Cerchio: fit algebrico di Kåsa
function fitCircle(Q) {
  const w = lsq(Q.map(p => [p.x, p.y, 1]), Q.map(p => -(p.x * p.x + p.y * p.y)));
  if (!w) return null;
  const cx = -w[0] / 2, cy = -w[1] / 2, r2 = cx * cx + cy * cy - w[2];
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  return { cx, cy, r, err: rms(Q.map(p => Math.hypot(p.x - cx, p.y - cy) - r)) };
}

// Ellisse: conica generale con vincolo A + C = 1, errore di Sampson
function fitEllipse(Q, noXY) {
  const rows = Q.map(p => noXY ? [p.x * p.x - p.y * p.y, p.x, p.y, 1] : [p.x * p.x - p.y * p.y, p.x * p.y, p.x, p.y, 1]);
  const w = lsq(rows, Q.map(p => -p.y * p.y));
  if (!w) return null;
  const A = w[0], B = noXY ? 0 : w[1], C = 1 - A, [D, E, F] = w.slice(noXY ? 1 : 2);
  if (B * B - 4 * A * C >= 0) return null;
  const c = solve([[2 * A, B], [B, 2 * C]], [-D, -E]);
  if (!c) return null;
  const F0 = F + (D * c[0] + E * c[1]) / 2;
  const m = (A + C) / 2, d = Math.hypot((A - C) / 2, B / 2), t = 0.5 * Math.atan2(B, A - C);
  const q1 = -F0 / (m + d), q2 = -F0 / (m - d);
  if (!(q1 > 0 && q2 > 0)) return null;
  const s1 = Math.sqrt(q1), s2 = Math.sqrt(q2);
  let a = s1, b = s2, th = t;
  if (s2 > s1) { a = s2; b = s1; th = t + Math.PI / 2; }
  th = Math.atan(Math.tan(th)); // (-90°, 90°]
  const err = rms(Q.map(p => {
    const f = A * p.x * p.x + B * p.x * p.y + C * p.y * p.y + D * p.x + E * p.y + F;
    return f / (Math.hypot(2 * A * p.x + B * p.y + D, B * p.x + 2 * C * p.y + E) || 1e-9);
  }));
  return { cx: c[0], cy: c[1], a, b, th, err };
}

// Polinomio v = p(u); swap=true → x in funzione di y
function fitPoly(Q, deg, swap) {
  const U = Q.map(p => swap ? p.y : p.x), V = Q.map(p => swap ? p.x : p.y);
  const c = lsq(U.map(u => Array.from({ length: deg + 1 }, (_, k) => u ** k)), V);
  if (!c) return null;
  const err = rms(U.map((u, i) => {
    let v = 0, dv = 0;
    for (let k = deg; k >= 0; k--) { v = v * u + c[k]; if (k) dv = dv * u + k * c[k]; }
    return (V[i] - v) / Math.sqrt(1 + dv * dv);
  }));
  return { c, err, lo: Math.min(...U), hi: Math.max(...U) };
}

// Esponenziale v = A·e^(k·u) + C; con swap=true è un logaritmo (x esponenziale in y).
// k si cerca per tentativi, A e C con i minimi quadrati.
function fitExp(Q, swap) {
  const U = Q.map(p => swap ? p.y : p.x), V = Q.map(p => swap ? p.x : p.y);
  const lo = Math.min(...U), hi = Math.max(...U), w = hi - lo;
  if (w < 1e-6) return null;
  const tryK = k => {
    const c = lsq(U.map(u => [Math.exp(k * u), 1]), V);
    if (!c) return null;
    const err = rms(U.map((u, i) => {
      const e = c[0] * Math.exp(k * u);
      return (V[i] - e - c[1]) / Math.sqrt(1 + k * k * e * e);
    }));
    return { A: c[0], k, C: c[1], err, lo, hi };
  };
  let best = null;
  const keep = f => { if (f && (!best || f.err < best.err)) best = f; };
  for (const sg of [1, -1]) for (let i = 0; i <= 40; i++) keep(tryK(sg * 0.5 * Math.pow(16, i / 40) / w)); // k·w da 0.5 a 8
  if (!best) return null;
  for (let step = Math.abs(best.k) * 0.04, n = 0; n < 12; n++, step /= 2) { keep(tryK(best.k + step)); keep(tryK(best.k - step)); }
  return best;
}

// Autovalori e autovettori di una matrice simmetrica (rotazioni di Jacobi)
function eigSym(A) {
  const n = A.length, a = A.map(r => [...r]), V = a.map((_, i) => a.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, tot = 0;
    for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) { tot += a[p][q] * a[p][q]; if (p !== q) off += a[p][q] * a[p][q]; }
    if (off < 1e-26 * tot) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const tt = (th < 0 ? -1 : 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return { vals: a.map((r, i) => r[i]), V };
}

// Iperbole come conica generale. mode: 'gen' qualsiasi, 'noXY' assi paralleli agli assi cartesiani,
// 'rect' equilatera con asintoti orizzontale e verticale, cioè y = c/(x − h) + k
function fitHyperbola(Q, mode) {
  let A, B, C, D, E, F;
  if (mode === 'rect') {
    const w = lsq(Q.map(p => [p.x, p.y, 1]), Q.map(p => -p.x * p.y));
    if (!w) return null;
    [A, B, C, D, E, F] = [0, 1, 0, w[0], w[1], w[2]];
  } else {
    const sc = Math.sqrt(Q.reduce((s, p) => s + p.x * p.x + p.y * p.y, 0) / Q.length) || 1; // scala: termini confrontabili
    const rows = Q.map(p => { const x = p.x / sc, y = p.y / sc; return mode === 'noXY' ? [x * x, y * y, x, y, 1] : [x * x, x * y, y * y, x, y, 1]; });
    const n = rows[0].length, S = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const r of rows) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i][j] += r[i] * r[j];
    const { vals, V } = eigSym(S);
    let j = 0; vals.forEach((v, i) => { if (v < vals[j]) j = i; });
    const w = V.map(r => r[j]); // autovettore dell'autovalore minimo
    if (mode === 'noXY') w.splice(1, 0, 0);
    [A, B, C, D, E, F] = [w[0] / sc / sc, w[1] / sc / sc, w[2] / sc / sc, w[3] / sc, w[4] / sc, w[5]];
  }
  if (B * B - 4 * A * C <= 0) return null;
  const c = solve([[2 * A, B], [B, 2 * C]], [-D, -E]);
  if (!c) return null;
  const F0 = F + (D * c[0] + E * c[1]) / 2;
  const m = (A + C) / 2, d = Math.hypot((A - C) / 2, B / 2), t0 = 0.5 * Math.atan2(B, A - C);
  const l1 = m + d, l2 = m - d; // l1 > 0 > l2
  if (!(Math.abs(F0) > 1e-12)) return null;
  let a2, b2, th; // th = direzione dell'asse trasverso (quello che taglia i due rami)
  if (-F0 / l1 > 0) { a2 = -F0 / l1; b2 = F0 / l2; th = t0; } else { a2 = -F0 / l2; b2 = F0 / l1; th = t0 + Math.PI / 2; }
  th = Math.atan(Math.tan(th));
  const ex = Math.cos(th), ey = Math.sin(th);
  let pos = 0, vmax = 0;
  for (const p of Q) {
    const dx = p.x - c[0], dy = p.y - c[1];
    if (dx * ex + dy * ey > 0) pos++;
    vmax = Math.max(vmax, Math.abs(dy * ex - dx * ey));
  }
  const fr = pos / Q.length;
  const err = rms(Q.map(p => {
    const f = A * p.x * p.x + B * p.x * p.y + C * p.y * p.y + D * p.x + E * p.y + F;
    return f / (Math.hypot(2 * A * p.x + B * p.y + D, B * p.x + 2 * C * p.y + E) || 1e-9);
  }));
  return { cx: c[0], cy: c[1], a: Math.sqrt(a2), b: Math.sqrt(b2), th, err, two: Math.min(fr, 1 - fr) >= 0.15, sign: fr >= 0.5 ? 1 : -1, vmax };
}

// Ricerca su un parametro non lineare: griglia + raffinamento attorno al migliore
function search1D(grid, tryP, key) {
  let best = null;
  const keep = f => { if (f && isFinite(f.err) && (!best || f.err < best.err)) best = f; };
  grid.forEach(g => keep(tryP(g)));
  if (!best) return null;
  for (let step = (grid[1] - grid[0]) || 1e-3, n = 0; n < 14; n++, step /= 2) { keep(tryP(best[key] + step)); keep(tryP(best[key] - step)); }
  return best;
}

// Sinusoide y = a·sin(ωx) + b·cos(ωx) + C, con almeno ~un periodo visibile
function fitSine(Q) {
  const U = Q.map(p => p.x), V = Q.map(p => p.y), lo = Math.min(...U), hi = Math.max(...U), w = hi - lo;
  if (w < 1e-6) return null;
  const tryW = om => {
    const c = lsq(U.map(u => [Math.sin(om * u), Math.cos(om * u), 1]), V);
    if (!c) return null;
    const err = rms(U.map((u, i) => {
      const sn = Math.sin(om * u), cs = Math.cos(om * u);
      return (V[i] - c[0] * sn - c[1] * cs - c[2]) / Math.sqrt(1 + (om * (c[0] * cs - c[1] * sn)) ** 2);
    }));
    return { a: c[0], b: c[1], C: c[2], om, err, lo, hi };
  };
  const grid = Array.from({ length: 120 }, (_, i) => 2 * Math.PI * (0.9 + 5.1 * i / 119) / w); // da 0.9 a 6 periodi
  const best = search1D(grid, tryW, 'om');
  return best && best.om * w >= 2 * Math.PI * 0.85 ? best : null;
}

// Valore assoluto y = a·|x − h| + m·x + k (m = 0 se la "V" è simmetrica)
function fitAbs(Q) {
  const U = Q.map(p => p.x), V = Q.map(p => p.y), lo = Math.min(...U), hi = Math.max(...U), w = hi - lo;
  if (w < 1e-6) return null;
  const tryH = sym => h => {
    if (h < lo + 0.08 * w || h > hi - 0.08 * w) return null;
    const c = lsq(U.map(u => sym ? [Math.abs(u - h), 1] : [Math.abs(u - h), u, 1]), V);
    if (!c) return null;
    const a = c[0], m = sym ? 0 : c[1], k = sym ? c[1] : c[2];
    const err = rms(U.map((u, i) => (V[i] - a * Math.abs(u - h) - m * u - k) / Math.sqrt(1 + (a * Math.sign(u - h) + m) ** 2)));
    return { a, m, k, h, err, lo, hi };
  };
  const grid = Array.from({ length: 60 }, (_, i) => lo + w * (0.1 + 0.8 * i / 59));
  const s = search1D(grid, tryH(true), 'h'), g = search1D(grid, tryH(false), 'h');
  return s && g ? (s.err <= 1.15 * g.err ? s : g) : (s || g);
}

// p(u) → p(u − h) + k
function shiftPoly(c, h, k) {
  let r = [c[c.length - 1]];
  for (let i = c.length - 2; i >= 0; i--) {
    const n = new Array(r.length + 1).fill(0);
    for (let j = 0; j < r.length; j++) { n[j + 1] += r[j]; n[j] -= h * r[j]; }
    n[0] += c[i]; r = n;
  }
  r[0] += k;
  return r;
}

// Frazione di angolo giro coperta dai punti attorno a (cx, cy)
function coverage(Q, cx, cy) {
  const bins = new Uint8Array(36);
  for (const p of Q) bins[Math.floor((Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (2 * Math.PI) * 36) % 36] = 1;
  return bins.reduce((s, v) => s + v, 0) / 36;
}

// ── Formattazione ──
// fine=true tiene una cifra in più: serve ai coefficienti di x², x³ che sono spesso piccoli
function fmt(n, fine) {
  const a = Math.abs(n);
  let s = a.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 || !fine ? 2 : 3);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
const num = n => (n < 0 && fmt(n) !== '0' ? '−' : '') + fmt(n);
function expr(terms) {
  let out = '';
  for (const [c, s] of terms) {
    const f = fmt(c, /[²³]/.test(s));
    if (f === '0') continue;
    const body = (f === '1' && s) ? s : f + s;
    out += out ? (c < 0 ? ' − ' : ' + ') + body : (c < 0 ? '−' : '') + body;
  }
  return out || '0';
}
const sq = (v, h) => fmt(h) === '0' ? v + '²' : `(${v} ${h < 0 ? '+' : '−'} ${fmt(h)})²`;
const pt = (x, y) => `(${num(x)}, ${num(y)})`;

// ── Riconoscimento: sceglie il modello più semplice che spiega i punti ──
function analyze(P) {
  if (P.length < 8) return null;
  let mx = 0, my = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of P) {
    mx += p.x; my += p.y;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  mx /= P.length; my /= P.length;
  const diag = Math.hypot(x1 - x0, y1 - y0);
  if (diag < 0.4) return null;
  const Q = P.map(p => ({ x: p.x - mx, y: p.y - my })); // centrati: fit meglio condizionati
  const done = (r, err) => ({ ...r, err, rel: err / diag, quality: Math.max(0, Math.min(1, 1 - (err / diag) / 0.08)) });

  // Retta
  const L = fitLine(Q);
  if (L.minor / L.major < 0.05) {
    const c = Math.cos(L.th), s = Math.sin(L.th);
    let eq, det;
    if (Math.abs(c) < 0.035) { eq = `x = ${num(mx)}`; det = [[t('type'), t('vertical')]]; }
    else if (Math.abs(s) < 0.035) { eq = `y = ${num(my)}`; det = [[t('type'), t('horizontal')]]; }
    else {
      const m = s / c, q = my - m * mx;
      eq = 'y = ' + expr([[m, 'x'], [q, '']]);
      det = [[t('slope'), num(m)], [t('intercept'), num(q)]];
    }
    return done({ name: t('line'), eq, details: det, shape: { kind: 'line', x: mx, y: my, th: L.th } }, L.minor);
  }

  const mkCircle = C => {
    const h = C.cx + mx, k = C.cy + my;
    return done({
      name: t('circle'), eq: `${sq('x', h)} + ${sq('y', k)} = ${fmt(C.r * C.r)}`,
      details: [[t('center'), pt(h, k)], [t('radius'), fmt(C.r)]],
      shape: { kind: 'ellipse', x: h, y: k, a: C.r, b: C.r, th: 0 }
    }, C.err);
  };
  const mkEllipse = E => {
    const deg = E.th * 180 / Math.PI;
    if (Math.abs(deg) < 10 || Math.abs(deg) > 80) E = fitEllipse(Q, true) || E; // quasi allineata agli assi
    const h = E.cx + mx, k = E.cy + my, c = Math.cos(E.th), s = Math.sin(E.th);
    const aligned = Math.abs(s) < 1e-6 || Math.abs(c) < 1e-6;
    let eq;
    if (aligned) {
      const rx = Math.abs(c) > .5 ? E.a : E.b, ry = Math.abs(c) > .5 ? E.b : E.a;
      eq = `${sq('x', h)}/${fmt(rx * rx)} + ${sq('y', k)}/${fmt(ry * ry)} = 1`;
    } else {
      const ia = 1 / (E.a * E.a), ib = 1 / (E.b * E.b);
      let A = c * c * ia + s * s * ib, B = 2 * c * s * (ia - ib), C = s * s * ia + c * c * ib;
      let D = -2 * A * h - B * k, Ee = -B * h - 2 * C * k, F = A * h * h + B * h * k + C * k * k - 1;
      const n = Math.max(A, C);
      eq = expr([[A / n, 'x²'], [B / n, 'xy'], [C / n, 'y²'], [D / n, 'x'], [Ee / n, 'y'], [F / n, '']]) + ' = 0';
    }
    const det = [[t('center'), pt(h, k)], [t('semiaxes'), `${fmt(E.a)} · ${fmt(E.b)}`]];
    if (!aligned) det.push([t('rotation'), num(E.th * 180 / Math.PI) + '°']);
    return done({ name: t('ellipse'), eq, details: det, shape: { kind: 'ellipse', x: h, y: k, a: E.a, b: E.b, th: E.th } }, E.err);
  };
  const mkPoly = (F, swap) => {
    const c = shiftPoly(F.c, swap ? my : mx, swap ? mx : my);
    const u = swap ? 'y' : 'x', v = swap ? 'x' : 'y', deg = c.length - 1;
    const eq = `${v} = ` + expr(c.map((k, i) => [k, i === 0 ? '' : i === 1 ? u : u + '²³'[i - 2]]).reverse());
    let det;
    if (deg === 2) {
      const vu = -c[1] / (2 * c[2]), vv = c[0] - c[1] * c[1] / (4 * c[2]);
      det = [[t('vertex'), swap ? pt(vv, vu) : pt(vu, vv)], [t('axis'), `${u} = ${num(vu)}`]];
    } else det = [[t('inflection'), `x = ${num(-c[2] / (3 * c[3]))}`]];
    const off = swap ? my : mx;
    if (deg === 2 && swap) { // mezza parabola orizzontale = radice quadrata
      const lo = F.lo + my, hi = F.hi + my, r = hi - lo, vu = -c[1] / (2 * c[2]), vv = c[0] - c[1] * c[1] / (4 * c[2]);
      const up = lo >= vu - 0.08 * r, down = hi <= vu + 0.08 * r;
      if (up || down) {
        const inner = fmt(vv) === '0' ? (c[2] > 0 ? 'x' : '−x') : c[2] > 0 ? `x ${vv < 0 ? '+' : '−'} ${fmt(vv)}` : `${num(vv)} − x`;
        return done({
          name: t('sqrt'), eq: 'y = ' + expr([[(up ? 1 : -1) / Math.sqrt(Math.abs(c[2])), `√(${inner})`], [vu, '']]),
          details: [[t('start'), pt(vv, vu)], [t('domain'), `x ${c[2] > 0 ? '≥' : '≤'} ${num(vv)}`]],
          shape: { kind: 'poly', c, swap, lo: F.lo + off, hi: F.hi + off }
        }, F.err);
      }
    }
    return done({ name: deg === 2 ? t('parabola') : t('cubic'), eq, details: det, shape: { kind: 'poly', c, swap, lo: F.lo + off, hi: F.hi + off } }, F.err);
  };

  const mkExp = (F, swap) => {
    const mu = swap ? my : mx, mv = swap ? mx : my;
    const A = F.A * Math.exp(-F.k * mu), k = F.k, c0 = F.C + mv; // in coordinate reali
    const shape = { kind: 'exp', A, k, C: c0, swap, lo: F.lo + mu, hi: F.hi + mu };
    if (!swap) {
      const tail = expr([[c0, '']]) === '0' ? '' : (c0 < 0 ? ' − ' : ' + ') + fmt(c0);
      const head = (A < 0 ? '−' : '') + (fmt(A, true) === '1' ? '' : fmt(A, true)), ex = (fmt(k, true) === '1' ? (k < 0 ? '−' : '') : num(k)) + 'x';
      return done({
        name: t('exponential'), eq: `y = ${head}e^(${ex})${tail}`,
        html: `<i>y</i> = ${head}<i>e</i><sup>${ex.replace('x', '<i>x</i>')}</sup>${tail}`,
        details: [[t('asymptote'), `y = ${num(c0)}`], [t('growth'), num(k)]], shape
      }, F.err);
    }
    // x = A·e^(k·y) + c  ⇔  y = a·ln(±(x − c)) + b
    const a = 1 / k, b = -Math.log(Math.abs(A)) / k, z = fmt(c0) === '0';
    const arg = A > 0 ? (z ? 'x' : `x ${c0 < 0 ? '+' : '−'} ${fmt(c0)}`) : (z ? '−x' : `${num(c0)} − x`);
    return done({
      name: t('logarithm'), eq: 'y = ' + expr([[a, `ln(${arg})`], [b, '']]),
      details: [[t('asymptote'), `x = ${num(c0)}`], [t('domain'), A > 0 ? `x > ${num(c0)}` : `x < ${num(c0)}`]], shape
    }, F.err);
  };

  const tail = k => fmt(k) === '0' ? '' : (k < 0 ? ' − ' : ' + ') + fmt(k);

  const mkHyp = H => {
    const deg = Math.abs(H.th * 180 / Math.PI), ratio = H.b / H.a;
    let form = 'gen';
    if (Math.abs(deg - 45) < 12 && ratio > 0.75 && ratio < 1.33) {
      const R = fitHyperbola(Q, 'rect');
      if (R && R.err < 1.3 * H.err) { H = R; form = 'rect'; }
    } else if (deg < 10 || deg > 80) {
      const R = fitHyperbola(Q, 'noXY');
      if (R && R.err < 1.3 * H.err) { H = R; form = 'axis'; }
    }
    const h = H.cx + mx, k = H.cy + my, c = Math.cos(H.th), s = Math.sin(H.th), a2 = H.a * H.a, b2 = H.b * H.b;
    let eq, det = [[t('center'), pt(h, k)]];
    if (form === 'rect') {
      const cst = (H.th > 0 ? 1 : -1) * a2 / 2;
      eq = `y = ${num(cst)}/${fmt(h) === '0' ? 'x' : `(x ${h < 0 ? '+' : '−'} ${fmt(h)})`}${tail(k)}`;
      det.push([t('asymptotes'), `x = ${num(h)}, y = ${num(k)}`]);
    } else if (form === 'axis') {
      eq = Math.abs(c) > .5 ? `${sq('x', h)}/${fmt(a2)} − ${sq('y', k)}/${fmt(b2)} = 1` : `${sq('y', k)}/${fmt(a2)} − ${sq('x', h)}/${fmt(b2)} = 1`;
      det.push([t('semiaxes'), `${fmt(H.a)} · ${fmt(H.b)}`]);
    } else {
      const A = c * c / a2 - s * s / b2, B = 2 * c * s * (1 / a2 + 1 / b2), C = s * s / a2 - c * c / b2;
      const D = -2 * A * h - B * k, E = -B * h - 2 * C * k, F = A * h * h + B * h * k + C * k * k - 1;
      const n = [A, B, C].reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
      eq = expr([[A / n, 'x²'], [B / n, 'xy'], [C / n, 'y²'], [D / n, 'x'], [E / n, 'y'], [F / n, '']]) + ' = 0';
      det.push([t('semiaxes'), `${fmt(H.a)} · ${fmt(H.b)}`], [t('rotation'), num(H.th * 180 / Math.PI) + '°']);
    }
    return done({
      name: t('hyperbola'), eq, details: det,
      shape: { kind: 'hyp', x: h, y: k, a: H.a, b: H.b, th: H.th, signs: H.two ? [1, -1] : [H.sign], S: Math.asinh(H.vmax / H.b) * 1.15 + 0.15 }
    }, H.err);
  };

  const mkSine = F => {
    const R = Math.hypot(F.a, F.b), om = F.om, C0 = F.C + my;
    let ph = Math.atan2(F.b, F.a) - om * mx;
    ph = Math.atan2(Math.sin(ph), Math.cos(ph)); // in (−π, π]
    const amp = fmt(R) === '1' ? '' : fmt(R), ox = (fmt(om, true) === '1' ? '' : fmt(om, true)) + 'x';
    return done({
      name: t('sine'), eq: `y = ${amp}sin(${ox}${tail(ph)})${tail(C0)}`,
      details: [[t('amplitude'), fmt(R)], [t('period'), fmt(2 * Math.PI / om)]],
      shape: { kind: 'fn', f: x => R * Math.sin(om * x + ph) + C0, lo: F.lo + mx, hi: F.hi + mx }
    }, F.err);
  };

  const mkAbs = F => {
    const h = F.h + mx, m = F.m, q = F.k - m * mx + my, a = F.a;
    return done({
      name: t('absolute'), eq: 'y = ' + expr([[a, `|${fmt(h) === '0' ? 'x' : `x ${h < 0 ? '+' : '−'} ${fmt(h)}`}|`], [m, 'x'], [q, '']]),
      details: [[t('vertex'), pt(h, m * h + q)]],
      shape: { kind: 'fn', f: x => a * Math.abs(x - h) + m * x + q, lo: F.lo + mx, hi: F.hi + mx }
    }, F.err);
  };

  const C = fitCircle(Q);
  let E = fitEllipse(Q);
  if (E && E.a > 3 * diag) E = null;
  const ctr = E || C;
  const cov = ctr ? coverage(Q, ctr.cx, ctr.cy) : 0;

  const pv = fitPoly(Q, 2, false), ph = fitPoly(Q, 2, true), cu = fitPoly(Q, 3, false);
  const openErr = Math.min(pv ? pv.err : Infinity, ph ? ph.err : Infinity);

  // Iperbole con entrambi i rami disegnati: nessun altro modello la descrive
  let Hy = fitHyperbola(Q, 'gen');
  if (Hy && (Math.hypot(Hy.cx, Hy.cy) > 3 * diag || Hy.a > 3 * diag || Hy.b > 30 * Hy.a)) Hy = null;
  if (Hy && Hy.two && Hy.err / diag < 0.03 && Hy.err < 0.5 * openErr) return mkHyp(Hy);

  // Curva chiusa (solo se spiega i punti meglio di una parabola)
  if (cov >= 0.8 && Math.min(E ? E.err : Infinity, C ? C.err : Infinity) < openErr) {
    if (E && E.b / E.a < 0.82) return mkEllipse(E);
    if (C) return mkCircle(C);
    if (E) return mkEllipse(E);
  }

  // Curva aperta: confronto degli scarti, penalizzando i modelli meno probabili
  const cands = [];
  if (pv) cands.push([pv.err, () => mkPoly(pv, false)]);
  if (ph) cands.push([ph.err, () => mkPoly(ph, true)]);
  if (C && C.r < 4 * diag) cands.push([C.err * 1.15, () => mkCircle(C)]);
  const ev = fitExp(Q, false), eh = fitExp(Q, true);
  if (ev) cands.push([ev.err * 1.1, () => mkExp(ev, false)]);
  if (eh) cands.push([eh.err * 1.1, () => mkExp(eh, true)]);
  if (E && cov >= 0.6) cands.push([E.err * 1.3, () => mkEllipse(E)]);
  if (Hy) cands.push([Hy.err * 1.4, () => mkHyp(Hy)]);
  const sn = fitSine(Q), ab = fitAbs(Q);
  if (sn && Math.hypot(sn.a, sn.b) > 0.02 * diag) cands.push([sn.err * 1.25, () => mkSine(sn)]);
  if (ab && Math.abs(ab.a) > 0.15) cands.push([ab.err * 1.2, () => mkAbs(ab)]);
  if (!cands.length) return null;
  cands.sort((a, b) => a[0] - b[0]);
  if (cu && Math.abs(cu.c[3]) > 1e-9) {
    const xi = -cu.c[2] / (3 * cu.c[3]), w = cu.hi - cu.lo;
    if (cu.err < 0.6 * cands[0][0] && xi > cu.lo + 0.15 * w && xi < cu.hi - 0.15 * w) return mkPoly(cu, false);
  }
  return cands[0][1]();
}

// ── Forma libera: serie di Fourier parametrica x(t), y(t) ──
// Curva chiusa → serie completa su [0, 2π]; aperta → serie di soli coseni su [0, π].
const FREE_T = 0.03, MAX_HARM = 10;

// M punti equidistanti lungo il percorso
function uniform(path, M, closed) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const L = cum[cum.length - 1], out = [];
  for (let i = 0, j = 1; i < M; i++) {
    const d = L * i / (closed ? M : M - 1);
    while (j < path.length - 1 && cum[j] < d) j++;
    const t = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    out.push({ x: path[j - 1].x + (path[j].x - path[j - 1].x) * t, y: path[j - 1].y + (path[j].y - path[j - 1].y) * t });
  }
  return out;
}

const evalSeries = (a, b, t) => a.reduce((s, ak, k) => s + ak * Math.cos(k * t) + b[k] * Math.sin(k * t), 0);

function seriesText(a, b) {
  const terms = [[a[0], '']];
  for (let k = 1; k < a.length; k++) {
    const kt = (k > 1 ? k : '') + 't';
    terms.push([a[k], 'cos ' + kt], [b[k], 'sin ' + kt]);
  }
  return expr(terms);
}

function fitFree(strokes) {
  const path = strokes.flat();
  if (path.length < 8) return null;
  const xs = path.map(p => p.x), ys = path.map(p => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diag < 0.4) return null;
  const first = path[0], last = path[path.length - 1];
  const closed = Math.hypot(first.x - last.x, first.y - last.y) < 0.2 * diag;
  const M = 256, S = uniform(closed ? [...path, first] : path, M, closed);
  const T = S.map((_, i) => closed ? 2 * Math.PI * i / M : Math.PI * (i + 0.5) / M);
  const mean = f => S.reduce((s, p, i) => s + f(p, T[i]), 0) / M;

  const ax = [mean(p => p.x)], bx = [0], ay = [mean(p => p.y)], by = [0];
  const rx = S.map(() => ax[0]), ry = S.map(() => ay[0]);
  let err = Infinity;
  for (let k = 1; k <= MAX_HARM; k++) {
    ax.push(2 * mean((p, t) => p.x * Math.cos(k * t))); ay.push(2 * mean((p, t) => p.y * Math.cos(k * t)));
    bx.push(closed ? 2 * mean((p, t) => p.x * Math.sin(k * t)) : 0); by.push(closed ? 2 * mean((p, t) => p.y * Math.sin(k * t)) : 0);
    T.forEach((t, i) => {
      rx[i] += ax[k] * Math.cos(k * t) + bx[k] * Math.sin(k * t);
      ry[i] += ay[k] * Math.cos(k * t) + by[k] * Math.sin(k * t);
    });
    err = rms(S.map((p, i) => Math.hypot(p.x - rx[i], p.y - ry[i])));
    if (err / diag < 0.01) break;
  }
  // termini trascurabili via: equazione più corta, e la curva disegnata resta quella scritta
  for (const c of [ax, bx, ay, by]) for (let k = 1; k < c.length; k++) if (Math.abs(c[k]) < 0.025) c[k] = 0;
  const tx = seriesText(ax, bx), ty = seriesText(ay, by);
  const it = b => b.replace(/t/g, '<i>t</i>'), fn = b => b.replace(/−/g, '-').replace(/(cos|sin) (\d*t)/g, '$1($2)');
  return {
    name: t('freeCurve'), free: true,
    eq: `x(t) = ${fn(tx)}\ny(t) = ${fn(ty)}`,
    html: `<i>x</i>(<i>t</i>) = ${it(tx)}<br><i>y</i>(<i>t</i>) = ${it(ty)}`,
    details: [[t('type'), closed ? t('closed') : t('open')], [t('harmonics'), ax.length - 1], [t('interval'), closed ? '0 ≤ t ≤ 2π' : '0 ≤ t ≤ π']],
    err, rel: err / diag, quality: Math.max(0, Math.min(1, 1 - (err / diag) / 0.08)),
    shape: { kind: 'param', ax, bx, ay, by, T: closed ? 2 * Math.PI : Math.PI }
  };
}

// Sceglie tra forma classica e curva libera; l'altra resta disponibile in .alt
function recognize(strokes) {
  const classic = analyze(strokes.flat()), free = fitFree(strokes);
  if (!classic || !free) return classic || free;
  const pick = classic.rel > FREE_T && free.err < 0.5 * classic.err ? free : classic;
  const other = pick === free ? classic : free;
  pick.alt = other; other.alt = pick;
  return pick;
}
