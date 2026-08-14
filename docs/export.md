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

## The animation is an SVG, and that is what makes it smooth

A flipbook format — WebP, GIF, APNG — is capped by its frame count. The blink lasts
0.18 s (`BLINK_DUR`), so at 20 fps it gets three or four frames and reads as a stutter.
An animated **SVG** doesn't have frames: the browser interpolates between keyframes, so
the motion is smooth at the display's refresh rate however few keyframes we emit. That is
the whole reason for this choice — an animated WebP was built first, measured, and dropped
for being both choppier and 10× heavier (167 kB against 16 kB).

**Only the eyes are animated, and that is measured.** At rest the silhouette moves by
1.17 units on a radius of 100 over three seconds — about a pixel and a half at export
size. So the body is emitted once, static, and all the weight of a bot animation is in its
gaze. `liveliness` says the same thing in words: "toute la vie passe par le regard et les
clignements".

**The drawing is not rebuilt.** `svgAnime` takes the SVG `BloubBot` already rendered for
the first keyframe and swaps each eye's `transform` attribute for an animated class. One
source of drawing, same rule as the still export.

Three things that are not optional:

- **`transform-box: view-box` and `transform-origin: 0 0`.** A CSS transform on an SVG
  element rotates around its bounding-box centre, not the user-space origin, so without
  these the eye flies to the other side of the ball.
- **`animation-direction: alternate`.** The gaze drift is not periodic — the periods in
  `liveliness` are deliberately coprime so the movement never visibly repeats — so a plain
  loop would jump at the seam. Played forwards then backwards it rejoins itself exactly,
  and a blink in reverse is still a blink. This is the one thing the bitmap export could
  never have.
- **The eyes are the only shapes in the mask carrying a `transform`** (the body has none),
  which is what makes document order enough to identify them.

Keyframes are emitted at 30/s: a keyframe is one matrix of text, so density is nearly free,
and it follows the blink's asymmetric curve faithfully. Measured on the output: eye area
921 → 193 → 933 px across the blink, sampled every 40 ms against 33 ms keyframes — the
values fall between keyframes, which is the interpolation showing.

## One PNG size, and no GIF

1024 covers every profile-picture spec (Discord 128, X 400, GitHub 500, Slack 512) and
downscales cleanly. Offering 2048 as well made the user decide something that isn't
theirs to decide; whoever wants bigger takes the SVG, which has no size.

GIF is ruled out **for the still export** by its 1-bit transparency: a staircase edge where
PNG has 8 bits of alpha.

## The animated GIF exists only for platform reach

Discord and Slack accept a GIF as an animated avatar and an SVG nowhere, which is its whole
reason to exist. Everywhere else the animated SVG is better on every axis.

It is **transparent, not matted**, and that costs a hard edge: GIF alpha is one bit, so the
ball's antialiased rim is thresholded at 50 % opacity and comes out as a staircase. That is
the format, not a bug. The mitigation is to export at 320 px while an avatar displays at
40–128 px — the browser's downscale smooths the steps back out. Matting against a colour
would smooth the edge instead, but bake that colour in and fringe on any other background.

Its LZW encoder is hand-rolled (no dependency), and it holds **the one trap of the format**:
the encoder writes its dictionary entry right after emitting a code, while the decoder only
writes its own when it reads the *next* code. The decoder is therefore permanently one entry
behind, so the encoder must widen its codes one step late — `suivant > (1 << taille)`, never
`===`. Getting that wrong desynchronises the two and every reader rejects the file, with
nothing in the structure to show why. There is a round-trip test decoding the stream back to
its exact pixels, because structural assertions cannot catch this.

The palette is exact rather than dithered: the bot uses very few distinct colours (71.4 %
transparent, 26.7 % body, 1.5 % `paper`, the rest antialiasing), so index 0 is reserved for
transparency and the rest fit. Frames are disposed to background (`2 << 2`), the GIF
equivalent of "do not blend" — without it the transparent areas keep the previous frame and
the ball drags a trail. Delays are in **hundredths** of a second, which caps the useful rate,
and never below 2 since 0 and 1 are handled inconsistently by readers.

Measured on the output: 147 kB, 60 frames at 320², decoded back by Chrome with a transparent
corner and 2033 pixels changing between frames.

## The SVG is copied as TEXT, the image as a blob

`writeText` is what Figma and Illustrator paste back as editable vector; as
`image/svg+xml` it would come back flattened. And the PNG blob goes into the
`ClipboardItem` as a **promise**: Safari requires `write` to originate from the user's
gesture, and any `await` slipped in before it loses that gesture.

Copying an image is offered only where the browser can write one
(`ClipboardItem.supports`); copying the SVG goes through `writeText` and works
everywhere.
