# Air Math

🇬🇧 English · [🇮🇹 Italiano](README.it.md)

Draw a shape in the air with your hand in front of the webcam and get its mathematical equation.

The page tracks your hand in real time, uses your index finger as a pen and, once you're done, recognises the curve you drew: a line, a circle, a parabola, but also a heart or any scribble.

## How to use it

1. Open `index.html` in your browser (an internet connection is needed, see [Requirements](#requirements)).
2. Click **Turn on webcam** and allow camera access.
3. Draw with gestures:

| Gesture | Action |
| --- | --- |
| 🤏 Pinch index finger and thumb | Draw: the stroke follows the point where the two fingers touch |
| Open your fingers | Lift the pen (you can draw several strokes) |
| ✊ Closed fist for about half a second | Analyse the drawing and show the equation |
| ✌️ Index and middle finger raised for just under a second | Clear everything |
| 🤏 Pinch again after the analysis | Start over with a new drawing |

You can also draw with the mouse or your finger (**Mouse only** on the start screen) and use the keyboard: `Space` to analyse, `C` or `Esc` to clear.

The equation uses the coordinates of the on-screen grid, with the origin at the centre.

The interface is available in English and Italian: it starts in your browser's language and can be changed with the **IT / EN** switch in the top-right corner.

## Recognised shapes

| Shape | Example result |
| --- | --- |
| Line | `y = 2x + 1` |
| Circle | `x² + y² = 25` |
| Ellipse (rotated too) | `(x − 1)²/36 + y²/9 = 1` |
| Parabola (vertical or horizontal axis) | `y = 0.5x² − 3` |
| Cubic | `y = 0.15x³ − 1.2x` |
| Exponential | `y = 0.5e^(0.6x) − 3` |
| Logarithm | `y = 2ln(x + 3) − 1` |
| Hyperbola (one or both branches, rotated too) | `y = 4/(x − 1) + 2`, `x²/4 − y²/9 = 1` |
| Sine wave | `y = 3sin(0.8x + 1) − 1` |
| Absolute value | `y = −2\|x − 1\| + 3` |
| Square root | `y = 2√(x + 3) − 1` |
| Free curve | parametric equations `x(t)`, `y(t)` |

When the drawing doesn't look like any classic shape, it is described as a **free curve**: a pair of parametric equations made of sines and cosines that traces exactly the figure you drew. For a heart, for example:

```
x(t) = 0.04cos(t) + 2.76sin(t) + 0.03sin(2t) - 0.43sin(3t) - 0.11sin(4t) - 0.05sin(5t)
y(t) = 1.42 + 2.43cos(t) - 0.03sin(t) - 0.67cos(2t) - 0.27cos(3t) - 0.33cos(4t) - 0.13cos(6t) + 0.03sin(6t)
```

Below the equation you get the main parameters (centre, radius, vertex, asymptote…) and a fit percentage. Three buttons sit under it:

- **Exact values / ≈ Round off** — by default the numbers are rounded to the simplest values that still follow your drawing (a shaky circle becomes `x² + y² = 9` instead of `(x − 0.03)² + (y − 0.07)² = 9.55`); switch to see the exact fit.
- **↔** — switches between the classic shape and the free-curve interpretation.
- **Copy** — copies the equation as text, ready to paste into Desmos or GeoGebra.

## How it works

- **Tracking**: [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) returns 21 hand landmarks per frame. A pinch is the distance between thumb tip and index tip, relative to the size of the hand; a fist is detected when the fingertips are closer to the wrist than the knuckles.
- **Pinch**: besides the on-screen distance, the real 3D distance between the fingertips is checked, so a thumb merely hidden behind the index finger doesn't count as a pinch. A pinch lost for a fraction of a second (a finger passing in front, a tracking glitch) doesn't break the stroke.
- **Stabilisation**: the pen position goes through a One Euro filter (smooth when the hand is slow, responsive when it is fast) and a "lazy brush" that ignores tremors smaller than a few pixels; each stroke is then resampled at a constant step and smoothed.
- **Classic shapes**: each model is fitted to the points with least squares (line via PCA, circle via the Kåsa method, ellipse as a general conic, hyperbola as a general conic, polynomials; exponential, logarithm, sine wave and absolute value with a search over the non-linear parameter). The simplest model that explains the points well wins, with tolerances tuned on simulated shaky-hand drawings.
- **Rounding**: each parameter is moved, one level at a time, to the roundest value (0, integer, half, tenth…) that doesn't noticeably worsen the fit, re-adjusting the others each time.
- **Free curves**: the points are resampled along the path and expanded into a parametric Fourier series, keeping only the harmonics that are needed (10 at most).

## Project structure

```
index.html            page structure
css/style.css         styles
js/lang.js            interface text in Italian and English
js/fit.js             maths: shape recognition, equation fitting and rounding
js/app.js             webcam, gestures, canvas drawing and interface
assets/               icons
favicon.ico           icon for browsers that look for it at the site root
```

No dependencies to install and no build step: plain HTML, CSS and JavaScript.

## Requirements

- A recent browser with webcam access (Chrome, Edge, Safari, Firefox).
- An internet connection: MediaPipe Hands is loaded from a CDN.

If the browser refuses webcam access when you open the file directly, serve the folder locally and open `http://localhost:8000`:

```bash
python3 -m http.server 8000
```

## Tuning

The main thresholds are constants at the top of the files and can be adjusted:

| Constant | File | Effect |
| --- | --- | --- |
| `PINCH_ON`, `PINCH_OFF` | `app.js` | How close / far apart the fingers must be to start / end a stroke |
| `FIST_MS` | `app.js` | How long the fist must stay closed before the analysis runs |
| `CLEAR_MS` | `app.js` | How long the two-finger gesture must be held before everything is cleared |
| `SMOOTH_MIN`, `SMOOTH_BETA`, `LAZY` | `app.js` | Stroke stabilisation: a lower `SMOOTH_MIN` or a higher `LAZY` is steadier but lags more |
| `RELEASE_MS` | `app.js` | How long a lost pinch is tolerated before the stroke ends |
| `FREE_T` | `fit.js` | Threshold above which a free curve is preferred over a classic shape |
| `MAX_HARM` | `fit.js` | Maximum number of harmonics in a free curve |

## Known limitations

- Good lighting is needed, with the hand clearly visible in the frame.
- For free curves the drawing order matters: a single continuous stroke gives the best result.
- Very sharp corners come out slightly rounded.
- A logarithm or exponential of which only the flat part is drawn can't be told apart from an arc or a parabola: draw the steep part too.
- A sine wave needs at least one full period to be recognised; a single hump looks like a parabola.
- Some shapes are genuinely ambiguous when drawn by hand: a single hyperbola branch looks like an exponential, a quarter circle like a piece of parabola. Draw both branches of a hyperbola, and at least half of a circle.
- Rotated parabolas, tangents and other functions have no dedicated model and are described as free curves.

## Author

Made by [Nicoleta Secu](https://nicoletasecu.github.io).
