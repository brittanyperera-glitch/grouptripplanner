# Hostels research (T21, T21b)

Checked 2026-10-16. This file documents the data behind the Guide's Hostels tab (`src/content/hostels.json`, photos in `public/img/hostels/`). `data/hostels.draft.json` is the research record: the same fields plus `hwId` (Hostelworld property id) and `tagSource`.

## How the numbers were got

- Ratings, review counts, descriptions and photos: Hostelworld's public property data, `prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/<hwId>/?currency=GBP` (the endpoint the Hostelworld site itself calls). Rating is the site's 0 to 100 overall score divided by 10. Spot check: Bunkalow 9.5 from 454 and Eden Kandy 9.8 from 315 match the live city page.
- Prices: same service, `/availability/?date-start=2026-12-08&num-nights=1&number-of-guests=1&currency=GBP`, so they are GBP as returned, not converted. Bunk = cheapest mixed dorm bed (cheapest women's or men's dorm only if no mixed dorm is offered, and the card says so). Room = cheapest private room, with how many it sleeps. Hostelworld prices a private as one room for the night; the page was not driven through the booking UI to confirm that, so treat the room figure as per room (the 5-person room at River Face Inn is 44.62, which only makes sense per room).
- Five hostels return no beds or rooms for Dec 8 to 10 (nor on 10 other December dates tried): Bunkalow, Gregory House, Happy Hammocks Weligama, Wanderers Hostel, Tony's Garden House Inn. Both prices are null with a note; nothing was invented. Hostelworld's undated "lowest price" for them is unreliable (Gregory House shows 0.00) so it is not used.
- Photo: one photo per hostel from its own Hostelworld listing (personal use only, per Brittany 2026-10-16), resized to 720 px wide JPEG, quality 74 (900 px at 80 came to 10 MB for 42 photos; the cap was 4 MB). For 11 hostels the listing's first photo was a logo, sign or poster, so another photo from the same listing was used. Yaarl Hostels has no Hostelworld page and no fetchable photo, so it keeps the researched town photo (Jaffna Fort, Rehman Abubakr, CC BY-SA 4.0, Wikimedia Commons).
- Prices and ratings are a snapshot from 2026-10-16. Dec 8 availability and rates will move.

## Fields

`id, name, hub, area, mapsUrl, rating{source,score,outOf,reviews,checked,url}, about, groupFit, bunkGbp, roomGbp, roomFor, priceDate, priceChecked, priceNote, bookUrl, photo{file,source}, tag, tagSource, note`. `hub` is the display group (a hub in `src/data/legs.json`, or "Off route"); `area` is the real town. Groups (label, vibe line, optional note) are in the same file.

## Matches and drops

- Added from Brittany's pasted list: C1 Colombo Fort, Clock Inn Colombo, Bunk Station Hostel, Aurora Hostel, Wake N Flow Weligama, JJ's Hostel Mirissa, Wake N Flow Hiriketiya, Nest Residence (Tangalle), Snooze Station by Sydney Galle, Spindrift Madiha, The Doctor's House, Funky Leopard Safari Lodge, Fins Arugam Bay. Colombo Beach Hostel (Mount Lavinia) and Eden Kandy were already in.
- "Kandy City..." was truncated; matched to 281 Kandy City Hostel (Hostelworld 4.0 from 224 reviews). The other candidate was Kandy City Stay (7.8 from 14 reviews); Clock Inn Kandy is not on Hostelworld.
- Spindrift Madiha and The Doctor's House are in Madiha, near Matara (not Galle itself); shown with the south coast group.
- Funky Leopard is listed on Hostelworld as "Funky Leopard Safari Lodge Bordering Yala National Park" (no dorm beds returned for Dec 8, only private rooms).
- Jaffna "all three": Yaarl Hostels (town), Delft Village Stay (Delft Island), Tony's Garden House Inn (guesthouse in town, Hostelworld 9.7 from 109). Delft Eco Beachfront Villa also appears on Hostelworld's Jaffna list and was left out.
- Udawalawe: no hostels; guesthouses only. Arugam Bay is off route; December is off-season there (season roughly May to September, from Brittany's list).
- Dropped: none.

## Not verified

- Yaarl Hostels: rating 7.0 from 364 reviews is Booking.com as quoted on its Kayak page; the Booking.com page itself would not load. Kayak shows about US$15 to 17 for a double (Oct 18), not converted, so no GBP price. Its bookUrl is the Kayak page.
- Hostelworld descriptions and a few reviews back the Social and Quiet tags (source named per hostel in `tagSource`); they are one-source judgements.
- Sigiriya "Pidurangala is cheaper and quieter" is from Brittany's list, not checked here.
- Mount Lavinia for Colombo Beach Hostel is from the De Saram Road address plus her list.

## All hostels

| Stop | Hostel | Rating | Bunk (GBP) | Room (GBP) | Page |
|---|---|---|---|---|---|
| Negombo (airport) | Ceylon Glory Hostel (Negombo) | 9.5 Hostelworld, 321 | 8.83 | 16.3 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/325230/ceylon-glory-hostel/) |
| Negombo (airport) | Marine Tourist Guest House @ Negombo Beach (Negombo Beach) | 9.3 Hostelworld, 858 | 8.15 | 19.69 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/42719/marine-tourist-guest-house-negombo-beach/) |
| Colombo | Alma Hostel - Colombo (Colombo) | 9.4 Hostelworld, 318 | 12.07 | 41.5 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/332282/alma-hostel-colombo/) |
| Colombo | Drop Inn Hostels (Colombo 5) | 9.1 Hostelworld, 698 | 10.26 | 33.7 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/294182/drop-inn-hostels/) |
| Colombo | C1 Colombo Fort (Colombo Fort) | 7.2 Hostelworld, 498 | 11.79 | 37.39 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/286107/c1-colombo-fort/) |
| Colombo | Clock Inn Colombo (Colpetty, Colombo 3) | 9.1 Hostelworld, 455 | 8.84 | 27.21 (sleeps 1) | [page](https://www.hostelworld.com/hostels/p/71081/clock-inn-colombo/) |
| Colombo | Colombo Beach Hostel (Mount Lavinia, Colombo) | 9.1 Hostelworld, 1670 | 6.86 | 27.64 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/81992/colombo-beach-hostel/) |
| Jaffna and Delft | Yaarl Hostels (Jaffna town) | 7.0 Booking.com, 364 | none | none | [page](https://www.kayak.com/Jaffna-Hotels-Yaarl-Hostels.3764689.ksp) |
| Jaffna and Delft | Delft Village Stay (Delft Island) | 10.0 Hostelworld, 87 | 7.64 | 10.42 (sleeps 1) | [page](https://www.hostelworld.com/hostels/p/326148/delft-village-stay/) |
| Jaffna and Delft | Tony's Garden House Inn (Jaffna town) | 9.7 Hostelworld, 109 | none | none | [page](https://www.hostelworld.com/hostels/p/286297/tony-s-garden-house-inn/) |
| Trincomalee | Wanderers Hostel (Uppuveli) | 8.8 Hostelworld, 389 | none | none | [page](https://www.hostelworld.com/hostels/p/297704/wanderers-hostel/) |
| Trincomalee | CU Hostel (Uppuveli) | 9.5 Hostelworld, 46 | 5.79 | none | [page](https://www.hostelworld.com/hostels/p/333199/cu-hostel/) |
| Sigiriya and Pidurangala | Tree House Hostel Sigiriya (Pidurangala, Sigiriya) | 9.5 Hostelworld, 1429 | 17.35 | 22.63 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/304624/tree-house-hostel-sigiriya/) |
| Sigiriya and Pidurangala | Another World Hostel (Sigiriya) | 9.6 Hostelworld, 383 | 13.89 | 34.72 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/326099/another-world-hostel/) |
| Sigiriya and Pidurangala | Roy's Villa (Kimbissa, Sigiriya) | 9.8 Hostelworld, 1824 | 26.41 | 105.63 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/278093/roy-s-villa/) |
| Kandy | Bunkalow (Kandy) | 9.5 Hostelworld, 454 | none | none | [page](https://www.hostelworld.com/hostels/p/325726/bunkalow/) |
| Kandy | White Rose Hostel (Kandy city) | 9.3 Hostelworld, 377 | 6.79 | 20.37 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/301427/white-rose-hostel/) |
| Kandy | Eden Kandy (Bahirawakanda, Kandy) | 9.8 Hostelworld, 315 | 7.77 | 23.3 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/333094/eden-kandy/) |
| Kandy | 281 Kandy City Hostel (Peradeniya Road, Kandy) | 4.0 Hostelworld, 224 | 6.92 | 10.77 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/286096/281-kandy-city-hostel/) |
| Kitulgala | Ceylon Nature Hostel Kitulgala (Kitulgala) | 10.0 Hostelworld, 28 | 4.89 | 13.45 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/317751/ceylon-nature-hostel-kitulgala/) |
| Nuwara Eliya | Laughing Leopard Hostel (Nuwara Eliya) | 8.0 Hostelworld, 924 | 6.33 | 15.83 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/292703/laughing-leopard-hostel/) |
| Nuwara Eliya | C'est La Vie (Nuwara Eliya) | 9.3 Hostelworld, 150 | 5.43 | none | [page](https://www.hostelworld.com/hostels/p/335751/c-est-la-vie/) |
| Nuwara Eliya | Gregory House (Gregory Lake, Nuwara Eliya) | 9.4 Hostelworld, 111 | none | none | [page](https://www.hostelworld.com/hostels/p/317272/gregory-house/) |
| Ella | Tomorrowland Hostel Ella (Passara Road, Ella) | 9.5 Hostelworld, 854 | 14.04 | 18.32 (sleeps 1) | [page](https://www.hostelworld.com/hostels/p/273648/tomorrowland-hostel-ella/) |
| Ella | Ella Escapade Hostel (by Nomadic) (Ratmalkanda, Ella) | 9.3 Hostelworld, 525 | 6.04 | 21.13 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/290014/ella-escapade-hostel/) |
| Ella | Avocado Hostel (Ella) | 9.4 Hostelworld, 496 | 10.94 | 22.63 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/320140/avocado-hostel/) |
| Ella | Bunk Station Hostel (3rd Mile Post, Ella) | 9.9 Hostelworld, 382 | 12.0 | none | [page](https://www.hostelworld.com/hostels/p/295105/bunk-station-hostel/) |
| Tissa and Yala | Go Yala Hostel (Julpallama, near Tissa) | 9.2 Hostelworld, 32 | 6.79 | 30.18 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/333098/go-yala-hostel/) |
| Tissa and Yala | River Face Inn (Debarawewa, near Tissa) | 9.9 Hostelworld, 21 | 9.26 | 44.62 (sleeps 5) | [page](https://www.hostelworld.com/hostels/p/326513/river-face-inn/) |
| Tissa and Yala | Funky Leopard Safari Lodge Bordering Yala National (Yala National Park edge) | 10.0 Hostelworld, 14 | none | 15.21 (sleeps 3) | [page](https://www.hostelworld.com/hostels/p/285330/funky-leopard-safari-lodge-bordering-yala-national/) |
| Weligama and the south coast | The Spindrift Hostel (Weligama) | 9.9 Hostelworld, 586 | 7.54 | none | [page](https://www.hostelworld.com/hostels/p/292497/the-spindrift-hostel/) |
| Weligama and the south coast | Happy Hammocks, Weligama Beach (Weligama) | 9.8 Hostelworld, 392 | none | none | [page](https://www.hostelworld.com/hostels/p/321018/happy-hammocks-weligama-beach/) |
| Weligama and the south coast | Hangtime Hostel (Weligama bypass road) | 9.4 Hostelworld, 567 | 9.42 | 30.53 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/267355/hangtime-hostel/) |
| Weligama and the south coast | Aurora Hostel (Weligama) | 10.0 Hostelworld, 150 | 6.04 | 30.18 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/317598/aurora-hostel/) |
| Weligama and the south coast | Wake N Flow, Weligama (Weligama) | 8.8 Hostelworld, 111 | 8.66 | 34.63 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/328999/wake-n-flow-weligama/) |
| Weligama and the south coast | JJ's Hostel (Mirissa) | 9.6 Hostelworld, 606 | 11.32 | 31.12 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/267561/jj-s-hostel/) |
| Weligama and the south coast | Wake N Flow, Hiriketiya (Hiriketiya) | 9.1 Hostelworld, 117 | 14.19 | 25.8 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/334726/wake-n-flow-hiriketiya/) |
| Weligama and the south coast | Nest Residence (Tangalle) | 7.1 Hostelworld, 128 | 7.5 | 10.71 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/277765/nest-residence/) |
| Weligama and the south coast | Snooze Station by Sydney Galle (Galle) | 8.9 Hostelworld, 72 | 17.85 | 33.65 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/329199/snooze-station-by-sydney-galle/) |
| Weligama and the south coast | Spindrift Madiha (Madiha, near Matara) | 9.9 Hostelworld, 149 | 15.62 | 60.74 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/313147/spindrift-madiha/) |
| Weligama and the south coast | The Doctor's House (Madiha, near Matara) | 8.6 Hostelworld, 230 | 9.81 | 43.76 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/275411/the-doctor-s-house/) |
| Off route: Arugam Bay | Fins Arugambay (Arugam Bay) | 8.6 Hostelworld, 45 | 9.05 | 37.72 (sleeps 2) | [page](https://www.hostelworld.com/hostels/p/327446/fins-arugambay/) |
