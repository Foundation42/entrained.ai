#!/usr/bin/env node
/**
 * Sprite Sheet Generator using Gemini AI
 * 
 * Generates game sprite sheets by combining:
 * - Reference poses (LPC standard)
 * - Style transfer (your character design)
 * - Gemini AI generation
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  frameSize: 64, // Standard LPC frame size
  outputDir: './generated_sprites',
  referenceDir: './sprite_references',
  
  // Animation definitions (LPC standard)
  animations: {
    walk: { frames: 9, directions: 4, rows: ['up', 'left', 'down', 'right'] },
    slash: { frames: 6, directions: 4, rows: ['up', 'left', 'down', 'right'] },
    cast: { frames: 7, directions: 4, rows: ['up', 'left', 'down', 'right'] },
    thrust: { frames: 8, directions: 4, rows: ['up', 'left', 'down', 'right'] },
    shoot: { frames: 13, directions: 4, rows: ['up', 'left', 'down', 'right'] },
    hurt: { frames: 6, directions: 1, rows: ['south'] }
  }
};

/**
 * Generate prompts for Gemini sprite generation
 */
class PromptBuilder {
  constructor(characterStyle) {
    this.style = characterStyle;
  }

  /**
   * Build prompt for a specific frame
   */
  buildFramePrompt(animation, frameIndex, direction) {
    const animConfig = CONFIG.animations[animation];
    const totalFrames = animConfig.frames;
    
    // Base prompt structure
    let prompt = `Create a ${this.style.artStyle} style sprite character in ${CONFIG.frameSize}x${CONFIG.frameSize} pixels.\n\n`;
    
    // Character description
    prompt += `Character: ${this.style.description}\n`;
    prompt += `Color Palette: ${this.style.palette}\n`;
    prompt += `Art Style: ${this.style.artStyle}\n\n`;
    
    // Animation context
    prompt += `This is frame ${frameIndex + 1} of ${totalFrames} in a ${animation} animation.\n`;
    prompt += `Direction: facing ${direction}\n\n`;
    
    // Pose instructions
    prompt += this.getPoseInstructions(animation, frameIndex, totalFrames, direction);
    
    // Technical requirements
    prompt += `\n\nTechnical requirements:\n`;
    prompt += `- Exact size: ${CONFIG.frameSize}x${CONFIG.frameSize} pixels\n`;
    prompt += `- Transparent background\n`;
    prompt += `- Character centered in frame\n`;
    prompt += `- Match the exact pose and body position from the reference image\n`;
    prompt += `- Maintain consistent character design with previous frames\n`;
    
    return prompt;
  }

  /**
   * Get pose-specific instructions
   */
  getPoseInstructions(animation, frameIndex, totalFrames, direction) {
    const poses = {
      walk: this.getWalkPose(frameIndex, totalFrames, direction),
      slash: this.getSlashPose(frameIndex, totalFrames, direction),
      cast: this.getCastPose(frameIndex, totalFrames, direction),
      thrust: this.getThrustPose(frameIndex, totalFrames, direction),
      shoot: this.getShootPose(frameIndex, totalFrames, direction),
      hurt: this.getHurtPose(frameIndex, totalFrames)
    };
    
    return poses[animation] || 'Generic pose';
  }

  getWalkPose(frame, total, dir) {
    // Standard walk cycle (9 frames)
    const cycle = [
      'Standing upright, both feet together (idle)',
      'Left leg forward, starting stride',
      'Left leg extended forward, weight transferring',
      'Left foot planted, body over foot (contact)',
      'Right leg passing, body highest point',
      'Right leg forward, weight transferring',
      'Right foot planted, body over foot (contact)',
      'Left leg passing, body highest point',
      'Return to standing (completion)'
    ];
    
    const poseDesc = cycle[frame % cycle.length];
    return `Pose: ${poseDesc}\nDirection: ${dir}\nBody should bob naturally with each step.`;
  }

  getSlashPose(frame, total, dir) {
    const cycle = [
      'Weapon raised, preparing to strike',
      'Weapon at apex, body wound up',
      'Starting downward swing, body rotating',
      'Mid-swing, maximum velocity',
      'Impact position, weapon at bottom',
      'Recovery, returning to guard'
    ];
    return `Attack Pose: ${cycle[frame]}\nDirection: ${dir}`;
  }

  getCastPose(frame, total, dir) {
    const cycle = [
      'Hands together, gathering energy',
      'Hands separating, energy building',
      'Arms rising, magic forming',
      'Arms extended, spell at peak',
      'Releasing spell, arms forward',
      'Spell released, hands apart',
      'Recovery, returning to ready'
    ];
    return `Casting Pose: ${cycle[frame]}\nDirection: ${dir}`;
  }

  getThrustPose(frame, total, dir) {
    const cycle = [
      'Weapon ready, coiled back',
      'Beginning thrust',
      'Weapon extending forward',
      'Full extension, maximum reach',
      'Holding thrust',
      'Pulling back',
      'Weapon retracted',
      'Return to ready'
    ];
    return `Thrust Pose: ${cycle[frame]}\nDirection: ${dir}`;
  }

  getShootPose(frame, total, dir) {
    const cycle = [
      'Drawing bow/raising weapon',
      'Aiming, weapon partially drawn',
      'Fully drawn, aiming',
      'Holding aim',
      'Release/fire',
      'Recoil from shot',
      'Recovering',
      'Lowering weapon',
      'Ready for next shot'
    ];
    return `Shooting Pose: ${cycle[frame % cycle.length]}\nDirection: ${dir}`;
  }

  getHurtPose(frame, total) {
    const cycle = [
      'Initial impact, body jerking',
      'Reeling back from hit',
      'Maximum recoil',
      'Beginning recovery',
      'Steadying',
      'Return to neutral'
    ];
    return `Hurt Pose: ${cycle[frame]}`;
  }
}

/**
 * Main generator class
 */
class SpriteSheetGenerator {
  constructor(geminiApiKey) {
    this.apiKey = geminiApiKey;
    this.promptBuilder = null;
  }

  /**
   * Generate complete sprite sheet
   */
  async generateSpriteSheet(characterStyle, animation, options = {}) {
    this.promptBuilder = new PromptBuilder(characterStyle);
    
    console.log(`\n🎨 Generating ${animation} sprite sheet...`);
    console.log(`Style: ${characterStyle.artStyle}`);
    console.log(`Character: ${characterStyle.description}\n`);
    
    const animConfig = CONFIG.animations[animation];
    const frames = [];
    
    // Generate each frame
    for (let dirIdx = 0; dirIdx < animConfig.directions; dirIdx++) {
      const direction = animConfig.rows[dirIdx];
      console.log(`📐 Direction: ${direction}`);
      
      for (let frameIdx = 0; frameIdx < animConfig.frames; frameIdx++) {
        const prompt = this.promptBuilder.buildFramePrompt(animation, frameIdx, direction);
        
        console.log(`  Frame ${frameIdx + 1}/${animConfig.frames}...`);
        
        // Generate frame with Gemini
        const frameData = await this.generateFrame(
          prompt,
          options.referenceImage,
          options.styleImage
        );
        
        frames.push({
          direction,
          frameIndex: frameIdx,
          data: frameData,
          prompt: prompt
        });
      }
    }
    
    // Assemble sprite sheet
    console.log(`\n🔨 Assembling sprite sheet...`);
    const spriteSheet = await this.assembleSpriteSheet(frames, animConfig);
    
    // Save
    const outputPath = path.join(
      CONFIG.outputDir,
      `${characterStyle.name}_${animation}.png`
    );
    await this.saveSpriteSheet(spriteSheet, outputPath);
    
    console.log(`✅ Saved to: ${outputPath}\n`);
    
    return {
      path: outputPath,
      frames: frames.length,
      animation,
      dimensions: {
        width: animConfig.frames * CONFIG.frameSize,
        height: animConfig.directions * CONFIG.frameSize
      }
    };
  }

  /**
   * Generate single frame using Gemini API
   */
  async generateFrame(prompt, referenceImage, styleImage) {
    // This would call the actual Gemini API
    // For now, return placeholder
    
    console.log('    Calling Gemini API...');
    
    // Example API call structure:
    /*
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/png', data: referenceImage } },
            { inline_data: { mime_type: 'image/png', data: styleImage } }
          ]
        }],
        generation_config: {
          temperature: 0.4, // Lower for consistency
          candidateCount: 1
        }
      })
    });
    
    const result = await response.json();
    return result.candidates[0].content.parts[0].inline_data.data;
    */
    
    // Placeholder return
    return Buffer.alloc(CONFIG.frameSize * CONFIG.frameSize * 4); // RGBA
  }

  /**
   * Assemble individual frames into sprite sheet
   */
  async assembleSpriteSheet(frames, animConfig) {
    // This would use a canvas library like 'canvas' or 'sharp'
    // to composite the frames into a single sprite sheet
    
    const width = animConfig.frames * CONFIG.frameSize;
    const height = animConfig.directions * CONFIG.frameSize;
    
    console.log(`  Dimensions: ${width}x${height}`);
    
    // Placeholder - in reality you'd composite the frames
    return {
      width,
      height,
      data: Buffer.alloc(width * height * 4)
    };
  }

  /**
   * Save sprite sheet to file
   */
  async saveSpriteSheet(spriteSheet, outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // In reality, encode as PNG and write
    await fs.writeFile(outputPath, spriteSheet.data);
  }
}

/**
 * Example usage
 */
async function main() {
  // Character style definition
  const characterStyle = {
    name: 'pixel_warrior',
    description: 'A young warrior with blue armor and red cape',
    artStyle: 'pixel art',
    palette: 'vibrant blues and reds with golden accents',
    styleImage: null // Load your style reference
  };

  // Initialize generator
  const generator = new SpriteSheetGenerator(process.env.GEMINI_API_KEY);

  // Generate walk cycle
  const result = await generator.generateSpriteSheet(
    characterStyle,
    'walk',
    {
      referenceImage: null, // Load LPC reference
      styleImage: null      // Load style guide
    }
  );

  console.log('Generation complete!', result);
}

// Export for use as module
module.exports = {
  SpriteSheetGenerator,
  PromptBuilder,
  CONFIG
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
