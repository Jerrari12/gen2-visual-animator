/* =========================================================================
   FILAMENT CATALOG - the shared filament list
   =========================================================================
   SOURCE OF TRUTH: gen2-visual-animator/viewer/js/filament-db.js
   CONTRACT VERSION: 1

   Moved out of main.js on 2026-09-05, unchanged. It had been a `const` at
   line 4052 of a 6,592-line module: not exported, not fetchable, and therefore
   unreadable by anything but this file - which is what made "read Build
   Studio's filament list" an extraction rather than a read.

   WHY A MODULE AND NOT JSON. Each brand block ends in a `.map()` that DERIVES
   `label` and `url` from `name` (`label: \`Panchroma ${f.name}\``), so the
   catalog is a computation, not a table. Baking it into JSON would freeze 101
   derived labels and 27 derived links as literals, and the next colour added
   would have to repeat a pattern by hand instead of inheriting it.
   ⚠ AND main.js CANNOT READ JSON SYNCHRONOUSLY. `_db()` and `CLASSIC_FACE`
   run at module-evaluation time, so a `fetch()` would make the catalog async
   and cascade through the presets. An ES module keeps the derivation, keeps
   the synchronous read, and is still a file any JS consumer can import.

   HOW THE OTHER REPO CONSUMES IT. Byte-for-byte vendoring, the convention
   `requirement-scope.js` and `tabletop-completion.js` already use in the other
   direction: edit HERE ONLY, then re-vendor, and both suites gate on equality
   so a divergent copy fails rather than drifting.

   THE SHAPE, MEASURED RATHER THAN ASSERTED (2026-09-05, 6 brands / 101 colours):
     brand   { brand, line, url, colors[] }              - all 6 identical
     colour  { name, label, hex, url } + optional `id`,  - 5 row shapes:
             `pick`, `pickNote`                            75 with id
                                                            20 without
                                                             3 +pick +pickNote
                                                             2 +id +pick +pickNote
                                                             1 +pick
   `label` is UNIQUE across all brands - 101 labels, 0 collisions, 0 undefined -
   which is load-bearing: it is the identity key `customColors` stores, and the
   key `_db()` and the picker's active-ring match on.

   ⚠ `customColors` IS KEYED BY PART TYPE, NOT BY FILAMENT. The palette maps
   `Type` or `Type:zone` (e.g. `Faceplate:GRIP ACCENT`) to `{ name, hex, url }`,
   where `name` is the filament's `label` above. A palette entry is an OBJECT;
   a bare hex string is dropped by `cleanPalette`.
   ========================================================================= */

// ---------- filament colors ----------
// Multi-brand filament database. Each brand entry: { brand, line, url (shop
// fallback), colors: [{name, label, hex, url, pick?}] }. `label` must stay
// UNIQUE across all brands — customColors stores it as the identity key.
// Adding a brand (Prusa / Polar / Printed Solids / …) = appending one entry
// here; the menu renders it as its own collapsible section automatically.
// Polymaker: real Panchroma™ Basic PLA 1.75mm/1kg variants (names + Shopify
// variant ids pulled from shop.polymaker.com 2026-07-05; hexes approximated —
// refine against the spool renders anytime). The Elegoo entry is Joey's
// budget pick (amzn.to IS an affiliate link) — mainly cases & drawer bodies.
//
// Polymaker links are Joey's AMBASSADOR tracked links (Superfiliate, 2026-08-07).
// The `q` value is Superfiliate's OWN feed handle — `pla` / `silk-pla`, NOT the
// shop's `panchroma-pla` / `panchroma-silk` — and only PORTAL-MINTED values are
// valid: an unknown q fails SOFT (attribution + the 15% first-purchase code
// still attach; the shopper just lands on the store root instead of the
// product). Chain: /JERRARI?q=… → superfiliate session → /discount/JERRARI
// ?redirect=/products/… — so the code arrives pre-applied at checkout.
// Colour/variant preselect is NOT supported by these links (verified: the
// variant syntax gets stripped), which is why the buy button names the exact
// colour to pick on the page. The per-colour variant ids are KEPT in the data
// below so plain deep links can be restored the day Superfiliate supports
// them: `https://shop.polymaker.com/products/panchroma-pla?variant=${id}`.
const POLY_LINK = q => `https://shop.polymaker.com/JERRARI?q=${q}`;
const PM = id => POLY_LINK('pla');           // id retained in the colour rows, unused for now
const PM_SILK = POLY_LINK('silk-pla');
const POLYMAKER_URL = PM(44863271895097);
const FILAMENT_DB = [
  { brand: 'Polymaker', line: 'Panchroma™ PLA', url: POLYMAKER_URL, colors: [
    { name: 'Black',           hex: '#2b2b2e', id: 44863271731257 },
    { name: 'Dark Grey',       hex: '#4a4c51', id: 44863271010361 },
    { name: 'Steel Grey',      hex: '#6e7178', id: 44863271829561 },
    { name: 'Grey',            hex: '#9a9da3', id: 44863271862329 },
    { name: 'Cold White',      hex: '#eef1f4', id: 44863271043129 },
    { name: 'White',           hex: '#f5f4ee', id: 44863271895097 },
    { name: 'Cream',           hex: '#f1e7cf', id: 44863271239737 },
    { name: 'Beige',           hex: '#ddc9a3', id: 44863271436345 },
    { name: 'Tan',             hex: '#c8a97e', id: 44863271108665 },
    { name: 'Brown',           hex: '#7a5236', id: 44863271338041 },
    { name: 'Red',             hex: '#d23a2e', id: 44863271796793 },
    { name: 'Wine Red',        hex: '#7e2432', id: 44863271534649 },
    { name: 'Magenta',         hex: '#d4308f', id: 44863271174201 },
    { name: 'Pink',            hex: '#f0a4c0', id: 44863271632953 },
    { name: 'Orange',          hex: '#ff8a40', id: 44863271665721 },
    { name: 'Yellow',          hex: '#f5c542', id: 44863271567417 },
    { name: 'Lemon Yellow',    hex: '#f8e35a', id: 44863271305273 },
    { name: 'Lime Green',      hex: '#9ccb3b', id: 44863271206969 },
    { name: 'Green',           hex: '#3f9b4f', id: 44863271698489 },
    { name: 'Jungle Green',    hex: '#1f6e46', id: 44863271501881 },
    { name: 'Olive Green',     hex: '#708238', id: 44863271469113 },
    { name: 'Dark Olive Drab', hex: '#4e5136', id: 44863271075897 },
    { name: 'Polymaker Teal',  hex: '#00a5a5', id: 44863271272505 },
    { name: 'Aqua Blue',       hex: '#5cc6e0', id: 44863271403577 },
    { name: 'Azure Blue',      hex: '#2e8fdc', id: 44863271141433 },
    { name: 'Blue',            hex: '#2f6fbe', id: 44863271764025 },
    { name: 'Stone Blue',      hex: '#4a6a8a', id: 44863271370809 },
    { name: 'Purple',          hex: '#7a4fb0', id: 44863271600185 },
  ].map(f => ({ ...f, label: `Panchroma ${f.name}`, url: PM(f.id) })) },
  // Silk is a separate Panchroma product page (shop handle silk-pla), so it
  // gets its own section rather than a stray url inside the Basic PLA block.
  // All 24 new-formula 1.75mm/1kg colours (variant ids scraped from the shop's
  // product JSON 2026-08-07, shop's own order; ids KEPT like the PLA section's
  // — unused until Superfiliate supports variant deep links; hexes are
  // approximated silk sheens, refine against spool renders anytime).
  // Availability is deliberately NOT tracked — spool stock shifts weekly
  // (Silver ships as a refill right now) and the product page is the truth.
  // Silver is the Classic faceplate GRIP ACCENT default (Joey 2026-07-25) —
  // its label 'Panchroma Silk Silver' is load-bearing: PRESETS' CLASSIC_FACE
  // block and saved user palettes match on it exactly.
  { brand: 'Polymaker', line: 'Panchroma™ Silk PLA', url: PM_SILK, colors: [
    { name: 'Silk Black',         hex: '#3a3b40', id: 43637560868921 },
    { name: 'Silk Purple',        hex: '#8655c8', id: 43637560901689 },
    { name: 'Silk Magenta',       hex: '#d63d9a', id: 43637560934457 },
    { name: 'Silk Rose',          hex: '#e87c9c', id: 43637560967225 },
    { name: 'Silk Red',           hex: '#d43a3a', id: 43637560999993 },
    { name: 'Silk Rose Gold',     hex: '#e0a48c', id: 43637561032761 },
    { name: 'Silk Quartz Pink',   hex: '#f2c4cf', id: 43637561065529 },
    { name: 'Silk Bronze',        hex: '#b0703a', id: 43637561098297 },
    { name: 'Silk Orange',        hex: '#f28034', id: 43637561131065 },
    { name: 'Silk White',         hex: '#f4f3ee', id: 43637561163833 },
    { name: 'Silk Gold',          hex: '#d9b13b', id: 43637561196601 },
    { name: 'Silk Yellow',        hex: '#f2d03c', id: 43637561229369 },
    { name: 'Silk Lime',          hex: '#aad438', id: 43637561262137 },
    { name: 'Silk Green',         hex: '#3da954', id: 43637561294905 },
    { name: 'Silk Teal',          hex: '#2aa8a0', id: 43637561327673 },
    { name: 'Silk Light Blue',    hex: '#7ec3ea', id: 43637561360441 },
    { name: 'Silk Blue',          hex: '#3672c8', id: 43637561393209 },
    { name: 'Silk Chrome',        hex: '#c8ccd2', id: 43637561425977 },
    { name: 'Silk Silver',        hex: '#cdd2d9', id: 43637561458745, pick: true,
      pickNote: ' · Joey’s silver for grip-accent rods' },
    { name: 'Silk Brass',         hex: '#c9a545', id: 43637561491513 },
    { name: 'Silk Peridot Green', hex: '#9fb43a', id: 43637561524281 },
    { name: 'Silk Periwinkle',    hex: '#8a96dc', id: 43637561557049 },
    { name: 'Silk Dark Blue',     hex: '#2b4a8c', id: 43637561589817 },
    { name: 'Silk Gunmetal Grey', hex: '#6a6f78', id: 43637561622585 },
  ].map(f => ({ ...f, label: `Panchroma ${f.name}`, url: PM_SILK })) },
  // Polymaker PETG — feed handle petg, all 25 real 1.75mm/1kg variants
  // (variant ids scraped from the shop's product JSON 2026-08-07, shop order,
  // Galaxy/Clear/Army Brown included; hexes approximated like every section).
  // ★ PETG Black is Joey's recommended PETG — the premium lane beside the
  // Elegoo budget pick below; both stars are honest, different budgets.
  { brand: 'Polymaker', line: 'PETG', url: POLY_LINK('petg'), colors: [
    { name: 'PETG Black',            hex: '#26272b', id: 45079221108793, pick: true,
      pickNote: ' · Joey’s recommended PETG for cases & drawer bodies' },
    { name: 'PETG White',            hex: '#f2f2ee', id: 45079221141561 },
    { name: 'PETG Grey',             hex: '#9a9da3', id: 45079221174329 },
    { name: 'PETG Red',              hex: '#cf3430', id: 45079221207097 },
    { name: 'PETG Orange',           hex: '#f07a26', id: 45079221239865 },
    { name: 'PETG Blue',             hex: '#2f66b8', id: 45079221272633 },
    { name: 'PETG Yellow',           hex: '#f2c73b', id: 45079221305401 },
    { name: 'PETG Dark Grey',        hex: '#4d4f54', id: 45079221338169 },
    { name: 'PETG Teal',             hex: '#159a9c', id: 45079221370937 },
    { name: 'PETG Silver',           hex: '#b9bec6', id: 45079221403705 },
    { name: 'PETG Green',            hex: '#2f9e53', id: 45079221436473 },
    { name: 'PETG Electric Blue',    hex: '#1d7fe0', id: 45079221469241 },
    { name: 'PETG Purple',           hex: '#7b4fb5', id: 45079221502009 },
    { name: 'PETG Dark Blue',        hex: '#23407f', id: 45079221534777 },
    { name: 'PETG Lime',             hex: '#a6cf3a', id: 45079221567545 },
    { name: 'PETG Dark Green',       hex: '#1e6b46', id: 45079221600313 },
    { name: 'PETG Magenta',          hex: '#d23590', id: 45079221633081 },
    { name: 'PETG Pink',             hex: '#ef9cc0', id: 45079221665849 },
    { name: 'PETG Dark Purple',      hex: '#462a6b', id: 45079221698617 },
    { name: 'PETG Army Brown',       hex: '#6f5b3e', id: 45588258095161 },
    { name: 'PETG Clear',            hex: '#e8ecef', id: 46279866023993 },
    { name: 'PETG Galaxy Black',     hex: '#23252e', id: 45588258553913 },
    { name: 'PETG Galaxy Dark Grey', hex: '#4a4e59', id: 45588259078201 },
    { name: 'PETG Galaxy Blue',      hex: '#2b4a8c', id: 45588259176505 },
    { name: 'PETG Galaxy Red',       hex: '#8c2430', id: 45588259504185 },
  ].map(f => ({ ...f, label: `Polymaker ${f.name}`, url: POLY_LINK('petg') })) },
  { brand: 'Elegoo', line: 'PLA / PETG', url: 'https://amzn.to/3QWCdV6', colors: [
    { name: 'PETG Black', label: 'Elegoo PETG Black', hex: '#232427', url: 'https://amzn.to/3QWCdV6', pick: true },
    // PLA Black is the Classic faceplate BODY default (Joey 2026-07-25)
    { name: 'PLA Black', label: 'Elegoo PLA Black', hex: '#1c1d20', url: 'https://amzn.to/4fqvv1O', pick: true,
      pickNote: ' · Joey’s black for faceplate bodies & shells' },
  ] },
  // Printed Solid (Jessie) PLA — real solid Basic/Premium colors with printedsolid.com
  // product links (hexes = the flat swatches from 3dfilamentprofiles.com/filaments/printed-solid;
  // Pure Magenta/Natural read pale — kept as-sourced). Mystery Orange is Joey's Handle orange.
  { brand: 'Printed Solid', line: 'PLA', url: 'https://www.printedsolid.com/collections/1-75mm-jessie', colors: [
    { name: 'Mystery Orange',   hex: '#F56233', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-mystery-orange', pick: true, pickNote: ' · Joey’s orange for the Handles' },
    { name: 'Blue Whale Grey',  hex: '#35608E', url: 'https://www.printedsolid.com/collections/filament/products/jessie-pla-1-75mm-x-1kg-blue-whale-grey' },
    { name: 'Purple Ice',       hex: '#C965EA', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-purple-ice' },
    { name: 'Red Ice',          hex: '#862E26', url: 'https://www.printedsolid.com/collections/jessie/products/jessie-pla-1-75mm-x-1kg-red-ice' },
    { name: 'White',            hex: '#EFEFEA', url: 'https://www.printedsolid.com/collections/jessie/products/jessie-pla-1-75mm-x-1kg-white' },
    { name: 'Black',            hex: '#2A242D', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-black' },
    { name: 'Natural',          hex: '#FFFFCC', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-natural' },
    { name: 'PS Red',           hex: '#EC2F26', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-ps-red' },
    { name: 'Safety Orange',    hex: '#F04000', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-safety-orange' },
    { name: 'Yellow Bird',      hex: '#FDC230', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-yellow-bird' },
    { name: 'Neon Green',       hex: '#B1DA00', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-neon-green' },
    { name: 'Bold Blue',        hex: '#0251A7', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-bold-blue' },
    { name: 'Blue Ice',         hex: '#201E8A', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-blue-ice' },
    { name: 'Blue Moon',        hex: '#022679', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-blue-moon' },
    { name: 'Deep Purple',      hex: '#2E073E', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-deep-purple' },
    { name: 'Purple Eater',     hex: '#8E4FB0', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-purple-eater' },
    { name: 'Pure Magenta',     hex: '#FFE0F8', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-pure-magenta' },
    { name: 'Elixir Aquamarine',hex: '#2E8FFF', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-aquamarine-1kg' },
    { name: 'Elixir Gold Rush', hex: '#F0C838', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-gold-rush-1kg' },
    { name: 'Elixir Nightshade',hex: '#501282', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-nightshade-1kg' },
    { name: 'Elixir Royal Ruby',hex: '#A91E16', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-royal-ruby-1kg' },
  ].map(f => ({ ...f, label: `Printed Solid ${f.name}` })) },
  // ERYONE Burnt Titanium — the REAL "holo blue" Joey prints Accent panels in
  // (the presets' _navy placeholder until 2026-08-07). One colour-shift blue,
  // Amazon listing → isPaidLink marks it automatically like every amzn link.
  { brand: 'ERYONE', line: 'Burnt Titanium PLA', url: 'https://amzn.to/4fTKtO9', colors: [
    { name: 'Burnt Titanium', label: 'ERYONE Burnt Titanium', hex: '#31517e', url: 'https://amzn.to/4fTKtO9', pick: true,
      pickNote: ' · Joey’s colour-shift blue for Accent panels' },
  ] },
];

export { FILAMENT_DB };
