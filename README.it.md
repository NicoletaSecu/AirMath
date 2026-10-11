# Air Math

🇮🇹 Italiano · [🇬🇧 English](README.md)

Disegna una figura nell'aria con la mano davanti alla webcam e ottieni la sua equazione matematica.

La pagina traccia la mano in tempo reale, usa l'indice come penna e, quando hai finito, riconosce la curva disegnata: una retta, un cerchio, una parabola, ma anche un cuore o uno scarabocchio qualsiasi.

## Come si usa

1. Apri `index.html` nel browser (serve una connessione a internet, vedi [Requisiti](#requisiti)).
2. Premi **Attiva webcam** e consenti l'accesso alla videocamera.
3. Disegna con i gesti:

| Gesto | Azione |
| --- | --- |
| 🤏 Unisci indice e pollice | Disegna: il tratto segue la punta dell'indice |
| Separa le dita | Stacca la penna (puoi fare più tratti) |
| ✊ Pugno chiuso per circa mezzo secondo | Analizza il disegno e mostra l'equazione |
| ✌️ Indice e medio alzati per poco meno di un secondo | Cancella tutto |
| 🤏 Nuovo pizzico dopo l'analisi | Ricomincia con un disegno nuovo |

In alternativa puoi disegnare con il mouse o con il dito (**Solo mouse** nella schermata iniziale) e usare la tastiera: `Spazio` per analizzare, `C` o `Esc` per cancellare.

Le coordinate dell'equazione sono quelle della griglia a schermo, con l'origine al centro.

L'interfaccia è in italiano e in inglese: parte nella lingua del browser e si cambia con il selettore **IT / EN** in alto a destra.

## Forme riconosciute

| Forma | Esempio di risultato |
| --- | --- |
| Retta | `y = 2x + 1` |
| Cerchio | `x² + y² = 25` |
| Ellisse (anche ruotata) | `(x − 1)²/36 + y²/9 = 1` |
| Parabola (asse verticale o orizzontale) | `y = 0.5x² − 3` |
| Cubica | `y = 0.15x³ − 1.2x` |
| Esponenziale | `y = 0.5e^(0.6x) − 3` |
| Logaritmo | `y = 2ln(x + 3) − 1` |
| Iperbole (uno o due rami, anche ruotata) | `y = 4/(x − 1) + 2`, `x²/4 − y²/9 = 1` |
| Sinusoide | `y = 3sin(0.8x + 1) − 1` |
| Valore assoluto | `y = −2\|x − 1\| + 3` |
| Radice quadrata | `y = 2√(x + 3) − 1` |
| Curva libera | equazioni parametriche `x(t)`, `y(t)` |

Quando il disegno non somiglia a nessuna forma classica, viene descritto con una **curva libera**: una coppia di equazioni parametriche fatte di seni e coseni che ricalca proprio la figura disegnata. Per esempio, per un cuore:

```
x(t) = 0.04cos(t) + 2.76sin(t) + 0.03sin(2t) - 0.43sin(3t) - 0.11sin(4t) - 0.05sin(5t)
y(t) = 1.42 + 2.43cos(t) - 0.03sin(t) - 0.67cos(2t) - 0.27cos(3t) - 0.33cos(4t) - 0.13cos(6t) + 0.03sin(6t)
```

Sotto l'equazione compaiono i parametri principali (centro, raggio, vertice, asintoto…) e una percentuale di aderenza. Il pulsante **↔** passa dall'interpretazione classica a quella libera e viceversa; **Copia** copia l'equazione come testo, pronta da incollare in Desmos o GeoGebra.

## Come funziona

- **Tracking**: [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) restituisce 21 punti della mano per ogni fotogramma. Il pizzico è la distanza tra punta del pollice e punta dell'indice, rapportata alla dimensione della mano; il pugno è riconosciuto quando le punte delle dita sono più vicine al polso delle nocche.
- **Stabilizzazione**: la posizione dell'indice passa per un filtro One Euro (liscio a mano lenta, reattivo a mano veloce) e ogni tratto viene ricampionato a passo costante e lisciato.
- **Forme classiche**: ogni modello è adattato ai punti con i minimi quadrati (retta con PCA, cerchio con il metodo di Kåsa, ellisse come conica generale, iperbole come conica generale, polinomi; esponenziale, logaritmo, sinusoide e valore assoluto con ricerca sul parametro non lineare). Vince il modello più semplice che spiega bene i punti.
- **Curve libere**: i punti vengono ricampionati lungo il percorso e sviluppati in serie di Fourier parametrica, tenendo solo le armoniche necessarie (al massimo 10).

## Struttura del progetto

```
index.html   struttura della pagina
style.css    stile
lang.js      testi dell'interfaccia in italiano e inglese
fit.js       matematica: riconoscimento delle forme e calcolo delle equazioni
app.js       webcam, gesti, disegno sul canvas e interfaccia
```

Nessuna dipendenza da installare e nessun passaggio di build: HTML, CSS e JavaScript vanilla.

## Requisiti

- Un browser recente con accesso alla webcam (Chrome, Edge, Safari, Firefox).
- Una connessione a internet: MediaPipe Hands viene caricato da CDN.

Se il browser nega la webcam aprendo il file direttamente, servi la cartella in locale e apri `http://localhost:8000`:

```bash
python3 -m http.server 8000
```

## Regolazioni

Le soglie principali sono costanti in cima ai file e si possono ritoccare:

| Costante | File | Effetto |
| --- | --- | --- |
| `PINCH_ON`, `PINCH_OFF` | `app.js` | Quanto devono avvicinarsi / allontanarsi le dita per iniziare / finire il tratto |
| `FIST_MS` | `app.js` | Per quanto tenere il pugno chiuso prima dell'analisi |
| `CLEAR_MS` | `app.js` | Per quanto tenere il gesto con due dita prima di cancellare tutto |
| `SMOOTH_MIN`, `SMOOTH_BETA` | `app.js` | Stabilizzazione del tratto: `SMOOTH_MIN` più basso = più liscio ma più in ritardo |
| `FREE_T` | `fit.js` | Soglia oltre la quale si preferisce la curva libera alla forma classica |
| `MAX_HARM` | `fit.js` | Numero massimo di armoniche della curva libera |

## Limiti noti

- Serve una buona illuminazione e la mano ben visibile nell'inquadratura.
- Per le curve libere conta l'ordine in cui si disegna: il risultato migliore si ottiene con un solo tratto continuo.
- Le punte molto aguzze escono leggermente arrotondate.
- Un logaritmo o un esponenziale di cui si disegna solo la parte piatta è indistinguibile da un arco o da una parabola: conviene tracciare anche il tratto ripido.
- Una sinusoide viene riconosciuta se se ne disegna circa un periodo intero; una sola gobba sembra una parabola.
- Parabole ruotate, tangenti e altre funzioni non hanno un modello dedicato e vengono descritte come curve libere.
