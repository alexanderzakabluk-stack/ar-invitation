# An Evening of Caviar — WebAR invitation

A printed invitation carries a QR code. Scanning it opens this page, the guest
taps once, the camera opens, and a small 3D scene — a caviar tin that opens,
two champagne flutes, and the invitation card — appears on their table.

No app, no install, no account, no backend. Static files only.

```
printed card → QR → this page → camera → 3D reveal → RSVP
```

**Live:** https://alexanderzakabluk-stack.github.io/ar-invitation/

`assets/qr.png` (screen) and `assets/qr.svg` (print) encode that URL. Point a
phone camera at either and the operating system offers the link — that is the
whole mechanism, and it is why the URL has to be fixed before anything goes to
print.

## The one constraint that shapes everything

**iOS does not support WebXR — in any browser.** Apple requires every iOS
browser to use WebKit, so Chrome, Firefox and Edge on an iPhone are Safari
underneath and have exactly the same gap. There is no flag or workaround.

So the experience ships two paths and picks one at runtime:

| Device | Path | What the guest gets |
| --- | --- | --- |
| Android / Chrome | **WebXR** (`immersive-ar` + hit-test) | Real plane detection, a reticle, world-locked object |
| iPhone / iPad (any browser) | **Passthrough** | Camera feed + gyroscope, scene placed on tap in front of the guest |
| In-app browser (Instagram, WhatsApp…) | — | Detected, with a prompt to open in a real browser |

The passthrough path tracks rotation but not translation: walking around the
object does not orbit it. On a phone held at a table that difference is barely
noticeable, and it is the only way to reach iPhone guests from the browser.

## Running it

```bash
npx serve -l 5173 .
```

- `http://localhost:5173/` — the real flow (needs a camera and https on a phone)
- `http://localhost:5173/?preview` — **no camera**, renders the scene on black
  and lets you drag to orbit. Use this for iterating on the 3D.

The camera requires a secure context, so testing on a phone means deploying
(any static host gives https automatically) rather than hitting a LAN IP.

## Layout

```
index.html      all six UI screens (cover → prepare → place → scene → details → error)
styles.css      the black / copper invitation styling
src/main.js     renderer, both AR paths, the flow between screens
src/scene.js    the 3D content and its reveal timeline
src/env.js      capability detection (the iOS / WebXR logic above)
src/ui.js       screen switching, the WebAudio chime, the .ics file
```

Everything in the 3D scene is generated in code — the tin, the pearls, the
flutes, the sparkles, the environment map and the invitation card texture. There
is no `.glb` to download, so the whole experience is a few hundred KB plus
three.js from a CDN.

## Tuning the reveal

The timeline lives in one object in `src/scene.js`:

```js
const TL = {
  sparksIn:  [0.0, 0.7],
  tinIn:     [0.25, 1.5],
  lidOff:    [1.5, 2.6],
  pearlsIn:  [2.2, 4.1],
  flutesIn:  [3.2, 4.7],
  cardIn:    [4.5, 6.1],
  done:      6.2,
};
```

Seconds from the moment the guest places the scene. Everything else reads from
it, so retiming the reveal is a one-place edit.

## Event details

Date, location, RSVP contact and the `.ics` file are in three places:

- `index.html` — the cover and details screens
- `src/scene.js` — `makeCardTexture()`, the floating card
- `src/ui.js` — the `EVENT` constant used for the calendar file

## Publishing

The repo is served by GitHub Pages from `main`, so pushing to `main` is the
deploy. The URL is permanent, which matters: a QR printed on paper cannot be
changed afterwards.

If the URL ever has to move, regenerate both QR files:

```bash
URL="https://…"
npx qrcode -o assets/qr.png -t png -w 1200 -m 3 -e H "$URL"
npx qrcode -o assets/qr.svg -t svg -m 3 -e H "$URL"
```

Error-correction level `H` is deliberate — it survives the code being printed
small, on dark stock, or partly obscured by a foil or emboss.

## Still to do

- Test the passthrough path on a real iPhone (the open question is whether
  gyroscope-only tracking holds the object convincingly enough)
- Replace the placeholder RSVP name, phone and email with the real ones
- Design the printed card back around the QR
- Optional: per-guest URLs (`/invite/07`) so the card shows the guest's number
