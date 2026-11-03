# Source comparisons

All references below use Motion Twin's [pinned source revision](https://github.com/motion-twin/hammerfest/tree/fa8624307c8168fdec0c18d644509af933e4af7b/class/hammer). Tests verify the translated rules and hand-calculated steps. They do not establish frame-by-frame parity with a running Flash reference.

## Classic bombs

| Rule | Original source | Port |
| --- | --- | --- |
| Horizontal kick | `Data.mt`, `entity/Player.mt: kickBomb` | X = facing × 3.5, Y = −7.4; player walking speed is not added |
| Air drop | `entity/Player.mt: drop, airJump` | Kick immediately; boost player to at least −7 without slowing a stronger upward jump |
| Upward kick | `entity/Player.mt: upKickBomb` | Double existing X, use facing × 0.5 if its magnitude is ≤1.5; Y = −18 |
| Kick reach | `entity/PlayerController.mt`, `mode/GameMode.mt: getClose` | Inclusive radius 20 on the ground, 30 in the air |
| Repeat kicks | `entity/Player.mt: isRecentKick, update`, `entity/bomb/PlayerBomb.mt: onKick` | More than two ticks between kicks; one airborne kick; subsequent grounded kicks allowed |
| Rebounds | `entity/Mover.mt: onHitGround` | Kicked bombs queue 50% of landing speed upward for the next tick if ≥2; that tick skips gravity |
| Friction and walls | `entity/Physics.mt`, `entity/Bomb.mt` | X damping 0.93 on ordinary floors; stop against walls, no ordinary wall ricochet |
| Grounded explosion | `entity/Bomb.mt: bombGetClose`, `mode/GameMode.mt: getClose` | Inclusive 60 px radius; targets below the bomb must be within one 20 px tile vertically |

`tests/bombs.test.mjs` checks both isolated rules and their integration with player input and freezing. Existing tests cover the 45-tick fuse, bomb capacity and 160-tick freeze.

Remaining differences include the original stair-collision patch, up-kick unlock and input binding, special weapons/modifiers, collision stepping details, animation state timing and exact update order across all entities. The opening enemy AI and scoring remain provisional.

## Pickup placement

Items use the original slot's feet coordinate. Each exported sprite's visible bottom-center is its ground anchor, so transparent margins cannot shift the pickup sideways or into a platform. Pickups now use body physics; airborne source slots settle on a floor. Tests inspect actual atlas alpha pixels, settling in all ten rooms and collection scoring.

## Useful reference material

The supplied SWFs already provide extractable graphics and audio. The user has now supplied uncompressed XFL exports of `gfx`, `loader` and `sounds`; the [assessment](XFL-AUDIT.md) records their coverage and recovery results. These expose scenery/interface timelines and uncompressed source audio. The full character-animation source remains separate: the loader references `iceCubeAnim.fla`, while the compiled `_anims.swf` remains available. Recorded original-game input/position sequences are still needed for measured gameplay parity.
