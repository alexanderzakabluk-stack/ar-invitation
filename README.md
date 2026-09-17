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

## How the card anchors the scene

The card does two jobs. Its QR opens the page, and its artwork is the tracking
target: once the camera is running, the scene locks onto the card itself rather
than appearing wherever the guest taps.

Tracking runs on [MindAR](https://github.com/hiukim/mind-ar-js), which does its
own image tracking on a plain `getUserMedia` feed. That matters because **iOS
has no WebXR in any browser** — Apple requires every iOS browser to use WebKit,
so Chrome and Firefox on an iPhone have the same gap as Safari. MindAR sidesteps
that entirely and gives every phone the same experience.

A fallback appears after 15 seconds of not finding the card: the guest can place
the scene on a table instead, using the gyroscope. That covers someone looking
at a screenshot, or who left the card at home.

### The printed design has to earn its tracking

Image tracking needs high-contrast detail to lock onto. **A mostly-black card
with thin type tracks badly** — there is almost nothing for the algorithm to
hold. The caviar photograph is what makes the cover work, so whatever goes to
print has to keep a large, textured, high-contrast area.

`assets/target.png` is the reference card, and `assets/targets.mind` is the
compiled tracking data. They must always describe the same artwork.

### Recompiling the target after a design change

```bash
npx serve -l 5173 .          # tools/compile.html needs to be served, not opened
node tools/receive.mjs       # writes assets/targets.mind
```

Then open `http://localhost:5173/tools/compile.html`, wait for "done", and POST
the result to the receiver. `tools/card.html` regenerates the reference card
itself if the layout changes.

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
index.html          all six UI screens (cover → prepare → scan → scene → details → error)
styles.css          the black / copper invitation styling
src/main.js         the flow between screens, and the table-placement fallback
src/ar-image.js     MindAR image tracking — the primary path
src/scene.js        the 3D content and its reveal timeline
src/env.js          capability detection and permission requests
src/ui.js           screen switching, the WebAudio chime, the .ics file
src/three-compat.js shim so mind-ar runs against current three
tools/card.html     generates the reference card artwork
tools/compile.html  compiles that artwork into assets/targets.mind
tools/receive.mjs   catches the compiled file and writes it to disk
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

- Test tracking on a real iPhone against the printed card
- Replace the placeholder RSVP name, phone and email with the real ones
- Replace the reference card with the real artwork, then recompile the target
- Optional: per-guest URLs (`/invite/07`) so the card shows the guest's number
