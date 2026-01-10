# Sprite Sheet Generation System

Complete toolkit for generating professional game sprite sheets using Gemini AI and LPC reference standards.

## 📁 Files in This Package

1. **SPRITE_GENERATION_GUIDE.md** - Comprehensive guide to the entire process
2. **EXAMPLE_PROMPTS.md** - Ready-to-use prompts for Gemini (just customize brackets)
3. **LPC_LAYOUT_REFERENCE.md** - Complete reference for LPC sprite sheet layouts
4. **sprite_generator.js** - Node.js automation script (framework/starter)

## 🚀 Quick Start

### Option 1: Manual Generation (Easiest)

1. Open EXAMPLE_PROMPTS.md
2. Choose your animation type (walk, attack, cast, etc.)
3. Customize the bracketed sections with your character details
4. Upload reference LPC image + your style image to Gemini
5. Generate each frame
6. Assemble using image editor or tool

### Option 2: Automated (Advanced)

1. Download LPC reference sprites from OpenGameArt.org
2. Prepare your character style guide
3. Modify sprite_generator.js for your Gemini API
4. Run: `node sprite_generator.js`
5. Profit! 🎉

## 📚 Reference Sources

- **OpenGameArt.org LPC Collection**: https://opengameart.org/content/lpc-collection
- **4-Frame Walk Cycles**: https://opengameart.org/content/4-frame-walk-cycles
- **Universal LPC Generator**: https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/

## 🎨 The Strategy

The secret to great sprite generation:

```
Reference Image (structure) + Style Image (appearance) = Perfect Sprite
```

- **Reference**: LPC sprite showing exact pose/body mechanics
- **Style**: Your character design, colors, art style
- **Gemini**: Transfers your style onto the reference pose

## ⚡ Pro Tips

1. **Start with walk cycle, DOWN direction** (most visible)
2. **Use first generated frame as style ref** for consistency
3. **Generate 4-frame cycles first** (easier than 9-frame)
4. **Test one direction before generating all four**
5. **Save prompts that work well** for future use

## 🎯 Common Use Cases

- **Game Development**: Character sprites for indie games
- **Rapid Prototyping**: Quick character variations
- **Style Transfer**: Convert existing sprites to new styles
- **Learning**: Understand sprite animation mechanics

## 📖 Full Documentation

See SPRITE_GENERATION_GUIDE.md for:
- Detailed workflow
- Animation frame breakdowns
- Quality checklist
- Troubleshooting
- Attribution requirements

## 🔧 Integration with Forge

To add this to your Forge platform:

1. Create a new forge component for sprite generation
2. Use forge_create_image with the prompts from EXAMPLE_PROMPTS.md
3. Let users provide:
   - Character description
   - Art style
   - Animation type
4. Generate frames sequentially
5. Return assembled sprite sheet

See sprite_generator.js for implementation ideas.

## 📜 License

- **LPC Assets**: CC-BY-SA 3.0 / GPL 3.0 (attribution required)
- **This Toolkit**: Use freely for your projects
- **Generated Sprites**: Yours! (but credit LPC references)

## 🆘 Need Help?

1. Check EXAMPLE_PROMPTS.md for working examples
2. Review LPC_LAYOUT_REFERENCE.md for sprite sheet structure
3. Read SPRITE_GENERATION_GUIDE.md for detailed process

---

Happy sprite generating! 🎮✨
