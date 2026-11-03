# Assessment of the supplied XFL exports

The three exports are readable and useful as offline source assets. All **212 listed symbol files** and **219 embedded media payloads** are present, and all explicit symbol/bitmap/sound references resolve within their respective documents. This checks the static library graph; it does not validate dynamic ActionScript behavior or font appearance.

The original export folders remain untouched. The [machine-readable inventory](data/xfl-audit.json) records hashes, library names, frame spans, layers, tween types, matrix counts and media formats. It excludes workstation paths and publish settings. No game behavior or shipped assets have changed in this assessment.

## What each export adds

| Export | Verified contents | Use for HammerFenix |
| --- | --- | --- |
| `gfx` | 199 symbols, 197 bitmaps, 552 vector shapes, 957 keyframes across layers, 81 exported symbol identifiers | Original scenery, doors, portals, tiles, interface and visual effects; readable nesting and transforms for placement |
| `loader` | 13 symbols, one bitmap, 96 vector shapes, 132 keyframes across layers | Original loading screen and a small set of Igor animations with editable component layers |
| `sounds` | 21 embedded PCM sound effects, with original sound identifiers and sample metadata | Recover uncompressed source audio without the SWF's MP3 encoding step |

Examples now directly inspectable include `tile`, `hammer_bg`, `$dimDoor`, `hurryUp`, `levelPopUp`, `hammer_fx_perfect` and `hammer_interf_extend`. The tile-skin and tile-end timelines each span 63 frames. These are useful for mapping skin variants; they are not 63 gameplay levels.

The loader's `bouli` walk spans **14 frames**, and `bouli stand` spans **28 frames**. Both match the frame counts in our current Igor atlas. This independently confirms those two extracted timeline lengths, but does not prove pose or playback parity.

## Audio recovery verified

All 21 sounds were recovered as WAV files. Their sample payloads match the embedded `.dat` files byte for byte, with lengths checked against the declared sample count, channel count and bit depth.

**17 effects are 44,100 Hz, 16-bit stereo** in XFL. The corresponding `DefineSound` records in the original `_sounds.swf` are MP3 at **22,050 Hz mono**. The other four effects are lower-rate mono source recordings. This provides a higher-quality source for future browser audio builds; the currently shipped MP3s have not been replaced.

As a separate format check, macOS `afinfo` recognizes the recovered jump sound as a valid stereo PCM WAV at 44,100 Hz with 10,048 sample frames. The extracted MP3 is recognized as mono at 22,050 Hz. Its reported container duration differs from the source sample duration, so container duration alone is not used as a fidelity metric.

## Bitmap recovery

Fifteen `gfx` media payloads are already JPEG files and were copied out without recompression. The remaining **183 bitmap payloads** across `gfx` and `loader` use Animate's internal bitmap format; they are present, but this audit does not decode that format. Existing browser-ready assets remain available in `public/assets/original/`.

The recovered first cavern background was opened alongside the existing background to confirm the artwork is recognizable. The JPEG files have different hashes; no claim of pixel equivalence or improved image quality is made from file sizes alone.

## Limits and the most useful missing source

`gfx` publishes `_gfx.swf`, the scenery/interface library. It does **not** supply the full gameplay symbol library: identifiers such as `hammer_player`, `hammer_bad_cerise`, `hammer_bomb_classic` and `hammer_item_score` are absent from these XFL exports.

The loader's walking Igor symbol records `iceCubeAnim.fla` as its source document. Some `gfx` symbols also reference that document. If an original copy is available, an XFL export of **`iceCubeAnim.fla`** would be the next useful input for full character-animation work. The compiled `_anims.swf` is already available and remains usable, so this is not a blocker.

The documents report an authoring frame rate of 40 fps. This must not automatically replace the game's `Data.SECOND = 32` simulation convention; animation playback and simulation timing need separate reference checks. The exports also contain 65 ActionScript blocks. The audit counts them as data and never executes them.

Modern Animate publish settings target a different Flash/ActionScript version than the old game. Use the exported library data as source material and retain the original code/SWFs as behavior references. Font mappings and tween rendering still need visual comparison before replacing existing art.

## Reproduce the assessment

Python's standard library is sufficient. The conversion is optional and is not required to run or build the game.

```sh
python3 scripts/audit-xfl.py /path/to/gfx /path/to/loader /path/to/sounds \
  --report docs/data/xfl-audit.json \
  --extract-to .cache/xfl-audit
```

Recovery outputs are stored under `.cache/xfl-audit/<document>/`. These are local review files, excluded from Git and the production bundle. The supplied XFL directories are not copied into the repository. The script reads only internal document references and does not follow external source paths or run publishing commands.

Recommended integration order: retain recovered WAVs as audio masters; use the scenery/interface timelines to restore original effects and placement; continue using the SWF atlas for full gameplay characters while checking it against any additional animation source.
