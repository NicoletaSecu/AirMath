//  Lingue
// Per aggiungere una lingua basta copiare un blocco e tradurre i valori.
const I18N = {
  it: {
    title: "Air Math — disegna nell'aria, ottieni l'equazione",
    tagline: "· disegna, ottieni l'equazione",
    introTitle: "Disegna nell'aria,<br>leggi <span>f(x, y) = 0</span>",
    introText: "Traccia una figura con la mano davanti alla webcam: la pagina riconosce la curva e ne calcola l'equazione.",
    step1: "<strong>Unisci indice e pollice</strong> per tracciare",
    step2: "<strong>Chiudi il pugno</strong> un istante per analizzare",
    stepClear: "<strong>Indice e medio alzati</strong> per cancellare",
    step3: "Oppure disegna con <strong>mouse o dito</strong>",
    madeBy: "Creato da",
    camOn: "Attiva webcam", mouseOnly: "Solo mouse", starting: "Avvio…",
    hintDraw: "<strong>Pizzica</strong> per disegnare",
    hintAnalyze: "<strong>Pugno chiuso</strong> per analizzare",
    hintClear: "<strong>Due dita</strong> per cancellare",
    exactBtn: "Valori esatti", approxBtn: "≈ Approssima",
    clear: "Cancella", analyze: "Analizza", keySpace: "Spazio", copy: "Copia", copied: "Copiato",
    stIdle: "In attesa", stShow: "Mostra la mano", stReady: "Pronto · pizzica per disegnare", stDraw: "Disegno",
    stHold: "Tieni chiuso…", stDone: "Analizzato", stClearHold: "Tieni per cancellare…", stCleared: "Cancellato", stLoading: "Carico il modello…", stMouse: "Modalità mouse",
    errMediapipe: "Impossibile caricare MediaPipe: controlla la connessione.",
    errNoCam: "Questo browser non consente l'accesso alla webcam da qui.",
    errDenied: "Permesso webcam negato. Puoi comunque disegnare con il mouse.",
    noShape: "Nessuna figura", drawFirst: "Disegna prima una figura", tooFew: "Troppo pochi punti per riconoscere una curva",
    line: "Retta", circle: "Cerchio", ellipse: "Ellisse", parabola: "Parabola", cubic: "Cubica",
    exponential: "Esponenziale", logarithm: "Logaritmo", freeCurve: "Curva libera",
    hyperbola: "Iperbole", sine: "Sinusoide", absolute: "Valore assoluto", sqrt: "Radice quadrata",
    asymptotes: "Asintoti", amplitude: "Ampiezza", period: "Periodo", start: "Origine",
    type: "Tipo", vertical: "verticale", horizontal: "orizzontale", slope: "Pendenza", intercept: "Intercetta",
    center: "Centro", radius: "Raggio", semiaxes: "Semiassi", rotation: "Rotazione", vertex: "Vertice", axis: "Asse",
    inflection: "Flesso", asymptote: "Asintoto", growth: "Crescita", domain: "Dominio",
    closed: "chiusa", open: "aperta", harmonics: "Armoniche", interval: "Intervallo", fit: "Aderenza"
  },
  en: {
    title: "Air Math — draw in the air, get the equation",
    tagline: "· draw it, get the equation",
    introTitle: "Draw in the air,<br>read <span>f(x, y) = 0</span>",
    introText: "Trace a shape with your hand in front of the webcam: the page recognises the curve and works out its equation.",
    step1: "<strong>Pinch index and thumb</strong> to draw",
    step2: "<strong>Close your fist</strong> for a moment to analyse",
    stepClear: "<strong>Raise index and middle finger</strong> to clear",
    step3: "Or draw with your <strong>mouse or finger</strong>",
    madeBy: "Made by",
    camOn: "Turn on webcam", mouseOnly: "Mouse only", starting: "Starting…",
    hintDraw: "<strong>Pinch</strong> to draw",
    hintAnalyze: "<strong>Closed fist</strong> to analyse",
    hintClear: "<strong>Two fingers</strong> to clear",
    exactBtn: "Exact values", approxBtn: "≈ Round off",
    clear: "Clear", analyze: "Analyse", keySpace: "Space", copy: "Copy", copied: "Copied",
    stIdle: "Waiting", stShow: "Show your hand", stReady: "Ready · pinch to draw", stDraw: "Drawing",
    stHold: "Keep it closed…", stDone: "Analysed", stClearHold: "Hold to clear…", stCleared: "Cleared", stLoading: "Loading the model…", stMouse: "Mouse mode",
    errMediapipe: "Couldn't load MediaPipe: check your connection.",
    errNoCam: "This browser doesn't allow webcam access from here.",
    errDenied: "Webcam permission denied. You can still draw with the mouse.",
    noShape: "No shape", drawFirst: "Draw a shape first", tooFew: "Too few points to recognise a curve",
    line: "Line", circle: "Circle", ellipse: "Ellipse", parabola: "Parabola", cubic: "Cubic",
    exponential: "Exponential", logarithm: "Logarithm", freeCurve: "Free curve",
    hyperbola: "Hyperbola", sine: "Sine wave", absolute: "Absolute value", sqrt: "Square root",
    asymptotes: "Asymptotes", amplitude: "Amplitude", period: "Period", start: "Start point",
    type: "Type", vertical: "vertical", horizontal: "horizontal", slope: "Slope", intercept: "Intercept",
    center: "Centre", radius: "Radius", semiaxes: "Semi-axes", rotation: "Rotation", vertex: "Vertex", axis: "Axis",
    inflection: "Inflection", asymptote: "Asymptote", growth: "Growth rate", domain: "Domain",
    closed: "closed", open: "open", harmonics: "Harmonics", interval: "Range", fit: "Fit"
  }
};

// Lingua iniziale: scelta salvata, altrimenti quella del browser
let LANG = 'en';
try {
  const saved = typeof localStorage !== 'undefined' && localStorage.getItem('lang');
  LANG = I18N[saved] ? saved : (typeof navigator !== 'undefined' && /^it/i.test(navigator.language || '') ? 'it' : 'en');
} catch (e) {}

const t = key => I18N[LANG][key] ?? I18N.it[key] ?? key;
