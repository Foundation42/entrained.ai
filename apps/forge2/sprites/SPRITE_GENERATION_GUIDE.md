# Sprite Sheet Generation with Gemini - Complete Guide

## Overview
Generate professional game sprite sheets by combining:
- **Reference structure** (LPC standard poses/animations)
- **Style transfer** (your character design)
- **Gemini AI** (generates each pose in your style)

## The Strategy

### 1. Reference Images (Structure)
Use LPC (Liberated Pixel Cup) sprites as structural references:
- **Walk cycle**: 4-9 frames showing complete walking motion
- **Attack**: 6-8 frames of attack animation
- **Idle**: 1-4 frames of standing/breathing
- **Run**: 8 frames of running motion
- **Cast**: 7 frames of spellcasting
- **Hurt**: 6 frames of taking damage

### 2. Style Images (Your Character)
Provide examples of your character design:
- Character portrait
- Color palette
- Art style reference
- Any existing character art

### 3. Generation Process
For each frame in the reference:
```
Prompt: "Create a [style description] character in this exact pose and perspective. 
The character should match this style: [style reference]. 
The pose and body position should exactly match this reference: [reference pose]."
```

## Step-by-Step Workflow

### Step 1: Get Reference Sprite Sheets

Download from OpenGameArt.org (CC-BY-SA 3.0 / GPL 3.0):
- LPC Character Bases: https://opengameart.org/content/lpc-character-bases
- 4 Frame Walk Cycles: https://opengameart.org/content/4-frame-walk-cycles
- LPC Collection: https://opengameart.org/content/lpc-collection

**Key reference sheets to use:**
- `walkcycle_base.png` - Standard 4-direction walk (9 frames per direction)
- `slash_base.png` - Attack animation (6 frames, 4 directions)
- `cast_base.png` - Magic casting (7 frames, 4 directions)
- `shoot_base.png` - Bow/gun shooting (13 frames, 4 directions)
- `thrust_base.png` - Spear thrusting (8 frames, 4 directions)
- `hurt_base.png` - Taking damage (6 frames, 1 direction)

### Step 2: Extract Individual Frames

For each animation type, extract individual frames:
```bash
# Example: Extract walk cycle frames
# Frame size is typically 64x64 pixels
# Layout: 9 frames across, 4 directions down (N/W/S/E)
```

Frame positions in standard LPC sheet:
- **Row 0** (Up/North): Columns 0-8
- **Row 1** (Left/West): Columns 0-8  
- **Row 2** (Down/South): Columns 0-8
- **Row 3** (Right/East): Columns 0-8

### Step 3: Craft Prompts for Gemini

#### Template 1: Simple Walk Cycle
```
Style: [pixel art / hand-drawn / anime / realistic]
Character: [young warrior / robot / cat / your description]
Palette: [vibrant / muted / neon / describe colors]

Generate a sprite showing this character in the exact pose shown in the reference image.
The character should be facing [north/south/east/west].
This is frame [X] of [Y] in a walking animation.
Maintain the exact body position, angle, and proportions from the reference.
Apply the described style while preserving the pose structure.
```

#### Template 2: Attack Animation
```
Style: [describe art style]
Character: [describe character]
Weapon: [sword / axe / staff / fists]

Generate frame [X] of an attack animation showing this character in the exact pose from the reference.
The character is mid-swing with the weapon.
Direction: [north/south/east/west]
Preserve the exact body mechanics and weapon position from the reference.
Style should match: [style description]
```

#### Template 3: Multi-Frame Generation
```
Create a complete 4-frame walk cycle for a [character description] in [style].

Reference structure: The cycle should match the timing and poses of this walk cycle [attach reference].

Style: [detailed style description]

Generate 4 frames showing:
1. Contact pose (left foot forward, grounded)
2. Passing pose (body raised, transitioning)
3. Contact pose (right foot forward, grounded)
4. Passing pose (body raised, transitioning back)

Each frame should be [64x64 / 32x32 / your size] pixels.
Maintain consistent character design across all frames.
```

## Gemini-Specific Tips

### Image Generation Parameters
```javascript
{
  model: "gemini-pro-vision", // or latest Gemini model
  prompt: "[your prompt]",
  image: {
    reference: "[base64 reference image]",
    style: "[base64 style image]"
  },
  parameters: {
    width: 64,  // Standard sprite size
    height: 64,
    style: "pixel-art", // or "illustration", "anime", etc.
    transparent: true // For sprite sheets
  }
}
```

### Prompt Structure for Best Results
1. **Be specific about the pose**: "standing with left leg forward, weight on back leg"
2. **Reference the style explicitly**: "in the style of [attached image]"
3. **Mention frame number**: "frame 3 of 8 in a walk cycle"
4. **Specify direction**: "facing south (toward camera)" 
5. **Note body mechanics**: "head bobbing up, arms swinging naturally"

## Automation Script Structure

```javascript
async function generateSpriteSheet(characterStyle, animationType) {
  // 1. Load reference sheet for animation type
  const reference = await loadReference(animationType);
  
  // 2. Extract individual frames
  const frames = extractFrames(reference);
  
  // 3. Generate each frame with style transfer
  const generated = [];
  for (let i = 0; i < frames.length; i++) {
    const prompt = buildPrompt(characterStyle, animationType, i, frames.length);
    const result = await callGemini(prompt, frames[i], characterStyle.image);
    generated.push(result);
  }
  
  // 4. Assemble into sprite sheet
  const spriteSheet = assembleSheet(generated);
  
  return spriteSheet;
}
```

## Common Sprite Sheet Layouts

### Standard LPC (64x64 per frame)
```
Walk:  832x256 (13 cols × 4 rows)
Slash: 384x256 (6 cols × 4 rows)
Cast:  448x256 (7 cols × 4 rows)
Shoot: 832x256 (13 cols × 4 rows)
```

### Compact (32x32 per frame)
```
Walk:  128x128 (4 cols × 4 rows)
Attack: 192x128 (6 cols × 4 rows)
```

### Platformer (facing left/right only)
```
Idle:  64x64 (1 frame or 4-frame breathing)
Walk:  256x128 (8 frames × 2 directions)
Jump:  192x128 (6 frames × 2 directions)
Attack: 384x128 (12 frames × 2 directions)
```

## Quality Checklist

- [ ] All frames are same dimensions
- [ ] Character size consistent across frames
- [ ] Pose matches reference structure
- [ ] Style consistent across all frames
- [ ] Transparency properly handled
- [ ] Animation timing feels natural
- [ ] No jittering when looped
- [ ] Colors match character palette

## Attribution

When using LPC references, you must credit:
```
Based on LPC (Liberated Pixel Cup) base sprites
Original sprites by: [check specific asset credits]
Licensed under: CC-BY-SA 3.0 / GPL 3.0
Modified/generated with AI for: [your project]
```

## Next Steps

1. Choose your animation type (walk, attack, etc.)
2. Download appropriate reference sheet
3. Prepare your character style guide
4. Generate prompts using templates above
5. Test with single frame first
6. Generate full animation
7. Assemble sprite sheet
8. Test in-game/preview tool

## Resources

- OpenGameArt.org: https://opengameart.org
- LPC Collection: https://opengameart.org/content/lpc-collection
- Universal LPC Generator: https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/
- Sprite sheet assemblers: TexturePacker, ShoeBox, custom scripts

---

Ready to generate some sprites! 🎮
