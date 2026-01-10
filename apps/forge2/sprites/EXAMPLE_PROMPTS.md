# Ready-to-Use Gemini Prompts for Sprite Generation

## Setup Instructions

1. **Prepare Your Inputs:**
   - Reference image: LPC sprite showing the pose you want
   - Style image: Your character design/art style example
   
2. **Use with Gemini:**
   - Upload both images
   - Use the prompts below (customize the bracketed sections)
   - Generate at 64x64 or your desired sprite size

---

## Walk Cycle Prompts

### Frame 1: Left Foot Forward Contact
```
Create a 64x64 pixel sprite of a [young warrior with blue armor and red cape] in pixel art style.

This is frame 1 of 9 in a walking animation, facing south (toward camera).

Pose: Left leg extended forward with foot planted on ground. Right leg behind. Body weight centered over front foot. Arms naturally swinging - right arm forward (opposite of legs), left arm back. Body at normal standing height.

Style: [Vibrant pixel art with clean outlines, limited color palette of blues, reds, and gold accents]

Technical requirements:
- Exactly 64x64 pixels
- Transparent background
- Character centered in frame
- Match the exact pose and body position from the reference image
- Clean pixel art style with no anti-aliasing
```

### Frame 2: Passing Position - Left Side
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 2 of 9 in walking animation, facing south.

Pose: Left leg fully forward and planted. Right leg passing by, knee bent, foot off ground. Body raised slightly higher than contact pose. Right arm forward, left arm back (starting to swing). Torso leaning slightly forward with motion.

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Match reference pose exactly
- Maintain consistent character design
- [pixel art / hand-drawn / your style] aesthetic
```

### Frame 3: Maximum Height - Mid-Stride
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 3 of 9 in walking animation, facing south.

Pose: Both legs bent, body at maximum height in walk cycle. Left foot planted but heel starting to lift. Right leg swinging through, thigh parallel to ground. Arms mid-swing, nearly aligned with body. Head at highest point, slight upward tilt.

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Exact pose from reference image
- Consistent with previous frames
```

---

## Attack/Slash Cycle Prompts

### Frame 1: Windup
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 1 of 6 in sword slash animation, facing south.

Pose: Weapon (sword/axe) raised high above and behind head. Both hands gripping weapon. Body twisted to the side (right), creating tension. Weight on back foot. Legs stable, knees slightly bent. Face showing focus/intensity.

Weapon: [Silver longsword / battle axe / your weapon]

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Match reference pose precisely
- Show weapon clearly
- Dynamic, action-ready stance
```

### Frame 3: Mid-Swing
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 3 of 6 in sword slash animation, facing south.

Pose: Weapon at maximum velocity, arcing down toward target. Arms extended, weapon forming diagonal line across frame. Body rotating powerfully, weight transferring to front foot. Cape/hair showing motion blur. Strong diagonal composition showing force.

Weapon: [describe weapon]

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Dynamic motion lines (if style appropriate)
- Weapon clearly visible mid-arc
- Body mechanics showing power
```

### Frame 5: Impact
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 5 of 6 in sword slash animation, facing south.

Pose: Weapon at lowest point, impact complete. Arms fully extended downward. Body leaning forward, fully committed to strike. Weight on front foot, back foot potentially lifted. Face intense, mouth open (battle cry). Possible impact effect/spark at weapon tip.

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Show moment of impact
- Maximum extension
- Convey power and finality
```

---

## Spellcasting Prompts

### Frame 1: Gathering Energy
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 1 of 7 in spellcasting animation, facing south.

Pose: Hands together at chest level, palms touching. Head bowed slightly, concentrating. Legs shoulder-width apart, stable stance. Small glow beginning to form between palms (magical energy). Body centered and balanced.

Magic effect: [Blue ethereal glow / Purple flames / Green sparkles]

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Subtle magical effect beginning
- Focused, concentrated pose
- Mystical atmosphere
```

### Frame 4: Peak - Releasing Spell
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 4 of 7 in spellcasting animation, facing south.

Pose: Arms extended forward, hands splayed open. Magical energy sphere/bolt visible between hands or leaving them. Body leaning back slightly from force of spell. Hair/cape blown back by magical wind. Face determined, eyes possibly glowing. Bright magical effect at peak.

Magic effect: [Describe your magic style]

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Prominent magical effect
- Dynamic pose showing power
- Match reference structure
```

---

## Hurt/Damage Taken Prompts

```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame [X] of 6 in hurt/damage animation.

Pose: Body recoiling from impact. Torso bent backward, head snapped to side. One arm clutching wound/impact site, other arm thrown back. Legs unstable, possibly stumbling. Face showing pain - eyes squeezed shut or wide, mouth open. Weapon dropped or barely held.

Effect: Small impact spark/flash at point of contact (optional)

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Convey genuine impact and pain
- Body language showing vulnerability
- Match reference pose mechanics
```

---

## Running Cycle Prompts

### Frame 1: Full Extension
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame 1 of 8 in running animation, facing right (profile view).

Pose: Left leg fully extended behind (pushing off), right leg extended forward. Both feet off ground (flight phase). Arms in running motion - right arm forward (bent 90°), left arm back. Body leaning forward aggressively. Head forward, eyes focused ahead. Cape/hair streaming behind.

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Dynamic running pose
- Both feet airborne
- Motion implied through pose
- Higher energy than walk cycle
```

---

## Idle/Breathing Animation Prompts

```
Create a 64x64 pixel sprite of a [character description] in [art style].

Frame [X] of 4 in idle breathing animation, facing south.

Pose: Standing neutral position. Shoulders rising/falling with breath (different height for each frame). Arms at sides, relaxed. One leg slightly more weighted than other (natural stance). Head upright, expression calm/alert. Subtle weight shift (if frame 2 or 4).

Details: 
- Frame 1: Exhale (shoulders down)
- Frame 2: Inhale beginning (shoulders rising)
- Frame 3: Full inhale (shoulders up)
- Frame 4: Exhale beginning (shoulders lowering)

Style: [your style description]

Requirements:
- 64x64 pixels, transparent background
- Subtle, natural movement
- Maintain centered position
- Peaceful, ready stance
```

---

## Jump Animation Prompts

### Takeoff
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Jump takeoff pose, facing right.

Pose: Legs bent, coiling down. Arms pulled back and down. Body compressed like a spring. Feet still on ground but toes/foreground visible. Face determined, preparing to launch. Weight centered.

Style: [your style description]

Requirements: 64x64 pixels, transparent background
```

### Airborne Peak
```
Create a 64x64 pixel sprite of a [character description] in [art style].

Jump peak pose, facing right.

Pose: Body fully extended upward. Arms raised overhead. Legs straight or slightly bent. Highest point of arc. Cape/hair at maximum upward float. Expression triumphant or focused. Maximum height visible.

Style: [your style description]

Requirements: 64x64 pixels, transparent background
```

---

## Tips for Best Results

### Character Consistency
- Save your first generated frame as the style reference for all subsequent frames
- Mention "maintain consistent character design with previous frames" in every prompt
- Use the same color palette description across all prompts

### Pose Accuracy
- Always attach the LPC reference image showing the exact pose
- Use specific body mechanics language (weight distribution, joint angles)
- Describe the action phase (windup, execution, followthrough)

### Style Transfer
- Attach a style example image with each prompt
- Use consistent style descriptors: "vibrant pixel art", "hand-drawn anime", etc.
- Mention specific artists or games if helpful: "Celeste-style pixel art"

### Technical Quality
- Always specify exact dimensions (64x64, 32x32, etc.)
- Request transparent background for every frame
- Mention "centered in frame" to avoid offset issues

---

## Customization Template

Fill in these brackets for your character:

**[Character Description]**: e.g., "a young warrior with blue armor and red cape"
**[Art Style]**: e.g., "vibrant pixel art", "hand-drawn anime", "16-bit SNES style"
**[Color Palette]**: e.g., "blues, reds, and gold accents with white highlights"
**[Weapon/Item]**: e.g., "silver longsword", "wooden staff", "magic tome"
**[Special Features]**: e.g., "glowing blue eyes", "flowing cape", "armored shoulders"

Then copy any prompt above, fill in your details, and generate!

---

Ready to create your sprite sheets! 🎨✨
