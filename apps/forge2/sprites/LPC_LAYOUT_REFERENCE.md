# LPC Sprite Sheet Layout Reference

## Standard LPC Universal Layout

Frame size: **64x64 pixels**

```
╔═══════════════════════════════════════════════════════════╗
║  LPC UNIVERSAL SPRITE SHEET LAYOUT (832 × 1344 pixels)   ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  Row 0: SPELLCAST (7 frames × 4 directions)               ║
║  ├─ UP    (0-6):   Casting facing away                    ║
║  ├─ LEFT  (0-6):   Casting facing left                    ║
║  ├─ DOWN  (0-6):   Casting facing toward camera           ║
║  └─ RIGHT (0-6):   Casting facing right                   ║
║                                                            ║
║  Row 4: THRUST (8 frames × 4 directions)                  ║
║  ├─ UP    (0-7):   Thrusting spear/staff upward           ║
║  ├─ LEFT  (0-7):   Thrusting left                         ║
║  ├─ DOWN  (0-7):   Thrusting downward/forward            ║
║  └─ RIGHT (0-7):   Thrusting right                        ║
║                                                            ║
║  Row 8: WALK (9 frames × 4 directions)                    ║
║  ├─ UP    (0-8):   Walking away from camera               ║
║  ├─ LEFT  (0-8):   Walking left                           ║
║  ├─ DOWN  (0-8):   Walking toward camera                  ║
║  └─ RIGHT (0-8):   Walking right                          ║
║                                                            ║
║  Row 12: SLASH (6 frames × 4 directions)                  ║
║  ├─ UP    (0-5):   Overhead slash upward                  ║
║  ├─ LEFT  (0-5):   Slash left                             ║
║  ├─ DOWN  (0-5):   Slash downward                         ║
║  └─ RIGHT (0-5):   Slash right                            ║
║                                                            ║
║  Row 16: SHOOT (13 frames × 4 directions)                 ║
║  ├─ UP    (0-12):  Shooting bow/gun upward                ║
║  ├─ LEFT  (0-12):  Shooting left                          ║
║  ├─ DOWN  (0-12):  Shooting downward/forward             ║
║  └─ RIGHT (0-12):  Shooting right                         ║
║                                                            ║
║  Row 20: HURT (6 frames, SOUTH only)                      ║
║  └─ DOWN  (0-5):   Taking damage facing camera            ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

## Quick Reference by Animation

### WALK CYCLE (9 frames)
```
Frame 0: Standing/Idle
Frame 1: Left foot forward, beginning stride
Frame 2: Left foot extended, weight shifting
Frame 3: Left contact, body over foot
Frame 4: Right leg passing, body highest
Frame 5: Right foot extended
Frame 6: Right contact, body over foot  
Frame 7: Left leg passing, body highest
Frame 8: Return to standing
```

**Pixel positions in sheet:**
- Row 8 (UP): Y=512-575
- Row 9 (LEFT): Y=576-639
- Row 10 (DOWN): Y=640-703
- Row 11 (RIGHT): Y=704-767

Each frame: X = frameNumber × 64

### SLASH/ATTACK (6 frames)
```
Frame 0: Weapon raised, windup
Frame 1: Weapon at apex, body coiled
Frame 2: Beginning swing, rotating
Frame 3: Mid-swing, maximum velocity
Frame 4: Impact position, extended
Frame 5: Recovery, returning
```

**Pixel positions in sheet:**
- Row 12 (UP): Y=768-831
- Row 13 (LEFT): Y=832-895
- Row 14 (DOWN): Y=896-959
- Row 15 (RIGHT): Y=960-1023

### SPELLCAST (7 frames)
```
Frame 0: Hands together, gathering
Frame 1: Hands separating, building
Frame 2: Arms rising, magic forming
Frame 3: Arms extended, spell peak
Frame 4: Releasing spell
Frame 5: Spell released
Frame 6: Recovery
```

**Pixel positions in sheet:**
- Row 0 (UP): Y=0-63
- Row 1 (LEFT): Y=64-127
- Row 2 (DOWN): Y=128-191
- Row 3 (RIGHT): Y=192-255

### THRUST (8 frames)
```
Frame 0: Weapon ready, coiled
Frame 1: Beginning thrust
Frame 2: Extending forward
Frame 3: Full extension
Frame 4: Holding thrust
Frame 5: Pulling back
Frame 6: Retracted
Frame 7: Return to ready
```

**Pixel positions in sheet:**
- Row 4 (UP): Y=256-319
- Row 5 (LEFT): Y=320-383
- Row 6 (DOWN): Y=384-447
- Row 7 (RIGHT): Y=448-511

### SHOOT/BOW (13 frames)
```
Frame 0: Ready stance
Frame 1-3: Drawing weapon
Frame 4-6: Aiming
Frame 7-8: Hold/release
Frame 9-10: Recoil
Frame 11-12: Recovery
```

**Pixel positions in sheet:**
- Row 16 (UP): Y=1024-1087
- Row 17 (LEFT): Y=1088-1151
- Row 18 (DOWN): Y=1152-1215
- Row 19 (RIGHT): Y=1216-1279

### HURT (6 frames, 1 direction)
```
Frame 0: Impact, jerking
Frame 1: Reeling back
Frame 2: Maximum recoil
Frame 3: Beginning recovery
Frame 4: Steadying
Frame 5: Return to neutral
```

**Pixel positions in sheet:**
- Row 20 (DOWN only): Y=1280-1343

## Compact 4-Frame Walk (Alternative)

For simpler games, 4-frame walk cycle:

```
Frame 0: Left foot forward (contact)
Frame 1: Both feet together (passing)
Frame 2: Right foot forward (contact)
Frame 3: Both feet together (passing)
```

Dimensions: **256 × 256** (4 frames × 4 directions)

## Platform/Side-Scroller Layout

For 2D platformers (left/right only):

```
╔═══════════════════════════════════════╗
║  PLATFORMER LAYOUT (variable size)    ║
╠═══════════════════════════════════════╣
║  Row 0: IDLE-LEFT  (1-4 frames)       ║
║  Row 1: IDLE-RIGHT (1-4 frames)       ║
║  Row 2: WALK-LEFT  (4-8 frames)       ║
║  Row 3: WALK-RIGHT (4-8 frames)       ║
║  Row 4: JUMP-LEFT  (3-6 frames)       ║
║  Row 5: JUMP-RIGHT (3-6 frames)       ║
║  Row 6: ATTACK-LEFT (4-8 frames)      ║
║  Row 7: ATTACK-RIGHT (4-8 frames)     ║
╚═══════════════════════════════════════╝
```

## Extraction Examples

### Extract single frame:
```javascript
// Frame 3 of DOWN walk cycle
const x = 3 * 64;      // Column 3
const y = 10 * 64;     // Row 10 (DOWN direction)
const width = 64;
const height = 64;
// Extract region: (192, 640, 64, 64)
```

### Extract entire animation:
```javascript
// All SLASH-DOWN frames (row 14)
for (let i = 0; i < 6; i++) {
  const x = i * 64;
  const y = 14 * 64;  // Row 14
  // Extract frame: (x, 896, 64, 64)
}
```

## Direction Conventions

**UP / NORTH**: Character facing away from camera
- Used for walking away, attacking upward
- Back of head/body visible

**DOWN / SOUTH**: Character facing toward camera
- Used for walking toward, attacking forward
- Face visible (most expressive)

**LEFT / WEST**: Character facing left
- Profile view, left side visible
- Usually includes weapon on visible side

**RIGHT / EAST**: Character facing right
- Profile view, right side visible
- Mirror of left (sometimes)

## Common Sizes

| Size | Use Case | Examples |
|------|----------|----------|
| 16×16 | Tiny, NES-style | Zelda 1, Pokemon Gen 1 |
| 32×32 | Small, SNES-style | Chrono Trigger, FF6 |
| 48×48 | Medium detail | Stardew Valley |
| 64×64 | LPC Standard | Most LPC assets |
| 128×128 | High detail | Modern indie |

## Assembly Tools

**Manual Assembly:**
- GIMP: Layer each frame precisely
- Photoshop: Use artboards or grid
- Aseprite: Native sprite sheet support

**Automated Tools:**
- TexturePacker (commercial)
- ShoeBox (free)
- Custom scripts (ImageMagick, Canvas, Sharp)

## Testing Your Sheet

1. **Load in sprite viewer:**
   - Set frame size (64×64)
   - Set columns (animation frame count)
   - Play at 8-12 FPS

2. **Check for issues:**
   - ✓ Smooth motion (no jitter)
   - ✓ Consistent size across frames
   - ✓ Proper looping
   - ✓ Centered in frames
   - ✓ No clipping/truncation

3. **Game engine import:**
   - Unity: Sprite Editor → Grid
   - Godot: Frames parameter
   - Phaser: Frame width/height
   - Custom: Manual frame parsing

---

**Pro Tip**: Always start with the DOWN/SOUTH direction walk cycle. It's the most visible and sets the standard for the character's appearance.

---

Need help extracting frames or assembling sheets? Let me know! 🎮
