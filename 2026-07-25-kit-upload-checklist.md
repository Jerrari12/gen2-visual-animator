# Starter-kit upload checklist — Printables → Thangs → MakerWorld

10 kit listings per platform. Parts are IDENTICAL across lengths within a tier —
only the `<L>` in the file names changes (115 / 165 / 185 / 240 / 270).
Quantities below are pulled from the kits' golden BOMs (source of truth).

---

## Per-listing routine (repeat per kit, per platform)

- [ ] Title: `GEN2 <L> Tabletop Kit 2W-2H` (or `3W-2H`)
- [ ] Upload the part files for the tier (lists below)
- [ ] Cover image: `viewer/builds/img/<id>.jpg` (the 3/4 render, collection-coloured)
- [ ] Extra image: `viewer/builds/img/card-<id>.jpg` (the 1600×700 share card)
- [ ] Description: paste the kit's viewer link **with the platform's `&from=`**
      (table below) — this is what makes the 3D guide's links default to the
      platform the visitor came from
- [ ] Description: note the ONLY purchase is the magnets (6× or 10× 10×2 mm),
      optional — the kit builds without them (push-fit, no closure)

---

## Tier A — 2W-2H (3 drawers · 39 prints · 6 magnets)

Layout: 2W-1H on top, two 1W-1H below.

**Collection-specific files (swap `<L>`):**
- [ ] ×2 `<L>-1W-1H_Case`
- [ ] ×1 `<L>-2W-1H_Case`
- [ ] ×2 `DecorDrawer_<L>-1W-1H`
- [ ] ×1 `DecorDrawer_<L>-2W-1H`
- [ ] ×1 `CL-<L>-2W` (Cover Lower)
- [ ] ×1 `CU-<L>-2W` (Cover Upper)
- [ ] ×1 `FR-L_<L>-2W` (Footrail Lower)
- [ ] ×1 `FR-U_<L>-2W` (Footrail Upper)

**Universal shared hardware (same files in every kit):**
- [ ] ×2 `Faceplate_ClassicDecor_1W-1H`
- [ ] ×1 `Faceplate_ClassicDecor_2W-1H`
- [ ] ×3 `QuickLock-L` · ×3 `QuickLock-R`
- [ ] ×4 `Drawer_Stoppers_L` · ×4 `Drawer_Stoppers_R`
- [ ] ×6 `MagnetClip_10x2mm`
- [ ] ×6 `Tabletop-Kit-Foot`

**Buy (not a file — description note):** 6× magnet 10×2 mm.

---

## Tier B — 3W-2H (5 drawers · 63 prints · 10 magnets)

Layout: 2W-1H + 1W-1H on top, three 1W-1H below (covers stagger brick-style).

**Collection-specific files (swap `<L>`):**
- [ ] ×4 `<L>-1W-1H_Case`
- [ ] ×1 `<L>-2W-1H_Case`
- [ ] ×4 `DecorDrawer_<L>-1W-1H`
- [ ] ×1 `DecorDrawer_<L>-2W-1H`
- [ ] ×1 `CL-<L>-1W` · ×1 `CL-<L>-2W` (Cover Lower)
- [ ] ×1 `CU-<L>-1W` · ×1 `CU-<L>-2W` (Cover Upper)
- [ ] ×1 `FR-L_<L>-1W` · ×1 `FR-L_<L>-2W` (Footrail Lower)
- [ ] ×1 `FR-U_<L>-1W` · ×1 `FR-U_<L>-2W` (Footrail Upper)

**Universal shared hardware:**
- [ ] ×4 `Faceplate_ClassicDecor_1W-1H`
- [ ] ×1 `Faceplate_ClassicDecor_2W-1H`
- [ ] ×5 `QuickLock-L` · ×5 `QuickLock-R`
- [ ] ×6 `Drawer_Stoppers_L` · ×6 `Drawer_Stoppers_R`
- [ ] ×10 `MagnetClip_10x2mm`
- [ ] ×8 `Tabletop-Kit-Foot`

**Buy (description note):** 10× magnet 10×2 mm.

---

## The 10 kits — links to paste per platform

Base link: `https://gen2build.jerrari3d.com/?build=<id>`
Append per platform: Printables `&from=printables` · Thangs `&from=thangs` · MakerWorld `&from=makerworld`

| Kit id | Title | Printables description link |
|---|---|---|
| 115-tabletop-2w2h | GEN2 115 Tabletop Kit 2W-2H | `…/?build=115-tabletop-2w2h&from=printables` |
| 115-tabletop-3w2h | GEN2 115 Tabletop Kit 3W-2H | `…/?build=115-tabletop-3w2h&from=printables` |
| 165-tabletop-2w2h | GEN2 165 Tabletop Kit 2W-2H | `…/?build=165-tabletop-2w2h&from=printables` |
| 165-tabletop-3w2h | GEN2 165 Tabletop Kit 3W-2H | `…/?build=165-tabletop-3w2h&from=printables` |
| 185-tabletop-2w2h | GEN2 185 Tabletop Kit 2W-2H | `…/?build=185-tabletop-2w2h&from=printables` |
| 185-tabletop-3w2h | GEN2 185 Tabletop Kit 3W-2H | `…/?build=185-tabletop-3w2h&from=printables` |
| 240-tabletop-2w2h | GEN2 240 Tabletop Kit 2W-2H | `…/?build=240-tabletop-2w2h&from=printables` |
| 240-tabletop-3w2h | GEN2 240 Tabletop Kit 3W-2H | `…/?build=240-tabletop-3w2h&from=printables` |
| 270-tabletop-2w2h | GEN2 270 Tabletop Kit 2W-2H | `…/?build=270-tabletop-2w2h&from=printables` |
| 270-tabletop-3w2h | GEN2 270 Tabletop Kit 3W-2H | `…/?build=270-tabletop-3w2h&from=printables` |

(Same 10 rows for Thangs and MakerWorld — only the `&from=` changes.)

---

## Reminders

- ⚠ **These links deploy-gate the ids**: the moment a `?build=` link is printed
  in a live description, that kit id is FROZEN forever. The viewer must be
  deployed (DNS + push) before the first listing goes live, or the link 404s.
- Zero required hardware: Classic faceplates print their grip in — say so, it's
  the headline. Magnets are the one optional buy.
- Stoppers + magnet clips are removable in the 3D guide (Build options) — the
  kit doubles as a demo of that.
- As each MakerWorld/Thangs kit page goes live, send me the model URL and I'll
  add it to the kit's link entry so the tools cross-link it.
