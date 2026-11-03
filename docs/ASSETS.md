# Original assets and reproducible conversion

Upstream: [motion-twin/hammerfest](https://github.com/motion-twin/hammerfest) at commit `fa8624307c8168fdec0c18d644509af933e4af7b`.

- `public/assets/original/`: unmodified upstream `images/` files. Only the current room's required background and three opening tile skins are loaded at startup.
- `public/assets/audio/`: original MP3 effects extracted from `_sounds.swf`, plus `sfx/music.mp3`.
- `public/assets/atlas.png` and `atlas.json`: 345 rendered frames packed into one 1024 × 1629 RGBA atlas. Source: `_anims.swf`.
- `public/assets/data/adventure.json`: all 107 adventure records, including introductions and other scripted records.
- `public/assets/data/tutorial.json`: all 24 tutorial records; archived for future implementation.
- `vendor/hammerfest/`: original encoded level inputs and a small set of gameplay source files used as references. The original license is at the repository root.
- `public/assets/provenance.json`: source commit and SHA-256 checksums of inputs and generated assets.

## Levels

Despite their `.xml` extension, upstream level files contain colon-separated values serialized with Motion Twin's `PersistCodec` and `BitCodec`. `scripts/persist-codec.mjs` implements a decoder for that format, using the published [PersistCodec](https://github.com/motion-twin/mtypes/blob/master/lib/PersistCodec.mt) and [BitCodec](https://github.com/motion-twin/mtypes/blob/master/lib/BitCodec.mt) as format references. It supports integer/float/string values, cached object keys and sparse arrays. Malformed input fails explicitly.

```sh
npm run import:levels
```

The `$script` fields are preserved verbatim as inert strings. The runtime currently consumes records 2–11 and only accepts its three supported enemy IDs.

## Animation and sound export

Generated assets are committed. **Normal development does not require the exporter.** To rebuild, obtain a source checkout at the pinned commit, Java 21 and [JPEXS Free Flash Decompiler 26.4.0](https://github.com/jindrapetrik/jpexs-decompiler/releases/tag/version26.4.0). JPEXS and Java are build tools and are not distributed with the game.

```sh
git clone https://github.com/motion-twin/hammerfest.git .cache/hammerfest
git -C .cache/hammerfest checkout fa8624307c8168fdec0c18d644509af933e4af7b
python3 scripts/extract-assets.py .cache/hammerfest /absolute/path/to/java /absolute/path/to/ffdec.jar
npm run import:levels
npm run check
```

The exporter uses Python's standard library to read SWF tags, normalize the default Igor appearance in a **temporary copy**, export with JPEXS, decode PNGs and pack an atlas. Player head, skin and weapon-selection timelines are fixed to their default frame because a static exporter cannot execute the Flash state-selection scripts. Conditional carrot/chourou overlays are hidden. Other character variants will need their own explicit export configuration. The original SWF remains untouched.

Actor frames retain the origin reported by JPEXS SVG output. Rendering applies the original wrapper scales: 0.7 for Igor/cherries/apples, 1.0 for oranges/bombs. Borders and backgrounds come from upstream PNG/JPEG assets. Decorative ice particles, the web interface and room titles are new additions.

Pickup frames use the bottom-center of their nontransparent pixels as their ground anchor. JPEXS exports them on a shared canvas with uneven transparent margins, so its canvas center is not a usable ground position. Pickups spawn at the original slot's feet coordinate and fall onto platforms using the same physics as other bodies; grounded pickups do not bob through the floor.

Original art/audio and the adapted output retain the upstream CC BY-NC-SA 4.0 notice. No generative images or replacement character artwork are used.

## Supplied XFL exports

The user supplied uncompressed `gfx`, `loader` and `sounds` authoring exports. See the [XFL assessment](XFL-AUDIT.md) for verified coverage, recovered audio and the distinction between scenery assets and the gameplay animation library. `scripts/audit-xfl.py` inventories these documents and can recover embedded PCM sounds as WAVs plus embedded JPEGs without changing their payloads. These inputs and review exports are not required at runtime.
