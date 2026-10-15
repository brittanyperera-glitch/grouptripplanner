# Postcard theme: style guide for screen builders

The whole app uses C Postcard (docs/design-notes.md, FINAL THEME): white cards on a cream paper ground. Target look: `docs/mockups/theme-postcard/C-swipe.dc.html` and `C-itinerary.dc.html`. Open them before converting a screen. Tokens and primitives live in `src/styles.css`; use them, never a hex.

**One palette, light only.** No dark mode, no `prefers-color-scheme` or `data-theme` blocks (a test fails if one comes back). Brittany tried a dark green ground on 2026-10-15 and went back to cream. Photo surfaces (`.scene`, `.pick.tall`, `.strip`, the front page photo) keep light text over a dark scrim.

## Tokens

Fixed palette:

| Token | Value | Use for |
|---|---|---|
| `--paper` | #f4ede0 | page ground (`--bg`, `--surface`) |
| `--paper-deep` | #ebe1cf | outside the 440 px column on desktop, image placeholders |
| `--white` / `--card` | #fff | cards, rows, tab bar |
| `--sand` | #e6dcc8 | the Meh button |
| `--red` | #d6452c | lines, pins, borders, focus rings; never small text |
| `--red-deep` | #bf3a22 | red fills with white text: primary button, Must, front page button |
| `--teal-deep` | #1f6f6b | teal fills (Keen, stat bars) and teal on white stamps |
| `--on-red`, `--on-teal` | #fff | text on those fills |
| `--shadow-card` / `--shadow-btn` | 0 10px 30px / 0 6px 14px rgba(60,40,20,.12) | every card / every button |
| `--r-card` 18, `--r-photo` 12, `--r-btn` 14, `--r-stamp` 4 | px | radii |
| `--stamp-border` | 1.5px dashed | stamps (add the colour) |
| `--route-line` | 2px dashed red | the route |
| `--font-head` / `--font-body` | Barlow Condensed 800 uppercase / Manrope | headings / everything else |

Surface tokens. Text colours are set per surface: `:root` takes the `--ground-*` set (the page), and `.on-paper` plus the card classes (`.postcard`, `.info`, `.day`, `.card-list`, `.ko`, `.tile`, `.pace`, `.stepper`, `.item`, `.field`, `.cta.alt`, `.friend-card`, `.quip`, `.player-card`, `.rv-day-card`, `.rv-picks li`) take the `--card-*` set. On cream both sets are the same ink colours, so this only matters if a screen ever needs a different ground: change one set, not every rule.

| Use | Token | Value |
|---|---|---|
| text | `--ink` | #1e2a26 |
| secondary text | `--muted` | #56615c |
| red text (quotes, warnings, Must headings) | `--red-ink` (alias `--coconut-text`) | #b8381f |
| teal text and stamps | `--teal` (alias `--tea`) | #1f6f6b |
| hairlines / chip fill | `--line`, `--line-strong`, `--chip` | ink at 12%, 26%, 7% |

Old names still resolve (`--coconut`, `--must`, `--keen`, `--sunset`, `--glass`...), so an unconverted screen already looks right. New code uses the new names.

## Contrast, measured

| Pair | Ratio | Bar |
|---|---|---|
| ink on paper / white / sand | 12.75 / 14.85 / 10.91 | 4.5 |
| muted on paper / white | 5.53 / 6.44 | 4.5 |
| red text #b8381f on paper / white | 4.98 / 5.80 | 4.5 |
| teal #1f6f6b on paper / white | 5.09 / 5.92 | 4.5 |
| white on red-deep / on teal | 5.46 / 5.92 | 4.5 |
| red line #d6452c on paper / white | 3.80 / 4.42 | 3 (non-text) |
| front page sub line over each cover photo (5th percentile pixel) | 5.80 to 11.31, was 2.09 | 4.5 |

Pinned by `src/screens/cfixes.test.tsx` (R8) and `e2e/postcard.spec.ts` (the photo measurement). Avoid red #d6452c and muted on sand for small text (3.25 and 4.73).

## Primitives

| Piece | Class | Notes |
|---|---|---|
| Card | `.postcard`; photo inside `.postcard-photo` | white, 18 px, soft shadow, 10 px inset |
| Heading | `.big` (40), `.big.display` (44), `.h-display`, `.ask`, `.tierhead` | Barlow 800 uppercase |
| Place-name face | `.place-type` | one rule shared with `.title` (swipe card), `.rv-itin-place` and the name in the top bar (`.top .who b`); set only the size where you use it |
| Stamp label | `.stamp-label`, `.stamp-label.red`, `.stamp-label.solid` (white fill, over a photo) | `.kicker`, `.pill`, `.area-tag`, `.count`, the front page kicker and the selfie button use the same stamp |
| Primary button | `.cta` | red-deep, white Barlow 20 px uppercase, 14 px radius |
| Secondary button | `.cta.alt` | white, ink, hairline |
| Tier buttons | `.t.skip` white, `.t.meh` sand, `.t.keen` teal, `.t.must` red-deep | as in C-swipe |
| List row | `.item` (Rerank.css) | white row, 52 px rounded thumb, Barlow rank; divider lists use `.row2` |
| Route | a list with `.route`, each `li` gets `<span class="route-pin">` | the reveal itinerary is the reference |
| Tab bar | `.tabs` | white bar, selected tab on paper with a red underline |
| Header | `.top` | paper glass, hairline under it, name in the place-name face |
| Empty state | `.empty` | dashed outline, muted centred text, optional `.cta.alt` inside |
| Quip | `QuipBurst` | one big red Barlow line fitted to the column for every kind, a stamp kicker, no particles or emoji |
| Icons | `components/Icons.tsx` | stroke SVGs only, never emoji (the approved stamp uses `IconThumb`) |

Rules carried from Brittany's notes: no accent side bars, no monospace, no emoji, nothing boxed where in-panel text belongs, one primary action per screen.

## Motion

Use only `--dur-fast` (160), `--dur` (280), `--dur-slow` (480) with `--ease`; `--ease-in-out` for fades out and loops; `--ease-in` only for things leaving the screen. JS timers import `MOTION` from `src/components/motion.ts`. No overshoot, no slams. `src/motion-scale.test.ts` enforces this; the full table is `docs/review/motion-audit.md`.

## Screens still to convert (wave 2)

| Screen | File | What is left |
|---|---|---|
| Swipe card | `Rate.tsx` | title sits on the photo; the reference puts it under the photo in ink, the facts and review inside the card, the count in the header |
| Group map, My trip map | `components/Map.tsx` | dark navy sea and orange glow route: redraw on the reveal's paper island |
| Pace art, avatars, poster | `Pace.tsx`, `components/Avatar.tsx`, `Poster.tsx` | orange hexes in the SVG and canvas |
| Route reveal intro and drive | `Reveal.tsx`, `Reveal.css` | still the dark night map with a monospace HUD; only Mission Complete is Postcard |
| Character lock-in flash | `.flash` in styles.css | dark overlay; type and stamp are Postcard, the ground is not |
