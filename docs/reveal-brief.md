# Route reveal brief (Brittany, 2026-10-15)

Her words: "I'd make the final reveal feel like a chaotic, old-school GTA: San Andreas mission intro meets a
Sri Lankan road-trip map. The screen starts dark, the route gets drawn onto the map, and a little illustrated
tuk-tuk drives along it, stopping at each destination to reveal the plan for that day. The tuk-tuk should be a
recurring character in the app, not just an icon: chunky, colourful, slightly ridiculous, with a little wobble
as it drives."

Her three upgrades:
1. A real illustrated island: stylised Sri Lanka silhouette, tea plantations, jungle, coastline, tiny landmarks.
   Bold hand-drawn route.
2. The tuk-tuk reacts at each stop: bounces to a halt, little speech bubble, reveals that day's card.
   (Sound: now on, see the 2026-10-15 sound bullet in docs/design-notes.md.)
3. A proper payoff: a MISSION COMPLETE screen with the whole winning itinerary, the group's chosen experiences,
   and the five characters reacting (the selfies in public/img/players/*-selfie.png).

Her visual reference (a prototype she pasted; Next.js "use client", adapt to this Vite app):
- Fonts: Barlow Condensed 600-900 (titles, map labels) and Space Mono 400/700 (body, HUD text).
- Palette: night #141a16, cream #fff5d9, gold #f4bc43, tuk red #ef5939 / route #f15b3a, map paper #d6dfad,
  terrain #b9ce91 / #8ca978, ink #25372b, muted #c2c9b4.
- HUD copy in that voice: "LK.exe // Trip generator", "Mission unlocked", "THE PLAN IS IN.",
  "FIVE OPINIONS. QUESTIONABLE LOGISTICS. ONE VERY GOOD HOLIDAY.", stamp "SRI LANKA TOUR '26",
  "ROUTE CALCULATED // LK-001", day card "DAY 01 // DESTINATION LOCKED", "STOP 1 OF 4 · THE CREW HAS SPOKEN",
  footer "NO REFUNDS. ONLY MEMORIES." / "POWERED BY GROUP CHAT DEMOCRACY.".
- Map: paper rectangle with gold border and hard offset shadow, terrain bands, contour lines, highlands.
- Route: thick red stroke drawn on with stroke-dashoffset.
- Tuk-tuk SVG: red body, gold canopy, glass windows, dark wheels with cream rim, "TUK" roof sign, ground shadow.
- Her own note on the prototype: it animates the whole route in one go; the real version should drive stop to
  stop and pause to reveal each day card.
