# Export

The Personnaliser view's export bar. `src/ui/export.ts` is pure and tested (frame,
catalogue, filename); `src/ui/capture.ts` is the DOM layer (canvas, clipboard);
`src/components/ExportBar.vue` is presentational and only emits a format, like
`Customizer.vue`. **No dependency was added** — `XMLSerializer` and a canvas are
enough.

## Nothing is reserved for the bar, and nothing should be

`--timeline` is already subtracted from the avatar column's height in **both** views
(otherwise the centred avatar would change place when switching tabs), so the band
under the ball is already empty here. Adding an `--export` variable would duplicate
a calculation that already exists.

## The bar is pinned to the WINDOW, like the montage bar

`position: fixed` with the montage bar's own `left: 4.5rem` / `right: 24.5rem`, and
it centres its content. That is what stops it moving: anchored inside the avatar
column it rode the grid's interpolation, and coming back from the settings the
closing left panel moves that column's centre by **320 px** — so the button slid
into place instead of being there. The montage bar never slides for exactly this
reason. The Personnaliser view has only one grid layout, so this position is a
constant.

Vertically it is aimed at the bottom of the avatar's **box**, not the column's: the
silhouette fills only about 65 % of its box's side (the viewBox keeps room for the
animated states' rings, absent at rest), so aiming at the column left **176 px** of
measured dead space between the ball and the button. The `min()` in the `top` calc is
**the one from `.avatar`'s `max-w`** — same box, so the bar follows it as it shrinks
on a short window instead of landing on top of it.

## It's a `transition`, not an `animation` — the main trap

An animation replays on **every mount**: on reload, and on every view change. A
transition doesn't run on an element's first computed style, so the bar is born
visible and stays quiet. That is exactly how `.panneau` works.

Corollary: the bar is **mounted during the arrival**, merely hidden (`--cachee` plus
`inert`, because an `opacity: 0` element is still clickable and focusable). Without a
start state present on screen there would be nothing to interpolate from.

## It only animates on arrival, never on a view change

The one reveal is after the intro, delayed in `App.vue` (400 ms) so the avatar reaches
its place first. Switching views does **not** fade it in: it is pinned to the window,
so it is born already in position, and an element that doesn't move has no business
announcing itself. That is the montage bar's rule too — it doesn't animate between the
settings and the animations, because it is already there.

## The live SVG is serialised, not rebuilt

This works because the bot's SVG is already self-contained: no `var(--…)`, no
Tailwind class, every shape carries its `fill` as a literal hex. Rebuilding a second
render beside it would be a second source of drawing, and it would drift.

Two things that make the raster safe: there is no `<foreignObject>` and no `<image>`,
the only elements that would taint the canvas and break `toBlob`; and `width`/`height`
are set explicitly, because without an intrinsic size Firefox refuses to rasterise an
SVG loaded into an `<img>` and the canvas comes out empty.

Measured on the output at 512²: 71.4 % transparent, 26.7 % body, 1.5 % `paper` for the
eyes, the rest antialiasing.

## The eyes export OPAQUE, in `paper`, and that's a win

A paper-coloured `<path>` sits under the body (`BloubBot.vue`), so the exported image
keeps light eyes on a dark background — real holes would make them disappear there.
Don't "fix" this into transparency.

## The export frame is tighter than the screen's, and shared by all shapes

±125 against ±158. Not a per-shape crop: `skins.ts` normalises radii so that "all
shapes weigh the same to the eye" (the squircle peaks at 1.15 on its diagonal), and
cropping each one separately would put them all back at the same size and break that
tuning. A test checks the frame contains **every** shape, so adding a wider one moves
the frame on its own instead of getting clipped.

## The animated WebP needs no dependency, and that's the whole point

The browser already encodes a WebP frame **with its alpha** — `canvas.toBlob('image/webp')`
returns a file carrying an `ALPH` chunk (or a `VP8L` stream that holds alpha itself). What
it can't do is chain them. But an animated WebP is only a RIFF container around those same
streams — `VP8X` + `ANIM` + one `ANMF` per frame — so there is nothing to compress here,
only to wrap. `anime.ts` does that in pure bytes, node-testable, for **+1.04 kB gzip**
against the 100–300 kB of a libwebp WASM build.

Two things that are not optional:

- **Quality `1` on `toBlob`, i.e. lossless.** Measured on one frame of the bot: 4116 bytes
  lossless against 4128 lossy. A flat two-tone fill gives a lossy encoder nothing to win,
  while it does dirty the edge of the ball. Lossless is free here.
- **Every frame is marked "do not blend"** (`0x02` in the `ANMF` flags). Our frames have
  transparent areas; blended, the previous frame stays visible through them and the ball
  drags a ghost trail behind it. A test locks this bit.

The frames come from an **offscreen** `BloubBot` driven by `frozenAt`, not from the avatar on
screen: on screen the bot sits at an arbitrary clock time, whereas the export wants a
reproducible sequence that starts at the beginning. That works because `engine.sample(t)` is
a pure function of time and because a `BloubBot` given `frozenAt` starts no animation loop
and no listeners. Same component on screen and in the export — one source of drawing.

`frozenAt` had to be made reactive for this (`watch` in `BloubBot.vue`): the prop only ever
placed a frozen tile once, so nothing moved it, and the exported animation stayed on its
first frame.

**Size is strictly proportional to the frame count** — nothing is compressed between frames.
Measured at 384 px: 3.5 kB per frame, 290 kB for four seconds, past what Discord (256 kB) and
Slack (128 kB) accept for an animated emoji. Hence 320 px over 3 s: 167 kB for 60 frames.

**There is no seamless loop to chase.** The drift periods in `liveliness` are deliberately
coprime so the movement never visibly repeats, so the loop point shows. That is the price of
that decision, and it shows less because the gaze drifts slowly. Duration is set so a blink
always lands in frame: the first is at 1.4 s, the rest every 1.9–4.6 s.

## One PNG size, and no GIF

1024 covers every profile-picture spec (Discord 128, X 400, GitHub 500, Slack 512) and
downscales cleanly. Offering 2048 as well made the user decide something that isn't
theirs to decide; whoever wants bigger takes the SVG, which has no size.

GIF is ruled out **for the still export** by its 1-bit transparency: a staircase edge where
PNG has 8 bits of alpha.

An animated GIF is still wanted for platform reach (Discord and Slack take GIF as an animated
avatar, not WebP) and is **not written yet**. It needs a hand-rolled LZW encoder; the palette
side is easy, since the bot uses very few distinct colours — measured on a frame: 71.4 %
transparent, 26.7 % body, 1.5 % `paper`, the rest antialiasing — so an exact palette fits
without dithering. Its edge will be jagged, and that is inherent, not a bug to fix.

## The SVG is copied as TEXT, the image as a blob

`writeText` is what Figma and Illustrator paste back as editable vector; as
`image/svg+xml` it would come back flattened. And the PNG blob goes into the
`ClipboardItem` as a **promise**: Safari requires `write` to originate from the user's
gesture, and any `await` slipped in before it loses that gesture.

Copying an image is offered only where the browser can write one
(`ClipboardItem.supports`); copying the SVG goes through `writeText` and works
everywhere.
