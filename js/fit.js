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

// Sinusoide y = a·sin(ωx) + b·cos(ωx) + m·x + C (m, opzionale, assorbe un'eventuale inclinazione)
function fitSine(Q, trend) {
  const U = Q.map(p => p.x), V = Q.map(p => p.y), lo = Math.min(...U), hi = Math.max(...U), w = hi - lo;
  if (w < 1e-6) return null;
  const tryW = om => {
    const c = lsq(U.map(u => trend ? [Math.sin(om * u), Math.cos(om * u), 1, u] : [Math.sin(om * u), Math.cos(om * u), 1]), V);
    if (!c) return null;
    c[3] = c[3] || 0;
    const err = rms(U.map((u, i) => {
      const sn = Math.sin(om * u), cs = Math.cos(om * u);
      return (V[i] - c[0] * sn - c[1] * cs - c[2] - c[3] * u) / Math.sqrt(1 + (om * (c[0] * cs - c[1] * sn) + c[3]) ** 2);
    }));
    return { a: c[0], b: c[1], C: c[2], m: c[3], om, err, lo, hi };
  };
  // servono più periodi visibili se c'è anche l'inclinazione, altrimenti il modello imita qualsiasi curva a S
  const minP = trend ? 1.5 : 1;
  const grid = Array.from({ length: 120 }, (_, i) => 2 * Math.PI * (minP + (6 - minP) * i / 119) / w);
  const best = search1D(grid, tryW, 'om');
  return best && best.om * w >= 2 * Math.PI * minP * 0.97 ? best : null;
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

// ── Modelli ──
// Ogni forma riconosciuta è un "modello": parametri p in coordinate reali, distanza punto-curva
// e una funzione che dai parametri costruisce equazione, dettagli e disegno.
// Avere i parametri separati dal testo permette poi di arrotondarli (vedi simplify).
const RAD = Math.PI / 180;
const tail = k => fmt(k) === '0' ? '' : (k < 0 ? ' − ' : ' + ') + fmt(k);
const over = (term, d) => fmt(d) === '1' ? term : `${term}/${fmt(d)}`;                           // omette "/1"
const shift = (v, h) => fmt(h) === '0' ? v : `${v} ${h < 0 ? '+' : '−'} ${fmt(h)}`;            // "x − 2"
const flip = (v, h) => fmt(h) === '0' ? '−' + v : `${num(h)} − ${v}`;                           // "2 − x"
const coef = (a, fine) => (a < 0 ? '−' : '') + (fmt(a, fine) === '1' ? '' : fmt(a, fine));      // "", "−", "2.5"

// distanza per y = f(x) (oppure x = f(y) con swap)
const explicit = (f, swap) => (p, q) => {
  const u = swap ? q.y : q.x, v = swap ? q.x : q.y, y = f(p, u), d = (f(p, u + 1e-4) - y) / 1e-4;
  return (v - y) / Math.sqrt(1 + d * d);
};
// distanza per le coniche a centro u²/a² + s·v²/b² = 1, ruotate di th attorno a (h, k)
const conicDist = (q, h, k, a, b, th, s) => {
  const c = Math.cos(th), sn = Math.sin(th), dx = q.x - h, dy = q.y - k, u = dx * c + dy * sn, v = dy * c - dx * sn;
  return (u * u / (a * a) + s * v * v / (b * b) - 1) / (Math.hypot(2 * u / (a * a), 2 * v / (b * b)) || 1e-9);
};
const generalConic = (h, k, a, b, th, s) => {
  const c = Math.cos(th), sn = Math.sin(th), ia = 1 / (a * a), ib = s / (b * b);
  const A = c * c * ia + sn * sn * ib, B = 2 * c * sn * (ia - ib), C = sn * sn * ia + c * c * ib;
  const D = -2 * A * h - B * k, E = -B * h - 2 * C * k, F = A * h * h + B * h * k + C * k * k - 1;
  const n = [A, B, C].reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
  return expr([[A / n, 'x²'], [B / n, 'xy'], [C / n, 'y²'], [D / n, 'x'], [E / n, 'y'], [F / n, '']]) + ' = 0';
};
const hypShape = (h, k, a, b, th, g) => ({ kind: 'hyp', x: h, y: k, a, b, th, signs: g.two ? [1, -1] : [g.sign], S: Math.asinh(g.vmax / b) * 1.15 + 0.15 });

const buildCircle = (h, k, r) => ({
  name: t('circle'), eq: `${sq('x', h)} + ${sq('y', k)} = ${fmt(r * r)}`,
  details: [[t('center'), pt(h, k)], [t('radius'), fmt(Math.abs(r))]],
  shape: { kind: 'ellipse', x: h, y: k, a: Math.abs(r), b: Math.abs(r), th: 0 }
});
const buildEllipseA = (h, k, rx, ry) => fmt(rx * rx) === fmt(ry * ry) ? buildCircle(h, k, rx) : ({
  name: t('ellipse'), eq: `${over(sq('x', h), rx * rx)} + ${over(sq('y', k), ry * ry)} = 1`,
  details: [[t('center'), pt(h, k)], [t('semiaxes'), `${fmt(Math.max(rx, ry))} · ${fmt(Math.min(rx, ry))}`]],
  shape: { kind: 'ellipse', x: h, y: k, a: Math.abs(rx), b: Math.abs(ry), th: 0 }
});
const buildHypA = (h, k, a, b, horiz, th, g) => ({
  name: t('hyperbola'),
  eq: horiz ? `${over(sq('x', h), a * a)} − ${over(sq('y', k), b * b)} = 1` : `${over(sq('y', k), a * a)} − ${over(sq('x', h), b * b)} = 1`,
  details: [[t('center'), pt(h, k)], [t('semiaxes'), `${fmt(a)} · ${fmt(b)}`]],
  shape: hypShape(h, k, a, b, th, g)
});
const aligned = deg => Math.abs(Math.sin(2 * deg * RAD)) < 1e-6;

const MODELS = {
  lineV: () => ({
    dist: (p, q) => q.x - p[0],
    build: p => ({ name: t('line'), eq: `x = ${num(p[0])}`, details: [[t('type'), t('vertical')]], shape: { kind: 'line', x: p[0], y: 0, th: Math.PI / 2 } })
  }),
  lineH: () => ({
    dist: (p, q) => q.y - p[0],
    build: p => ({ name: t('line'), eq: `y = ${num(p[0])}`, details: [[t('type'), t('horizontal')]], shape: { kind: 'line', x: 0, y: p[0], th: 0 } })
  }),
  line: () => ({ // y = m·x + q
    dist: explicit((p, x) => p[0] * x + p[1]),
    build: p => ({
      name: t('line'), eq: 'y = ' + expr([[p[0], 'x'], [p[1], '']]),
      details: [[t('slope'), num(p[0])], [t('intercept'), num(p[1])]], shape: { kind: 'line', x: 0, y: p[1], th: Math.atan(p[0]) }
    })
  }),
  circle: () => ({ dist: (p, q) => Math.hypot(q.x - p[0], q.y - p[1]) - Math.abs(p[2]), build: p => buildCircle(p[0], p[1], p[2]) }),
  ellipseA: () => ({ dist: (p, q) => conicDist(q, p[0], p[1], p[2], p[3], 0, 1), build: p => buildEllipseA(p[0], p[1], p[2], p[3]) }),
  ellipseR: () => ({ // semiassi a ≥ b, asse maggiore ruotato di deg gradi
    grids: [, , , , [0, 90, 45, 15, 5, 1]],
    dist: (p, q) => conicDist(q, p[0], p[1], p[2], p[3], p[4] * RAD, 1),
    build: ([h, k, a, b, deg]) => aligned(deg)
      ? (Math.abs(Math.cos(deg * RAD)) > .5 ? buildEllipseA(h, k, a, b) : buildEllipseA(h, k, b, a))
      : ({
        name: t('ellipse'), eq: generalConic(h, k, a, b, deg * RAD, 1),
        details: [[t('center'), pt(h, k)], [t('semiaxes'), `${fmt(a)} · ${fmt(b)}`], [t('rotation'), num(deg) + '°']],
        shape: { kind: 'ellipse', x: h, y: k, a, b, th: deg * RAD }
      })
  }),
  parabola: (swap, lo, hi) => ({ // v = a·(u − h)² + k
    freeT: 0.05, // una "U" a mano resta una parabola anche se un po' sformata
    dist: explicit((p, u) => p[0] * (u - p[1]) ** 2 + p[2], swap),
    build: ([a, h, k]) => {
      const u = swap ? 'y' : 'x', v = swap ? 'x' : 'y', c = [a * h * h + k, -2 * a * h, a];
      return {
        name: t('parabola'), eq: `${v} = ` + expr([[c[2], u + '²'], [c[1], u], [c[0], '']]),
        details: [[t('vertex'), swap ? pt(k, h) : pt(h, k)], [t('axis'), `${u} = ${num(h)}`]],
        shape: { kind: 'poly', c, swap, lo, hi }
      };
    }
  }),
  sqrt: (dir, lo, hi) => ({ // y = a·√(dir·(x − h)) + k, cioè mezza parabola orizzontale
    dist: explicit((p, u) => p[1] + dir * ((u - p[2]) / p[0]) ** 2, true),
    build: ([a, h, k]) => ({
      name: t('sqrt'), eq: 'y = ' + expr([[a, dir > 0 && fmt(h) === '0' ? '√x' : `√(${dir > 0 ? shift('x', h) : flip('x', h)})`], [k, '']]),
      details: [[t('start'), pt(h, k)], [t('domain'), `x ${dir > 0 ? '≥' : '≤'} ${num(h)}`]],
      shape: { kind: 'poly', c: [h + dir * k * k / (a * a), -2 * dir * k / (a * a), dir / (a * a)], swap: true, lo, hi, min: a > 0 ? k : -Infinity, max: a > 0 ? Infinity : k }
    })
  }),
  cubic: (lo, hi) => ({ // y = a·(x − h)³ + b·(x − h) + k, con (h, k) punto di flesso
    dist: explicit((p, u) => p[0] * (u - p[1]) ** 3 + p[2] * (u - p[1]) + p[3]),
    build: ([a, h, b, k]) => {
      const c = [-a * h ** 3 - b * h + k, 3 * a * h * h + b, -3 * a * h, a];
      const eq = fmt(b) === '0'
        ? `y = ${coef(a, true)}${fmt(h) === '0' ? 'x³' : `(${shift('x', h)})³`}${tail(k)}`
        : 'y = ' + expr([[c[3], 'x³'], [c[2], 'x²'], [c[1], 'x'], [c[0], '']]);
      return { name: t('cubic'), eq, details: [[t('inflection'), pt(h, k)]], shape: { kind: 'poly', c, swap: false, lo, hi } };
    }
  }),
  exp: (lo, hi) => ({ // y = A·e^(k·x) + C
    dist: explicit((p, u) => p[0] * Math.exp(p[1] * u) + p[2]),
    build: ([A, k, C]) => {
      const head = coef(A, true), ex = coef(k, true) + 'x';
      return {
        name: t('exponential'), eq: `y = ${head}e^(${ex})${tail(C)}`,
        html: `<i>y</i> = ${head}<i>e</i><sup>${ex.replace('x', '<i>x</i>')}</sup>${tail(C)}`,
        details: [[t('asymptote'), `y = ${num(C)}`], [t('growth'), num(k)]], shape: { kind: 'exp', A, k, C, swap: false, lo, hi }
      };
    }
  }),
  log: (sg, lo, hi) => ({ // y = a·ln(sg·(x − c)) + b
    dist: explicit((p, u) => p[1] + sg * Math.exp((u - p[2]) / p[0]), true),
    build: ([a, c, b]) => ({
      name: t('logarithm'), eq: 'y = ' + expr([[a, `ln(${sg > 0 ? shift('x', c) : flip('x', c)})`], [b, '']]),
      details: [[t('asymptote'), `x = ${num(c)}`], [t('domain'), `x ${sg > 0 ? '>' : '<'} ${num(c)}`]],
      shape: { kind: 'exp', A: sg * Math.exp(-b / a), k: 1 / a, C: c, swap: true, lo, hi }
    })
  }),
  hypRect: g => ({ // y = c/(x − h) + k
    dist: (p, q) => ((q.x - p[1]) * (q.y - p[2]) - p[0]) / (Math.hypot(q.y - p[2], q.x - p[1]) || 1e-9),
    build: ([c, h, k]) => {
      const a = Math.sqrt(2 * Math.abs(c));
      return {
        name: t('hyperbola'), eq: `y = ${num(c)}/${fmt(h) === '0' ? 'x' : `(${shift('x', h)})`}${tail(k)}`,
        details: [[t('center'), pt(h, k)], [t('asymptotes'), `x = ${num(h)}, y = ${num(k)}`]],
        shape: hypShape(h, k, a, a, (c > 0 ? 1 : -1) * Math.PI / 4, g)
      };
    }
  }),
  hypAxis: g => ({ // assi paralleli agli assi cartesiani
    dist: (p, q) => conicDist(q, p[0], p[1], p[2], p[3], g.th, -1),
    build: ([h, k, a, b]) => buildHypA(h, k, Math.abs(a), Math.abs(b), Math.abs(Math.cos(g.th)) > .5, g.th, g)
  }),
  hypGen: g => ({
    grids: [, , , , [0, 90, 45, 15, 5, 1]],
    dist: (p, q) => conicDist(q, p[0], p[1], p[2], p[3], p[4] * RAD, -1),
    build: ([h, k, a, b, deg]) => aligned(deg) ? buildHypA(h, k, a, b, Math.abs(Math.cos(deg * RAD)) > .5, deg * RAD, g) : ({
      name: t('hyperbola'), eq: generalConic(h, k, a, b, deg * RAD, -1),
      details: [[t('center'), pt(h, k)], [t('semiaxes'), `${fmt(a)} · ${fmt(b)}`], [t('rotation'), num(deg) + '°']],
      shape: hypShape(h, k, a, b, deg * RAD, g)
    })
  }),
  sine: (lo, hi) => ({ // y = R·sin(ω·x + φ) + m·x + C
    grids: [, , [0, Math.PI / 2, 0.1, 0.05, 0.01]],
    dist: explicit((p, u) => p[0] * Math.sin(p[1] * u + p[2]) + p[3] * u + p[4]),
    build: ([R, om, ph, m, C]) => ({
      name: t('sine'),
      eq: `y = ${coef(R)}sin(${coef(om, true)}x${tail(ph)})${fmt(m) === '0' ? '' : (m < 0 ? ' − ' : ' + ') + coef(Math.abs(m)) + 'x'}${tail(C)}`,
      details: [[t('amplitude'), fmt(R)], [t('period'), fmt(2 * Math.PI / om)]],
      shape: { kind: 'fn', f: x => R * Math.sin(om * x + ph) + m * x + C, lo, hi }
    })
  }),
  abs: (lo, hi) => ({ // y = a·|x − h| + m·x + q
    dist: explicit((p, u) => p[0] * Math.abs(u - p[1]) + p[2] * u + p[3]),
    build: ([a, h, m, q]) => ({
      name: t('absolute'), eq: 'y = ' + expr([[a, `|${shift('x', h)}|`], [m, 'x'], [q, '']]),
      details: [[t('vertex'), pt(h, m * h + q)]],
      shape: { kind: 'fn', f: x => a * Math.abs(x - h) + m * x + q, lo, hi }
    })
  })
};

// Costruisce il risultato di un modello con parametri p, misurando lo scarto sui punti P
function finish(model, p, P, diag) {
  let s = 0;
  for (const q of P) { const d = model.dist(p, q); s += d * d; }
  const err = Math.sqrt(s / P.length);
  return { ...model.build(p), err, rel: err / diag, quality: Math.max(0, Math.min(1, 1 - (err / diag) / 0.08)), diag, model: { ...model, p } };
}

// Minimizzazione senza derivate (Nelder–Mead)
function nelderMead(f, x0, iters = 140) {
  const n = x0.length, ev = x => ({ x, f: f(x) });
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => j === i ? v + Math.max(Math.abs(v) * 0.1, 0.1) : v))].map(ev);
  for (let it = 0; it < iters; it++) {
    S.sort((a, b) => a.f - b.f);
    const w = S[n], c = x0.map((_, j) => S.slice(0, n).reduce((s, v) => s + v.x[j], 0) / n);
    const at = k => ev(c.map((cj, j) => cj + k * (w.x[j] - cj)));
    const r = at(-1);
    if (r.f < S[0].f) { const e = at(-2); S[n] = e.f < r.f ? e : r; }
    else if (r.f < S[n - 1].f) S[n] = r;
    else {
      const k = at(r.f < w.f ? -0.5 : 0.5);
      if (k.f < Math.min(w.f, r.f)) S[n] = k;
      else S = S.map((v, i) => i ? ev(v.x.map((vj, j) => S[0].x[j] + 0.5 * (vj - S[0].x[j]))) : v);
    }
  }
  S.sort((a, b) => a.f - b.f);
  return S[0];
}

// Approssima l'equazione: porta i parametri, uno alla volta, al valore "tondo" più grossolano
// (0, intero, mezzo, decimo…) che non peggiora troppo l'aderenza, riadattando ogni volta gli altri.
const GRID = [0, 1, 0.5, 0.1, 0.05, 0.01];
function simplify(res, P) {
  const m = res.model;
  if (!m) return null;
  const stepN = Math.max(1, Math.floor(P.length / 150)), pts = P.filter((_, i) => i % stepN === 0);
  // i parametri non possono allontanarsi troppo da quelli trovati: evita soluzioni degeneri
  const near = p => p.every((v, j) => Math.abs(v - m.p[j]) <= 0.5 * Math.abs(m.p[j]) + 1);
  const E = p => {
    if (!near(p)) return Infinity;
    let s = 0;
    for (const q of pts) { const d = m.dist(p, q); s += d * d; }
    s = Math.sqrt(s / pts.length);
    return isFinite(s) ? s : Infinity;
  };
  let p = [...m.p];
  const e0 = E(p), tol = Math.max(1.25 * e0, e0 + 0.008 * res.diag), fixed = p.map(() => false);
  const grids = p.map((_, i) => (m.grids && m.grids[i]) || GRID);
  // un livello di arrotondamento alla volta per tutti i parametri: così nessuno si prende
  // un valore molto tondo lasciando agli altri solo decimali
  for (let lvl = 0; lvl < GRID.length; lvl++) for (let i = 0; i < p.length; i++) {
    if (fixed[i] || lvl >= grids[i].length) continue;
    const g = grids[i][lvl], trial = [...p]; trial[i] = g ? Math.round(p[i] / g) * g : 0;
    const free = p.map((_, j) => j).filter(j => j !== i && !fixed[j]);
    const put = x => { const q = [...trial]; free.forEach((j, n) => q[j] = x[n]); return q; };
    const cand = free.length ? put(nelderMead(x => E(put(x)), free.map(j => trial[j])).x) : trial;
    if (E(cand) <= tol) { p = cand; fixed[i] = true; }
  }
  return finish(m, p, P, res.diag);
}

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
  const done = (model, p) => finish(model, p, P, diag);

  const pv = fitPoly(Q, 2, false), ph = fitPoly(Q, 2, true), cu = fitPoly(Q, 3, false);
  const openErr = Math.min(pv ? pv.err : Infinity, ph ? ph.err : Infinity);

  // Retta: quasi dritta, oppure ondeggiante ma senza una curvatura d'insieme
  // (se una parabola non migliora molto lo scarto, le deviazioni sono solo tremolio)
  const L = fitLine(Q), flat = L.minor / L.major;
  if (flat < 0.05 || (flat < 0.11 && Math.min(openErr, cu ? cu.err : Infinity) > 0.6 * L.minor)) {
    const c = Math.cos(L.th), s = Math.sin(L.th);
    if (Math.abs(c) < 0.035) return done(MODELS.lineV(), [mx]);
    if (Math.abs(s) < 0.035) return done(MODELS.lineH(), [my]);
    return done(MODELS.line(), [s / c, my - s / c * mx]);
  }

  const mkCircle = C => done(MODELS.circle(), [C.cx + mx, C.cy + my, C.r]);
  const mkEllipse = E => {
    const deg = E.th * 180 / Math.PI;
    if (Math.abs(deg) < 10 || Math.abs(deg) > 80) { // quasi allineata agli assi
      const A = fitEllipse(Q, true);
      if (A) return done(MODELS.ellipseA(), Math.abs(Math.cos(A.th)) > .5 ? [A.cx + mx, A.cy + my, A.a, A.b] : [A.cx + mx, A.cy + my, A.b, A.a]);
    }
    return done(MODELS.ellipseR(), [E.cx + mx, E.cy + my, E.a, E.b, deg]);
  };
  const mkPoly = (F, swap) => {
    const mu = swap ? my : mx, c = shiftPoly(F.c, mu, swap ? mx : my), lo = F.lo + mu, hi = F.hi + mu;
    if (c.length === 4) { // a(x−h)³ + b(x−h) + k
      const a = c[3], h = -c[2] / (3 * a), b = c[1] - 3 * a * h * h;
      return done(MODELS.cubic(lo, hi), [a, h, b, c[0] + a * h ** 3 + b * h]);
    }
    const a = c[2], h = -c[1] / (2 * a), k = c[0] - c[1] * c[1] / (4 * a);
    if (swap) { // mezza parabola orizzontale = radice quadrata
      // i punti stanno tutti da un lato del vertice, e il vertice è dove inizia il tratto
      const r = hi - lo, up = lo >= h - 0.15 * r && lo <= h + 0.3 * r, down = hi <= h + 0.15 * r && hi >= h - 0.3 * r;
      if (up || down) return done(MODELS.sqrt(Math.sign(a), lo, hi), [(up ? 1 : -1) / Math.sqrt(Math.abs(a)), k, h]);
    }
    return done(MODELS.parabola(swap, lo, hi), [a, h, k]);
  };
  const mkExp = (F, swap) => {
    const mu = swap ? my : mx, A = F.A * Math.exp(-F.k * mu), c0 = F.C + (swap ? mx : my), lo = F.lo + mu, hi = F.hi + mu;
    return swap ? done(MODELS.log(Math.sign(A), lo, hi), [1 / F.k, c0, -Math.log(Math.abs(A)) / F.k]) : done(MODELS.exp(lo, hi), [A, F.k, c0]);
  };
  const mkHyp = H => {
    const deg = H.th * 180 / Math.PI, ratio = H.b / H.a;
    if (Math.abs(Math.abs(deg) - 45) < 12 && ratio > 0.75 && ratio < 1.33) {
      const R = fitHyperbola(Q, 'rect');
      if (R && R.err < 1.3 * H.err) return done(MODELS.hypRect(R), [(R.th > 0 ? 1 : -1) * R.a * R.a / 2, R.cx + mx, R.cy + my]);
    } else if (Math.abs(deg) < 10 || Math.abs(deg) > 80) {
      const R = fitHyperbola(Q, 'noXY');
      if (R && R.err < 1.3 * H.err) return done(MODELS.hypAxis(R), [R.cx + mx, R.cy + my, R.a, R.b]);
    }
    return done(MODELS.hypGen(H), [H.cx + mx, H.cy + my, H.a, H.b, deg]);
  };
  const mkSine = F => {
    const ph = Math.atan2(F.b, F.a) - F.om * mx;
    return done(MODELS.sine(F.lo + mx, F.hi + mx), [Math.hypot(F.a, F.b), F.om, Math.atan2(Math.sin(ph), Math.cos(ph)), F.m, F.C - F.m * mx + my]);
  };
  const mkAbs = F => done(MODELS.abs(F.lo + mx, F.hi + mx), [F.a, F.h + mx, F.m, F.k - F.m * mx + my]);

  const C = fitCircle(Q);
  let E = fitEllipse(Q);
  if (E && E.a > 3 * diag) E = null;
  const ctr = E || C;
  const cov = ctr ? coverage(Q, ctr.cx, ctr.cy) : 0;

  // Iperbole con entrambi i rami disegnati: nessun altro modello la descrive
  const okHyp = H => H && Math.hypot(H.cx, H.cy) < 3 * diag && H.a < 3 * diag && H.b < 30 * H.a ? H : null;
  const Hy = okHyp(fitHyperbola(Q, 'gen'));
  // (a piccolo = i due rami si toccano: è una "V" o una "X", non un'iperbole)
  if (Hy && Hy.two && Hy.a > 0.05 * diag && Hy.err / diag < 0.035 && Hy.err < 0.5 * openErr) return mkHyp(Hy);

  // Curva chiusa (solo se spiega i punti meglio di una parabola)
  if (cov >= 0.8 && Math.min(E ? E.err : Infinity, C ? C.err : Infinity) < openErr) {
    if (E && E.b / E.a < 0.82) return mkEllipse(E);
    if (C) return mkCircle(C);
    if (E) return mkEllipse(E);
  }

  // Curva aperta: confronto degli scarti. Il moltiplicatore penalizza i modelli con più parametri
  // o meno probabili, così a parità di aderenza vince la forma più semplice.
  const cands = [];
  if (pv) cands.push([pv.err, () => mkPoly(pv, false)]);
  if (ph) cands.push([ph.err, () => mkPoly(ph, true)]);
  // Arco di cerchio: una "U" più profonda di un semicerchio (lati dritti) è quasi sempre una parabola
  // (vale solo se il vertice è al centro del tratto: un quarto di cerchio non è una "U")
  const vert = pv && (!ph || pv.err < ph.err), bp = vert ? pv : ph;
  const depth = vert ? (y1 - y0) / (x1 - x0) : (x1 - x0) / (y1 - y0);
  const vtx = bp ? -bp.c[1] / (2 * bp.c[2]) : NaN, wU = bp ? bp.hi - bp.lo : 0;
  const isU = depth > 0.58 && vtx > bp.lo + 0.25 * wU && vtx < bp.hi - 0.25 * wU;
  if (C && C.r < 4 * diag) cands.push([C.err * (isU ? PEN.deepArc : PEN.circle), () => mkCircle(C)]);
  const ev = fitExp(Q, false), eh = fitExp(Q, true);
  if (ev) cands.push([ev.err * PEN.exp, () => mkExp(ev, false)]);
  if (eh) cands.push([eh.err * PEN.exp, () => mkExp(eh, true)]);
  const Hr = okHyp(fitHyperbola(Q, 'rect')); // un ramo solo: credibile quasi solo nella forma y = c/(x − h) + k
  if (Hr) cands.push([Hr.err * PEN.hypRect, () => done(MODELS.hypRect(Hr), [(Hr.th > 0 ? 1 : -1) * Hr.a * Hr.a / 2, Hr.cx + mx, Hr.cy + my])]);
  if (Hy) cands.push([Hy.err * PEN.hyp, () => mkHyp(Hy)]);
  const ab = fitAbs(Q);
  for (const trend of [false, true]) {
    const sn = fitSine(Q, trend);
    if (sn && Math.hypot(sn.a, sn.b) > 0.02 * diag) cands.push([sn.err * (trend ? PEN.sineTrend : PEN.sine), () => mkSine(sn)]);
  }
  if (ab && Math.abs(ab.a) > 0.15) cands.push([ab.err * (ab.m ? PEN.absSkew : PEN.abs), () => mkAbs(ab)]);
  if (cu && Math.abs(cu.c[3]) > 1e-9) {
    const xi = -cu.c[2] / (3 * cu.c[3]), w = cu.hi - cu.lo;
    if (xi > cu.lo + 0.15 * w && xi < cu.hi - 0.15 * w) cands.push([cu.err * PEN.cubic, () => mkPoly(cu, false)]);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a[0] - b[0]);
  return cands[0][1]();
}
const PEN = { circle: 1.15, deepArc: 2.5, exp: 1.1, hypRect: 1.35, hyp: 2.2, sine: 1.4, sineTrend: 2, abs: 1.2, absSkew: 1.5, cubic: 1.3 };

// ── Forma libera: serie di Fourier parametrica x(t), y(t) ──
// Curva chiusa → serie completa su [0, 2π]; aperta → serie di soli coseni su [0, π].
const FREE_T = 0.035, MAX_HARM = 10;

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
  const P = strokes.flat(), classic = analyze(P), free = fitFree(strokes);
  if (classic) classic.approx = simplify(classic, P); // versione con i numeri arrotondati
  if (!classic || !free) return classic || free;
  const pick = classic.rel > (classic.model.freeT || FREE_T) && free.err < 0.5 * classic.err ? free : classic;
  const other = pick === free ? classic : free;
  pick.alt = other; other.alt = pick;
  return pick;
}
