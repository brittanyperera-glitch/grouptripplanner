# Motion audit (Postcard theme, wave 1, 2026-10-15)

Brittany: "check all the transition times make sure nothings jarring". Every `@keyframes`, `transition`, `animation` and animation-driving JS timer in `src` (excluding `src/lib`), and where it landed.

## The scale

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 160 ms | press feedback, hover, the old screen fading out on a tab switch |
| `--dur` | 280 ms | small entrances: next card, VS badge, bubble, tab content, character focus |
| `--dur-slow` | 480 ms | big movements: screen push, card snap back and fly off, sheets, Mission Complete |
| `--ease` | `cubic-bezier(.22, 1, .36, 1)` | calm ease-out, the default |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | fades out, crossfades, idle loops |
| `--ease-in` | `cubic-bezier(.55, 0, 1, .45)` | only for things leaving the screen (the flung card) |

`--ease-spring` is now an alias of `--ease`: no overshoot anywhere. The same numbers live in `MOTION` (`src/components/motion.ts`) for JS timers. `src/motion-scale.test.ts` fails the build if a UI animation uses a literal duration, an overshoot curve, a slam/shake/strobe keyframe, anything under 150 ms, or if `MOTION` drifts from the CSS. `e2e/postcard.spec.ts` reads the computed durations of the character sheet, swipe card and Mission Complete title.

**Ambient loops are not on the scale on purpose**: idle bobs, tuk-tuk wobble and wheels, the Ken Burns pan, the reveal's pulse ring and cheer. They are slow or mechanical, never a reaction to a tap, and are listed in the test's `AMBIENT` allowlist.

## Inventory

| Where | What | Old | New | Why |
|---|---|---|---|---|
| styles.css `.cta`, `.intro-pill`, `.tile`, `.pace`, `.stepper button`, `.same`, `.mv button`, `.t` | press scale | 150 ms `--ease` | `--dur-fast` (160) `--ease` | on the scale |
| styles.css `.tabs button`, `.pick`, `.tile` background | colour and lift | 240 ms | `--dur` (280) | on the scale |
| styles.css `.char` | carousel focus | 240 ms opacity, 300 ms spring scale | `--dur` `--ease` both | spring overshoot removed |
| styles.css `.selfie-pop img` `selfie-in` | selfie pop | 320 ms spring, scale .7 + rotate | `--dur` `--ease`, scale .94 | was a pop and twist |
| styles.css `.select` `sheet-up` | character sheet | declared twice (480 ms then 380 ms), 60 px rise | `--dur-slow`, 24 px rise | duplicate rule, big jump |
| styles.css `.bar > span` `bar-fill` | stat bars | 700 ms, 120 ms stagger | `--dur-slow`, 80 ms stagger | on the scale |
| styles.css `.flash` (lock-in), `.quip` | quip and lock-in | 400 in / 1700 hold / 400 out, out on `ease-in` | same times, out on `--ease-in-out` | Brittany's approved timing kept, easing aligned |
| styles.css `.quip-full .quip-p` `q-float` + QuipBurst.tsx particles | emoji and glyph sparks drifting | 2.1 s per spark, staggered | removed | Brittany: one big line, no emojis |
| styles.css `.flash-name` `rise` | lock-in name | 500 ms | `--dur-slow` | on the scale |
| styles.css `.card` | snap back, demo swing | `--dur-slow` (350) spring | `--dur-slow` (480) `--ease` | spring overshoot removed |
| styles.css `.card` `card-in` | next card rises | 380 ms | `--dur` | on the scale |
| styles.css `.ghost.fly-*` + Rate.tsx timer | flung card | 420 ms CSS, 420 literal in JS | `--dur-slow` + `MOTION.slow` | one number for both |
| Rate.tsx `DEMO_STEP` | first-card demo | 650 ms | kept | must outlast the 480 ms card move (tested) |
| styles.css `.vs` `pop` | VS badge | 420 ms spring from scale .4 | `--dur` `--ease` from .85 | slam removed |
| styles.css `.vs2.face > .pick`, `.day` | card rise | `--dur-slow` | `--dur-slow` | already on the scale |
| styles.css `.screen.enter-*`, view transitions | screen push and tab | 340 ms VT, 350 ms fallback, 180 ms tab out, 26% slide with scale .94 | `--dur-slow` push, `--dur` tab in, `--dur-fast` tab out, 12% slide no scale | VT and fallback now agree; smaller travel |
| styles.css `.tuktuk`, `.meter span`, `.wait-person` | progress | `--dur-slow` / `.3s` fallback | `--dur-slow` `--ease` | on the scale |
| Waiting.tsx tuk-tuk progress | inline `left .3s` | 300 ms linear | `--dur-slow` `--ease` | on the scale |
| styles.css `.slides img` | opening crossfade | 2200 ms ease-in-out | 2200 ms `--ease-in-out` | opening kept as is |
| styles.css `.intro-*` `rise` | opening stagger | 900 ms, 150/350/550 delays | kept | opening kept as is |
| styles.css `kenburns`, `idle-bob`, `char-bop`, `putt`, `over-pulse` | ambient loops | ease-in-out | `--ease-in-out` | ambient, easing aligned |
| styles.css `@keyframes live`, `bob`, `glow` | unused | defined, never referenced | removed | dead |
| Reveal.css intro `rv-type`, `rv-slam`, `rv-fade`, `rv-out`, `rv-map-in`, status | HUD and title | .4 s steps, .5 s slam (scale 2.2, overshoot), .4 s, .45 s, .8 s, .4 s | `--dur-slow` each; slam replaced by `rv-rise`; delays .25/.3/.7/1.9/2.2/2.45 s kept | delays are the reveal's pacing against `INTRO_MS` |
| Reveal.css `rv-card-in` | day card | .45 s overshoot, 40 px + 4° swing | `--dur-slow` `--ease`, 16 px | slam removed |
| Reveal.css `rv-pop` | speech bubble | .38 s overshoot from scale .2 | `--dur` from .85 | slam removed |
| Reveal.css `rv-halt` | tuk-tuk pulls up | .55 s squash 1.1/.84 | `--dur-slow`, squash 1.04/.95 | gentler |
| Reveal.css `rv-pulse` | stop ring | 1 s scale 1.25 | 2 s scale 1.2, `--ease-in-out` | half the strobe rate |
| Reveal.css Mission Complete title, stamps, crew | end screen | .55 s slam, .4 s fade, .5 s overshoot pop | `--dur-slow` `--ease` rise and fade | slam removed |
| Reveal.css `rv-paper-in` (new) | night map to paper | hard cut dark to light | `--dur-slow` background ease | the cut was the most jarring moment |
| Reveal.css `rv-cheer` | crew hop | 1.6 s x2 | kept, `--ease-in-out` | ambient |
| Reveal.tsx `INTRO_MS` 3000, `HOLD_MS` 2500, `HOME_MS` 1400 | reveal pacing | | kept | Brittany asked to keep the sequence pacing |
| Name.tsx `SLIDE_MS` 6000, `FLASH` 400/1700/400; QuipBurst `QUIP_MS` 400/1700/400 | opening slides, lock-in, quips | | kept | approved timings |
| Map.tsx `PAUSE_MS` 450, routeDrive legs 700 to 1600 ms with ease-in-out | My trip tuk-tuk drive | | kept | a drive, timed by distance |
| TukTuk.css wobble .34 s, wheel .4 s, puff .6 s, idle 1.3 s | tuk-tuk | ease-in-out / ease-out | `--ease-in-out` / `--ease` | mechanical loops |
| Rerank.tsx | drag rows | dnd-kit default (250 ms ease) | kept | library-driven, under the reduced-motion guard |
| Poster.tsx 1000 ms, supabase.ts 200 ms | URL revoke, reload debounce | | not motion | |
