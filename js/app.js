//  Interfaccia 
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('stage'), ctx = canvas.getContext('2d');
const ACCENT = '#7df0c2';
let W = 0, H = 0, unit = 50;

let strokes = [];        // tratti completati, in pixel
let current = null;      // tratto in corso
let result = null;       // esito dell'ultima analisi
let staleOnDraw = false; // il prossimo tratto valido sostituisce il disegno precedente

let hand = null;         // landmark in pixel
let pen = null, brush = null, lastRaw = null, pinching = false, pinchFrames = 0, breakStart = 0;
let fistStart = 0, fistLatch = false, fistProgress = 0, lastSeen = 0;
let clearStart = 0, clearLatch = false, clearProgress = 0;
let camOn = false, modelReady = false;

// Filtro One Euro: molto liscio a mano lenta, reattivo a mano veloce
function oneEuro(minCut, beta) {
  let px, dx = 0, pt;
  const al = (fc, dt) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
  return {
    reset() { px = undefined; },
    f(x, t) {
      if (px === undefined) { px = x; pt = t; dx = 0; return x; }
      const dt = Math.max((t - pt) / 1000, 1e-3); pt = t;
      dx += ((x - px) / dt - dx) * al(1, dt);
      px += (x - px) * al(minCut + beta * Math.abs(dx), dt);
      return px;
    }
  };
}
const SMOOTH_MIN = 0.8, SMOOTH_BETA = 0.003; // abbassa SMOOTH_MIN per un tratto ancora più stabile (ma più "in ritardo")
// "Pennello pigro": la punta è trascinata da un filo lungo LAZY pixel, quindi i tremolii
// più piccolo di così non arrivano sul foglio. Più è lungo, più il tratto è fermo (e in ritardo).
const LAZY = 10;
const SMOOTH_PASSES = 14; // lisciatura finale di ogni tratto
const fx = oneEuro(SMOOTH_MIN, SMOOTH_BETA), fy = oneEuro(SMOOTH_MIN, SMOOTH_BETA);

const FIST_MS = 600, CLEAR_MS = 800, PINCH_ON = 0.22, PINCH_OFF = 0.34, MIN_PTS = 6;
// Le stesse soglie misurate in 3D (distanza reale tra le punte, non quella vista dalla webcam):
// evitano il falso pizzico quando pollice e indice sono solo allineati uno dietro l'altro.
const PINCH_ON_3D = 0.38, PINCH_OFF_3D = 0.58;
// Un pizzico "perso" per meno di RELEASE_MS (un dito che passa davanti, un errore del tracking)
// non interrompe il tratto.
const RELEASE_MS = 180;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  unit = Math.min(W, H) / 16;
}
addEventListener('resize', resize); resize();

const toMath = p => ({ x: (p.x - W / 2) / unit, y: (H / 2 - p.y) / unit });
const toPx = (x, y) => [W / 2 + x * unit, H / 2 - y * unit];

// ── Gestione dei tratti ──
function beginStroke(x, y) {
  staleOnDraw = !!result;
  current = [{ x, y }];
}
function extendStroke(x, y) {
  if (!current) return;
  const l = current[current.length - 1];
  if (Math.hypot(x - l.x, y - l.y) < 2) return;
  current.push({ x, y });
  if (staleOnDraw && current.length >= MIN_PTS) { strokes = []; setResult(null); staleOnDraw = false; }
}
function endStroke(trim) {
  if (!current) return;
  if (trim && current.length > 12) current.length -= 2; // scarta lo scatto del rilascio
  if (current.length >= MIN_PTS) strokes.push(smoothStroke(current));
  current = null; staleOnDraw = false;
}
function clearAll() { strokes = []; current = null; setResult(null); }

// Ricampiona un tratto a passo costante (in pixel)
function resampleOne(s, step) {
  const out = [s[0]];
  let acc = 0;
  for (let i = 1; i < s.length; i++) {
    let a = s[i - 1]; const b = s[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(a); d = Math.hypot(b.x - a.x, b.y - a.y); acc = 0;
    }
    acc += d;
  }
  out.push(s[s.length - 1]);
  return out;
}

// Liscia il tratto: passo uniforme + media pesata dei vicini, estremi fissi
function smoothStroke(s) {
  if (s.length < 3) return s;
  let p = resampleOne(s, 4);
  for (let k = 0; k < SMOOTH_PASSES; k++)
    p = p.map((q, i) => i === 0 || i === p.length - 1 ? q : { x: (p[i - 1].x + 2 * q.x + p[i + 1].x) / 4, y: (p[i - 1].y + 2 * q.y + p[i + 1].y) / 4 });
  return p;
}

function runAnalysis() {
  endStroke(false);
  if (!strokes.length) return setResult({ empty: true, msg: t('drawFirst') });
  const r = recognize(strokes.map(s => s.map(toMath).filter(p => isFinite(p.x) && isFinite(p.y))));
  setResult(r || { empty: true, msg: t('tooFew') });
}

// Equazione mostrata: con i numeri arrotondati (se disponibile e richiesto) oppure esatti
let approxOn = true;
try { approxOn = localStorage.getItem('approx') !== '0'; } catch (e) {}
const view = r => r && approxOn && r.approx ? r.approx : r;

function setResult(r) {
  result = r;
  const box = $('result');
  if (!r) return box.classList.remove('show');
  $('btnApprox').hidden = !r.approx;
  $('btnApprox').textContent = t(approxOn ? 'exactBtn' : 'approxBtn');
  const v = view(r);
  box.classList.toggle('empty', !!r.empty);
  box.classList.toggle('long', !!r.free);
  $('btnCopy').hidden = !!r.empty;
  $('btnAlt').hidden = !r.alt;
  if (r.alt) $('btnAlt').textContent = '↔ ' + r.alt.name;
  if (r.empty) {
    $('resKind').textContent = t('noShape');
    $('resEq').textContent = r.msg;
    $('resMeta').innerHTML = '';
  } else {
    $('resKind').textContent = v.name;
    $('resEq').innerHTML = v.html || v.eq.replace(/[xy]/g, '<i>$&</i>');
    $('resMeta').innerHTML = [...v.details, [t('fit'), Math.round(v.quality * 100) + '%']]
      .map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  }
  box.classList.add('show');
}

let lastStatus = ['idle', 'stIdle'];
function setStatus(state, key) {
  lastStatus = [state, key];
  $('status').dataset.state = state;
  $('statusText').textContent = t(key);
}

// Cambia lingua: testi fissi, stato e (se c'è) il risultato a schermo
function applyLang(lang) {
  LANG = lang;
  try { localStorage.setItem('lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => el.innerHTML = t(el.dataset.i18n));
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  setStatus(...lastStatus);
  if (result) result.empty ? setResult(null) : runAnalysis();
}

//  Tracking della mano
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function onResults(res) {
  const now = performance.now();
  modelReady = true;
  const lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
  if (!lm) {
    hand = null; pinchFrames = 0; fistStart = 0; fistProgress = 0; clearStart = 0; clearProgress = 0;
    if (now - lastSeen > 250) { pinching = false; breakStart = 0; endStroke(true); pen = null; lastRaw = null; fx.reset(); fy.reset(); }
    return setStatus('idle', 'stShow');
  }
  lastSeen = now;

  // landmark normalizzati → pixel (video in "cover", specchiato)
  const vw = video.videoWidth, vh = video.videoHeight, sc = Math.max(W / vw, H / vh);
  const ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
  hand = lm.map(p => ({ x: W - (p.x * vw * sc + ox), y: p.y * vh * sc + oy }));

  const d = (a, b) => Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y);
  const size = Math.max(d(0, 9), d(5, 17) * 1.3) || 1;
  // Distanze 3D: MediaPipe stima anche la profondità, così i gesti non dipendono da come è girata la mano
  const wl = res.multiHandWorldLandmarks && res.multiHandWorldLandmarks[0];
  const d3 = wl ? (a, b) => Math.hypot(wl[a].x - wl[b].x, wl[a].y - wl[b].y, wl[a].z - wl[b].z) : d;
  const size3 = wl ? (d3(0, 9) || 1) : size;
  const curled = (tip, k) => d3(tip, 0) < d3(tip - 3, 0) * k; // punta più vicina al polso della nocca
  const up = tip => d3(tip, 0) > d3(tip - 2, 0) * 1.15;
  const ratio = d(4, 8) / size, ratio3 = d3(4, 8) / size3;
  const fist = curled(8, 1.0) && curled(12, 1.1) && curled(16, 1.1) && curled(20, 1.1);
  // ✌️ indice e medio tesi, anulare e mignolo chiusi
  const peace = up(8) && up(12) && curled(16, 1.1) && curled(20, 1.1) && ratio > 0.45;

  // La penna è il punto in cui pollice e indice si toccano: più stabile della sola punta dell'indice,
  // e non salta se per un attimo il tracking confonde l'indice con il medio.
  const raw = { x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2 };
  const jump = pinching && lastRaw && Math.hypot(raw.x - lastRaw.x, raw.y - lastRaw.y) > 0.9 * size; // salto impossibile
  if (!jump) { pen = { x: fx.f(raw.x, now), y: fy.f(raw.y, now) }; lastRaw = raw; }

  if (pinching) {
    const held = !jump && !peace && !fist && ratio < PINCH_OFF && ratio3 < PINCH_OFF_3D;
    if (held) {
      breakStart = 0;
      const dx = pen.x - brush.x, dy = pen.y - brush.y, dd = Math.hypot(dx, dy);
      if (dd > LAZY) { brush.x += dx * (dd - LAZY) / dd; brush.y += dy * (dd - LAZY) / dd; }
      extendStroke(brush.x, brush.y);
      return setStatus('draw', 'stDraw');
    }
    if (!breakStart) breakStart = now;
    if (now - breakStart < RELEASE_MS) return setStatus('draw', 'stDraw'); // forse è solo un disturbo: aspetta
    pinching = false; pinchFrames = 0; breakStart = 0; endStroke(true);
  }

  if (fist) {
    clearStart = 0; clearProgress = 0; pinchFrames = 0;
    if (!fistLatch) {
      if (!fistStart) fistStart = now;
      fistProgress = Math.min(1, (now - fistStart) / FIST_MS);
      if (fistProgress >= 1) { fistLatch = true; fistProgress = 0; runAnalysis(); }
    }
    return setStatus('hold', fistLatch ? 'stDone' : 'stHold');
  }
  fistStart = 0; fistLatch = false; fistProgress = 0;

  // ✌️ tenuto un istante cancella tutto
  if (peace && (clearLatch || strokes.length || current || result)) {
    pinchFrames = 0;
    if (!clearLatch) {
      if (!clearStart) clearStart = now;
      clearProgress = Math.min(1, (now - clearStart) / CLEAR_MS);
      if (clearProgress >= 1) { clearLatch = true; clearProgress = 0; clearAll(); }
    }
    return setStatus('hold', clearLatch ? 'stCleared' : 'stClearHold');
  }
  clearStart = 0; clearProgress = 0;
  if (!peace) clearLatch = false;

  if (ratio < PINCH_ON && ratio3 < PINCH_ON_3D) {
    if (++pinchFrames >= 2) { pinching = true; breakStart = 0; brush = { ...pen }; beginStroke(brush.x, brush.y); }
  } else pinchFrames = 0;
  setStatus(pinching ? 'draw' : 'ready', pinching ? 'stDraw' : 'stReady');
}

async function startCamera() {
  const err = $('introErr');
  try {
    if (typeof Hands === 'undefined') throw new Error(t('errMediapipe'));
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('errNoCam'));
    $('btnCam').textContent = t('starting');
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    await video.play();
    const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    hands.onResults(onResults);
    camOn = true;
    $('intro').classList.add('hide');
    setStatus('idle', 'stLoading');
    const loop = async () => {
      if (video.readyState >= 2) { try { await hands.send({ image: video }); } catch (e) { console.error(e); } }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    $('btnCam').textContent = t('camOn');
    err.style.display = 'block';
    err.textContent = e.name === 'NotAllowedError' ? t('errDenied') : (e.message || String(e));
  }
}

// ── Mouse / touch ──
let pointerDown = false;
canvas.addEventListener('pointerdown', e => { pointerDown = true; canvas.setPointerCapture(e.pointerId); beginStroke(e.clientX, e.clientY); });
canvas.addEventListener('pointermove', e => { if (pointerDown) extendStroke(e.clientX, e.clientY); });
const pointerEnd = () => { if (pointerDown) { pointerDown = false; endStroke(false); } };
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

$('btnAnalyze').onclick = runAnalysis;
$('btnClear').onclick = clearAll;
$('btnAlt').onclick = () => { if (result && result.alt) setResult(result.alt); };
$('btnApprox').onclick = () => {
  approxOn = !approxOn;
  try { localStorage.setItem('approx', approxOn ? '1' : '0'); } catch (e) {}
  setResult(result);
};
$('btnCopy').onclick = () => {
  if (!result || result.empty) return;
  navigator.clipboard?.writeText(view(result).eq).then(() => {
    $('btnCopy').textContent = t('copied');
    setTimeout(() => $('btnCopy').textContent = t('copy'), 1200);
  }).catch(() => {});
};
$('btnCam').onclick = startCamera;
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => applyLang(b.dataset.lang));
applyLang(LANG);
$('btnMouse').onclick = () => { $('intro').classList.add('hide'); setStatus('ready', 'stMouse'); };
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); runAnalysis(); }
  else if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') clearAll();
});

//  Rendering 
function drawGrid() {
  const nx = Math.ceil(W / 2 / unit), ny = Math.ceil(H / 2 / unit);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.beginPath();
  for (let i = -nx; i <= nx; i++) { const x = Math.round(W / 2 + i * unit) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let j = -ny; j <= ny; j++) { const y = Math.round(H / 2 + j * unit) + .5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.moveTo(0, Math.round(H / 2) + .5); ctx.lineTo(W, Math.round(H / 2) + .5);
  ctx.moveTo(Math.round(W / 2) + .5, 0); ctx.lineTo(Math.round(W / 2) + .5, H);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.32)';
  ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = -nx; i <= nx; i++) if (i && i % 2 === 0) ctx.fillText(i, W / 2 + i * unit, H / 2 + 6);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let j = -ny; j <= ny; j++) if (j && j % 2 === 0) ctx.fillText(-j, W / 2 - 7, H / 2 + j * unit);
}

function drawStroke(s) {
  if (s.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length - 1; i++) ctx.quadraticCurveTo(s[i].x, s[i].y, (s[i].x + s[i + 1].x) / 2, (s[i].y + s[i + 1].y) / 2);
  ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
  ctx.stroke();
}

function drawFit(sh) {
  ctx.save();
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.shadowColor = ACCENT; ctx.shadowBlur = 16;
  ctx.beginPath();
  if (sh.kind === 'line') {
    const [x, y] = toPx(sh.x, sh.y), c = Math.cos(sh.th), s = -Math.sin(sh.th), R = W + H;
    ctx.moveTo(x - c * R, y - s * R); ctx.lineTo(x + c * R, y + s * R);
  } else if (sh.kind === 'ellipse') {
    const [x, y] = toPx(sh.x, sh.y);
    ctx.ellipse(x, y, sh.a * unit, sh.b * unit, -sh.th, 0, Math.PI * 2);
    ctx.stroke(); ctx.beginPath(); ctx.shadowBlur = 0; ctx.fillStyle = ACCENT;
    ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath();
  } else if (sh.kind === 'param') {
    for (let i = 0; i <= 400; i++) {
      const t = sh.T * i / 400, [x, y] = toPx(evalSeries(sh.ax, sh.bx, t), evalSeries(sh.ay, sh.by, t));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  } else if (sh.kind === 'hyp') {
    const c = Math.cos(sh.th), s = Math.sin(sh.th);
    for (const sg of sh.signs) for (let i = 0; i <= 120; i++) {
      const q = -sh.S + 2 * sh.S * i / 120, u = sg * sh.a * Math.cosh(q), v = sh.b * Math.sinh(q);
      const [x, y] = toPx(sh.x + u * c - v * s, sh.y + u * s + v * c);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  } else {
    const pad = (sh.hi - sh.lo) * 0.2;
    for (let i = 0; i <= 300; i++) {
      const u = Math.min(sh.max ?? Infinity, Math.max(sh.min ?? -Infinity, sh.lo - pad + (sh.hi - sh.lo + 2 * pad) * i / 300));
      const v = sh.kind === 'fn' ? sh.f(u) : sh.kind === 'exp' ? sh.A * Math.exp(sh.k * u) + sh.C : sh.c.reduceRight((a, k) => a * u + k, 0);
      const [x, y] = sh.swap ? toPx(v, u) : toPx(u, v);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawHand() {
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [a, b] of BONES) { ctx.moveTo(hand[a].x, hand[a].y); ctx.lineTo(hand[b].x, hand[b].y); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (const p of hand) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }

  const hold = fistProgress || clearProgress;
  if (hold > 0) { // anello di conferma sul palmo: arancione = analizza, rosso = cancella
    const c = hand[9];
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = clearProgress ? '#ff7a7a' : '#ffb86b';
    ctx.beginPath(); ctx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2); ctx.stroke();
  } else if (pen) {
    const tipPt = pinching && brush ? brush : pen;
    ctx.beginPath(); ctx.arc(tipPt.x, tipPt.y, pinching ? 7 : 11, 0, Math.PI * 2);
    if (pinching) { ctx.fillStyle = ACCENT; ctx.shadowColor = ACCENT; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0; }
    else { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke(); }
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  const fitted = result && !result.empty;
  ctx.strokeStyle = fitted && !staleOnDraw ? 'rgba(255,255,255,.45)' : '#fff';
  if (!staleOnDraw || !current) strokes.forEach(drawStroke);
  if (fitted && !current) drawFit(view(result).shape);
  if (current) { ctx.strokeStyle = '#fff'; drawStroke(smoothStroke(current)); }
  if (hand) drawHand();
  requestAnimationFrame(render);
}
render();
