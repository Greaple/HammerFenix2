# Runtime and porting plan

## Design decisions

TypeScript and Vite build a static browser application. The game has **zero runtime npm dependencies**. Native Canvas 2D handles the original small 400 × 500 playfield with a cached background, a single sprite atlas and bounded transient effects. This keeps deployment simple and avoids coupling the port to an engine's collision model. The renderer is separate from the simulation; a WebGL renderer can replace it if measured scene complexity justifies one.

The source defines `SECOND = 32`. `FixedClock` accumulates elapsed time and executes whole 1/32-second simulation ticks. Rendering interpolates previous/current positions independently. Hidden or unfocused pages pause; accumulated catch-up is capped at 250 ms. Enemy randomness comes from an explicit seed. Rendering never consumes that random sequence.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/game/world.ts` | Pure simulation, room lifecycle, actors, collisions, score and gameplay events |
| `src/game/physics.ts` | Source constants, swept platform movement and fixed simulation clock |
| `src/game/bombs.ts` | Classic bomb kicks, airborne restrictions, floor rebounds and blast targeting |
| `src/game/renderer.ts` | Canvas drawing, atlas frames, cached room backgrounds and interpolation |
| `src/game/input.ts` | Keyboard, pointer/touch and standard gamepad normalization |
| `src/game/audio.ts` | Gesture-unlocked Web Audio effects and music; failures never interrupt the game |
| `src/game/storage.ts` | Validated, versioned browser-local records with failure fallback |
| `src/main.ts` | App lifecycle, UI, loading, pause and focus management |
| `scripts/` | Offline conversion of original levels and Flash assets |

The input model consumes a queued bomb press once; continuous movement is sampled per tick. Simulation never reads the DOM or wall-clock time. Physics coordinates represent an actor's horizontal center and feet. Solid side checks use its center at `feet - 10`; downward motion collides with platform tops. Upward motion passes through platforms.

## Source correspondence

| Parameter | Upstream | Current value |
| --- | --- | --- |
| Simulation rate | `Data.SECOND` | 32 Hz |
| Playfield | `GAME_WIDTH`, `GAME_HEIGHT` | 400 × 500 |
| Tile size | `CASE_WIDTH`, `CASE_HEIGHT` | 20 × 20 |
| Player speed | `PLAYER_SPEED` | 4.3 px/cycle |
| Jump impulse | `PLAYER_JUMP` | 18.7 px/cycle |
| Ascending gravity | `GRAVITY` | 1.0 |
| Descending gravity | `FALL_SPEED` × player factor | 0.9 × 1.1 |
| Air damping | `FRICTION_X`, `FRICTION_Y` | 0.93, 0.86 |
| Classic bomb | `entity/bomb/player/Classic.mt` | 45 cycles, power 30 |
| Blast radius | `entity/Bomb.mt` | 60 px |
| Freeze time | `FREEZE_DURATION` | 160 cycles |
| Horizontal bomb kick | `PLAYER_HKICK_X`, `PLAYER_HKICK_Y` | 3.5 horizontal, −7.4 vertical |
| Upward bomb kick | `PLAYER_VKICK` | −18 vertical, preserves/doubles horizontal motion |
| Bomb rebound | `Mover.bounceFactor` | 0.5, only when rebound speed is at least 2 |

These constants preserve a useful baseline, not a claim of exact behavioral parity. Upstream update ordering, collision corner cases and AI still require recorded-reference comparisons.

## Next milestones, in order

1. **Reference replay harness.** Record original Flash input/position sequences; compare jumps, ledge behavior, bomb kicks, blast falloff and hit timing. Add golden traces before changing the model.
2. **Exact opening gameplay.** Port the walker/jumper/shooter decision grid, original death/ice rules, scoring tables, item selection and hurry-up behavior.
3. **Scripted content.** Implement a typed interpreter for the original level-script vocabulary, with explicit commands and tests. Restore exterior/intro scenes, scripted bonuses, doors and portals. Do not evaluate strings as JavaScript.
4. **Full adventure.** Add remaining enemy families, weapons, score/special items, quests, persistent unlocks, dimensions and bosses, with per-room support metadata.
5. **Release verification.** Compare screenshots and animation timing against reference captures. Exercise keyboard/touch/gamepad on real Chrome, Firefox and Safari devices; profile worst-case scenes. Add offline caching after asset versioning is stable.

## Verification in this milestone

The automated suite exercises the original decoder, data/atlas integrity, high-speed landing, one-way platforms, jump reach, screen borders, fuse/capacity, blast radius, freeze impulse, chain collision, pause, wrap/exit, death/respawn, completion, replay determinism and storage failures. The first room was also played through in the local browser, including scoring and an exit into room two. Desktop (1440 px) and narrow (390 px) layouts were inspected. Real hardware gamepad and cross-browser testing remain outstanding.
