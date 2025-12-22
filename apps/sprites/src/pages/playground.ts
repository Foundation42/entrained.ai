// Sprites Playground - SSR HTML page
import type { SpriteSheetRow } from '../types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function playgroundPage(recentSheets: SpriteSheetRow[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sprite Generator - Entrained AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0a;
      --bg-secondary: #141414;
      --bg-tertiary: #1a1a1a;
      --text: #e5e5e5;
      --text-secondary: #a3a3a3;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --border: #262626;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .logo span { color: var(--accent); }

    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: var(--text-secondary);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .card h3 {
      font-size: 1rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: var(--text-secondary);
    }

    input, select, textarea {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn:hover { background: var(--accent-hover); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-secondary {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--border);
    }

    .preview-area {
      min-height: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #000;
      border-radius: 8px;
      position: relative;
    }

    .preview-area img {
      max-width: 100%;
      max-height: 500px;
      image-rendering: pixelated;
    }

    .preview-placeholder {
      color: var(--text-secondary);
      text-align: center;
    }

    .loading {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .loading.active { display: flex; }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .slot-grid {
      display: grid;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .slot {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .slot:hover {
      border-color: var(--accent);
    }

    .slot.selected {
      border-color: var(--accent);
      background: rgba(59, 130, 246, 0.1);
    }

    .slot-preview {
      width: 60px;
      height: 60px;
      background-size: 300% 300%;
      background-repeat: no-repeat;
      margin: 0 auto;
      clip-path: inset(4px);
    }

    .recent-sheets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }

    .sheet-thumb {
      aspect-ratio: 1;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.2s;
    }

    .sheet-thumb:hover {
      border-color: var(--accent);
    }

    .sheet-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      image-rendering: pixelated;
    }

    .sheet-info {
      padding: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .sheet-delete {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      background: rgba(239, 68, 68, 0.9);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 12px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .sheet-thumb {
      position: relative;
    }

    .sheet-thumb:hover .sheet-delete {
      display: flex;
    }

    .sheet-delete:hover {
      background: rgba(239, 68, 68, 1);
    }

    .error-message {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--error);
      color: var(--error);
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      display: none;
    }

    .error-message.active { display: block; }

    .avatar-preview {
      width: 150px;
      height: 150px;
      position: relative;
      margin: 1rem auto;
      background: #000;
      border-radius: 8px;
    }

    .avatar-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-size: 300% 300%;
      background-repeat: no-repeat;
    }

    .css-output {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.875rem;
      overflow-x: auto;
      white-space: pre-wrap;
      margin-top: 1rem;
    }

    /* Compositor styles */
    .compositor-grid {
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 1.5rem;
      align-items: start;
    }

    @media (max-width: 768px) {
      .compositor-grid { grid-template-columns: 1fr; }
    }

    .layer-section {
      margin-bottom: 1.5rem;
    }

    .layer-section h4 {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .layer-options {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .layer-option {
      width: 70px;
      height: 70px;
      background: #000;
      border: 2px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      background-size: 300% 300%;
      background-repeat: no-repeat;
      clip-path: inset(4px round 4px);
    }

    .layer-option:hover {
      border-color: var(--accent);
      transform: scale(1.05);
    }

    .layer-option.selected {
      border-color: var(--accent);
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
    }

    .avatar-compositor {
      width: 180px;
      height: 180px;
      background: #000;
      border-radius: 12px;
      position: relative;
      margin: 0 auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }

    .compositor-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-repeat: no-repeat;
      image-rendering: pixelated;
      clip-path: inset(4px);
      /* Alpha is baked into the PNG, natural stacking works */
    }

    .transform-controls {
      display: none;
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: var(--bg);
      border-radius: 6px;
      font-size: 0.75rem;
    }

    .transform-controls.active {
      display: block;
    }

    .transform-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .transform-row label {
      width: 40px;
      margin: 0;
      font-size: 0.7rem;
    }

    .transform-row input[type="range"] {
      flex: 1;
      height: 4px;
      padding: 0;
    }

    .transform-row .value {
      width: 35px;
      text-align: right;
      color: var(--text-secondary);
    }

    .recipe-output {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }

    .recipe-output h4 {
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .recipe-json {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      word-break: break-all;
    }

    .compositor-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-align: center;
      padding: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">Sprite<span>Gen</span></div>
      <a href="https://entrained.ai">Entrained AI</a>
    </header>

    <h1>Sprite Generator</h1>
    <h2>Generate modular sprite sheets with AI</h2>

    <div class="error-message" id="errorMessage"></div>

    <div class="grid">
      <!-- Generator Controls -->
      <div class="card">
        <h3>Generate New Sheet</h3>

        <div class="form-group">
          <label for="theme">Theme</label>
          <input type="text" id="theme" placeholder="e.g., Robot, Alien, Fantasy, Cyberpunk" value="Robot">
        </div>

        <div class="form-group">
          <label for="category">Category</label>
          <select id="category">
            <option value="avatar">Avatar Parts</option>
            <option value="tileset">Tileset</option>
            <option value="particles">Particles/FX</option>
            <option value="ships">Spaceships</option>
            <option value="weapons">Weapons</option>
            <option value="badges">Badges (Classic)</option>
            <option value="badges_colorful">Badges (Colorful)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="gridSize">Grid Size</label>
          <select id="gridSize">
            <option value="3">3x3 (9 items)</option>
            <option value="4">4x4 (16 items)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="style">Style</label>
          <select id="style">
            <option value="flat_vector">Flat Vector (Clean & Modern)</option>
            <option value="pixel_art">Pixel Art (Retro)</option>
            <option value="hand_drawn">Hand Drawn (Organic)</option>
            <option value="neon">Neon (Cyberpunk)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="customNotes">Custom Notes (optional)</label>
          <textarea id="customNotes" rows="2" placeholder="Add specific instructions for the AI, e.g., 'use cool blues and purples' or 'make them look magical'"></textarea>
        </div>

        <button class="btn" id="generateBtn" onclick="generateSheet()">
          Generate Sheet
        </button>
      </div>

      <!-- Preview Area -->
      <div class="card">
        <h3>Preview</h3>
        <div class="preview-area" id="previewArea">
          <div class="preview-placeholder" id="placeholder">
            Generated sprite sheet will appear here
          </div>
          <div class="loading" id="loading">
            <div class="spinner"></div>
            <div>Generating with Gemini AI...</div>
          </div>
          <img id="previewImage" style="display: none;">
        </div>

        <div id="slotInfo" style="display: none;">
          <h4 style="margin-top: 1rem; margin-bottom: 0.5rem;">Slots</h4>
          <div class="slot-grid" id="slotGrid"></div>
        </div>

        <div class="css-output" id="cssOutput" style="display: none;"></div>
      </div>
    </div>

    <!-- Avatar Compositor -->
    <div class="card" id="compositorCard" style="display: none; margin-bottom: 2rem;">
      <h3>Avatar Compositor</h3>
      <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.875rem;">
        Mix and match parts from the generated avatar sheet to create unique combinations.
      </p>

      <div class="compositor-grid">
        <div class="layer-sections">
          <!-- Head Layer -->
          <div class="layer-section">
            <h4>Head (Row 1)</h4>
            <div class="layer-options" id="headOptions"></div>
            <div class="transform-controls" id="headTransform">
              <div class="transform-row">
                <label>X</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('head', 'x', this.value)">
                <span class="value" id="headX">0</span>
              </div>
              <div class="transform-row">
                <label>Y</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('head', 'y', this.value)">
                <span class="value" id="headY">0</span>
              </div>
              <div class="transform-row">
                <label>Scale</label>
                <input type="range" min="50" max="150" value="100" oninput="updateTransform('head', 'scale', this.value)">
                <span class="value" id="headScale">100%</span>
              </div>
            </div>
          </div>

          <!-- Eyes Layer -->
          <div class="layer-section">
            <h4>Eyes (Row 2)</h4>
            <div class="layer-options" id="eyesOptions"></div>
            <div class="transform-controls" id="eyesTransform">
              <div class="transform-row">
                <label>X</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('eyes', 'x', this.value)">
                <span class="value" id="eyesX">0</span>
              </div>
              <div class="transform-row">
                <label>Y</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('eyes', 'y', this.value)">
                <span class="value" id="eyesY">0</span>
              </div>
              <div class="transform-row">
                <label>Scale</label>
                <input type="range" min="50" max="150" value="100" oninput="updateTransform('eyes', 'scale', this.value)">
                <span class="value" id="eyesScale">100%</span>
              </div>
            </div>
          </div>

          <!-- Mouth Layer -->
          <div class="layer-section">
            <h4>Mouth (Row 3)</h4>
            <div class="layer-options" id="mouthOptions"></div>
            <div class="transform-controls" id="mouthTransform">
              <div class="transform-row">
                <label>X</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('mouth', 'x', this.value)">
                <span class="value" id="mouthX">0</span>
              </div>
              <div class="transform-row">
                <label>Y</label>
                <input type="range" min="-50" max="50" value="0" oninput="updateTransform('mouth', 'y', this.value)">
                <span class="value" id="mouthY">0</span>
              </div>
              <div class="transform-row">
                <label>Scale</label>
                <input type="range" min="50" max="150" value="100" oninput="updateTransform('mouth', 'scale', this.value)">
                <span class="value" id="mouthScale">100%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="compositor-preview">
          <div class="avatar-compositor" id="avatarCompositor">
            <div class="compositor-empty">Select parts to preview</div>
          </div>

          <div class="recipe-output" id="recipeOutput" style="display: none;">
            <h4>Recipe JSON</h4>
            <div class="recipe-json" id="recipeJson"></div>
          </div>

          <div style="margin-top: 1rem;">
            <button class="btn" style="width: 100%; margin-bottom: 0.5rem; background: var(--success);" onclick="useForAvatar()" id="useAvatarBtn">
              Use This Avatar
            </button>
            <input type="text" id="recipeName" placeholder="Recipe name (e.g., RoboCat)" style="margin-bottom: 0.5rem;">
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn" style="flex: 1;" onclick="saveRecipe()" id="saveRecipeBtn">
                Save Recipe
              </button>
              <button class="btn btn-secondary" style="flex: 1;" onclick="copyRecipe(event)">
                Copy JSON
              </button>
            </div>
            <div id="saveStatus" style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--success); display: none;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Sheets -->
    <div class="card">
      <h3>Recent Sheets</h3>
      <div class="recent-sheets" id="recentSheets">
        ${recentSheets.length === 0 ? '<p style="color: var(--text-secondary);">No sheets generated yet. Create your first one above!</p>' : ''}
        ${recentSheets.map(sheet => `
          <div class="sheet-thumb" onclick="loadSheet('${escapeHtml(sheet.id)}')">
            <button class="sheet-delete" onclick="event.stopPropagation(); deleteSheet('${escapeHtml(sheet.id)}', this)" title="Delete">&times;</button>
            <img src="${escapeHtml(sheet.url)}" alt="${escapeHtml(sheet.theme)} ${escapeHtml(sheet.category)}">
            <div class="sheet-info">${escapeHtml(sheet.theme)} - ${escapeHtml(sheet.category)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <script>
    let currentSheet = null;
    let currentSlots = [];
    let selectedLayers = { head: null, eyes: null, mouth: null };
    let layerTransforms = {
      head: { x: 0, y: 0, scale: 100 },
      eyes: { x: 0, y: 0, scale: 100 },
      mouth: { x: 0, y: 0, scale: 100 }
    };

    async function generateSheet() {
      const theme = document.getElementById('theme').value;
      const category = document.getElementById('category').value;
      const gridSize = parseInt(document.getElementById('gridSize').value);
      const styleKey = document.getElementById('style').value;
      const customNotes = document.getElementById('customNotes').value.trim();

      const styles = {
        flat_vector: 'minimalist flat vector 2.0, clean thick outlines, vibrant saturation',
        pixel_art: '16-bit pixel art, limited palette, crisp edges, no anti-aliasing',
        hand_drawn: 'hand-drawn sketch style, organic lines, slight imperfections',
        neon: 'neon glow effects, dark background, cyberpunk aesthetic',
      };

      const btn = document.getElementById('generateBtn');
      const loading = document.getElementById('loading');
      const placeholder = document.getElementById('placeholder');
      const previewImage = document.getElementById('previewImage');
      const errorMessage = document.getElementById('errorMessage');

      btn.disabled = true;
      loading.classList.add('active');
      placeholder.style.display = 'none';
      previewImage.style.display = 'none';
      errorMessage.classList.remove('active');

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theme,
            category,
            grid_size: gridSize,
            style: styles[styleKey],
            custom_notes: customNotes || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Generation failed');
        }

        currentSheet = data.data.sheet;
        currentSlots = data.data.slots;

        previewImage.src = currentSheet.url;
        previewImage.style.display = 'block';

        renderSlots(gridSize);
        initCompositor();

        // Add to recent sheets list
        addToRecentSheets(currentSheet);

      } catch (err) {
        errorMessage.textContent = err.message;
        errorMessage.classList.add('active');
        placeholder.style.display = 'block';
      } finally {
        btn.disabled = false;
        loading.classList.remove('active');
      }
    }

    function renderSlots(gridSize) {
      const slotInfo = document.getElementById('slotInfo');
      const slotGrid = document.getElementById('slotGrid');

      slotGrid.style.gridTemplateColumns = 'repeat(' + gridSize + ', 1fr)';
      slotGrid.innerHTML = currentSlots.map(slot => {
        const col = slot.slot_index % gridSize;
        const row = Math.floor(slot.slot_index / gridSize);
        const bgPosX = (col / (gridSize - 1)) * 100;
        const bgPosY = (row / (gridSize - 1)) * 100;

        return '<div class="slot" onclick="selectSlot(' + slot.slot_index + ')">' +
          '<div class="slot-preview" style="background-image: url(\\'' + encodeURI(currentSheet.url) + '\\'); background-position: ' + bgPosX + '% ' + bgPosY + '%;"></div>' +
          '<div style="text-align: center; font-size: 0.75rem; margin-top: 0.25rem;">' + (slot.label || 'Slot ' + slot.slot_index) + '</div>' +
        '</div>';
      }).join('');

      slotInfo.style.display = 'block';
    }

    function selectSlot(index) {
      const slots = document.querySelectorAll('.slot');
      slots.forEach((s, i) => s.classList.toggle('selected', i === index));

      const cssOutput = document.getElementById('cssOutput');
      const gridSize = currentSheet.grid_size;
      const col = index % gridSize;
      const row = Math.floor(index / gridSize);
      const bgPosX = gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0;
      const bgPosY = gridSize > 1 ? (row / (gridSize - 1)) * 100 : 0;

      cssOutput.textContent = '.sprite-slot-' + index + ' {\\n' +
        '  width: 100px;\\n' +
        '  height: 100px;\\n' +
        '  background-image: url("' + currentSheet.url + '");\\n' +
        '  background-size: ' + (gridSize * 100) + '% ' + (gridSize * 100) + '%;\\n' +
        '  background-position: ' + bgPosX + '% ' + bgPosY + '%;\\n' +
        '  background-repeat: no-repeat;\\n' +
        '}';
      cssOutput.style.display = 'block';
    }

    async function loadSheet(id) {
      try {
        const res = await fetch('/api/sheets/' + id);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load sheet');
        }

        currentSheet = data.data.sheet;
        currentSlots = data.data.slots;

        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        previewImage.src = currentSheet.url;
        previewImage.style.display = 'block';
        placeholder.style.display = 'none';

        renderSlots(currentSheet.grid_size);
        initCompositor();

      } catch (err) {
        console.error('Failed to load sheet:', err);
      }
    }

    function updateTransform(layer, prop, value) {
      layerTransforms[layer][prop] = parseInt(value);

      // Update display value
      const displayId = layer + prop.charAt(0).toUpperCase() + prop.slice(1);
      const display = document.getElementById(displayId);
      if (display) {
        display.textContent = prop === 'scale' ? value + '%' : value;
      }

      updateCompositor();
    }

    function initCompositor() {
      const compositorCard = document.getElementById('compositorCard');

      // Show compositor for avatar and badge sheets
      const compositorCategories = ['avatar', 'badges', 'badges_colorful'];
      if (!currentSheet || !compositorCategories.includes(currentSheet.category)) {
        compositorCard.style.display = 'none';
        return;
      }

      compositorCard.style.display = 'block';
      selectedLayers = { head: null, eyes: null, mouth: null };

      // Reset transforms
      layerTransforms = {
        head: { x: 0, y: 0, scale: 100 },
        eyes: { x: 0, y: 0, scale: 100 },
        mouth: { x: 0, y: 0, scale: 100 }
      };

      // Hide all transform controls initially
      ['head', 'eyes', 'mouth'].forEach(layer => {
        const ctrl = document.getElementById(layer + 'Transform');
        if (ctrl) ctrl.classList.remove('active');
      });

      const gridSize = currentSheet.grid_size;
      const layerContainers = ['headOptions', 'eyesOptions', 'mouthOptions'];
      const layerNames = ['head', 'eyes', 'mouth'];

      layerContainers.forEach((containerId, rowIndex) => {
        const container = document.getElementById(containerId);
        if (rowIndex >= gridSize) {
          container.innerHTML = '<span style="color: var(--text-secondary);">Not available</span>';
          return;
        }

        let html = '';
        for (let col = 0; col < gridSize; col++) {
          const slotIndex = rowIndex * gridSize + col;
          const bgPosX = gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0;
          const bgPosY = gridSize > 1 ? (rowIndex / (gridSize - 1)) * 100 : 0;

          html += '<div class="layer-option" ' +
            'data-layer="' + layerNames[rowIndex] + '" ' +
            'data-slot="' + slotIndex + '" ' +
            'onclick="selectLayer(\\'' + layerNames[rowIndex] + '\\', ' + slotIndex + ')" ' +
            'style="background-image: url(\\'' + encodeURI(currentSheet.url) + '\\'); background-position: ' + bgPosX + '% ' + bgPosY + '%;"></div>';
        }
        container.innerHTML = html;
      });

      updateCompositor();
    }

    function selectLayer(layer, slotIndex) {
      // Toggle selection - clicking again deselects
      if (selectedLayers[layer] === slotIndex) {
        selectedLayers[layer] = null;
      } else {
        selectedLayers[layer] = slotIndex;
      }

      // Update visual selection state
      const options = document.querySelectorAll('.layer-option[data-layer="' + layer + '"]');
      options.forEach(opt => {
        const slot = parseInt(opt.dataset.slot);
        opt.classList.toggle('selected', slot === selectedLayers[layer]);
      });

      // Show/hide transform controls
      const transformCtrl = document.getElementById(layer + 'Transform');
      if (transformCtrl) {
        transformCtrl.classList.toggle('active', selectedLayers[layer] !== null);
      }

      updateCompositor();
    }

    function updateCompositor() {
      const compositor = document.getElementById('avatarCompositor');
      const recipeOutput = document.getElementById('recipeOutput');
      const recipeJson = document.getElementById('recipeJson');
      const gridSize = currentSheet.grid_size;

      // Check if any layer is selected
      const hasSelection = Object.values(selectedLayers).some(v => v !== null);

      if (!hasSelection) {
        compositor.innerHTML = '<div class="compositor-empty">Select parts to preview</div>';
        recipeOutput.style.display = 'none';
        return;
      }

      // Build layered preview
      let html = '';
      const layers = ['head', 'eyes', 'mouth'];
      const recipe = [];

      layers.forEach((layer, zIndex) => {
        const slotIndex = selectedLayers[layer];
        if (slotIndex === null) return;

        const col = slotIndex % gridSize;
        const row = Math.floor(slotIndex / gridSize);
        const bgPosX = gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0;
        const bgPosY = gridSize > 1 ? (row / (gridSize - 1)) * 100 : 0;

        // Get transforms for this layer
        const transform = layerTransforms[layer];
        const bgSize = (gridSize * 100) + '%';

        // Build transform style
        const translateX = transform.x;
        const translateY = transform.y;
        const scale = transform.scale / 100;
        const transformStyle = 'transform: translate(' + translateX + '%, ' + translateY + '%) scale(' + scale + '); ' +
          'transform-origin: center center; ';

        html += '<div class="compositor-layer" style="' +
          'background-image: url(\\'' + encodeURI(currentSheet.url) + '\\'); ' +
          'background-size: ' + bgSize + ' ' + bgSize + '; ' +
          'background-position: ' + bgPosX + '% ' + bgPosY + '%; ' +
          transformStyle +
          'z-index: ' + (zIndex + 1) + ';"></div>';

        recipe.push({
          layer: layer,
          sheet_id: currentSheet.id,
          slot_index: slotIndex,
          z_index: zIndex + 1,
          transform: {
            x: transform.x,
            y: transform.y,
            scale: transform.scale
          }
        });
      });

      compositor.innerHTML = html;
      recipeOutput.style.display = 'block';
      recipeJson.textContent = JSON.stringify({ layers: recipe }, null, 2);
    }

    async function saveRecipe() {
      const recipeJsonEl = document.getElementById('recipeJson');
      const nameInput = document.getElementById('recipeName');
      const saveBtn = document.getElementById('saveRecipeBtn');
      const saveStatus = document.getElementById('saveStatus');

      const recipeData = JSON.parse(recipeJsonEl.textContent);
      const name = nameInput.value.trim() || null;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            layers: recipeData.layers,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to save');
        }

        saveStatus.style.display = 'block';
        saveStatus.style.color = 'var(--success)';
        saveStatus.textContent = 'Saved! ID: ' + data.data.id;
        nameInput.value = '';

        setTimeout(() => {
          saveStatus.style.display = 'none';
        }, 3000);

      } catch (err) {
        saveStatus.style.display = 'block';
        saveStatus.style.color = 'var(--error)';
        saveStatus.textContent = 'Error: ' + err.message;
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Recipe';
      }
    }

    function copyRecipe(event) {
      const recipeJson = document.getElementById('recipeJson');
      navigator.clipboard.writeText(recipeJson.textContent).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 1500);
      });
    }

    function addToRecentSheets(sheet) {
      const container = document.getElementById('recentSheets');

      // Remove "no sheets" message if present
      const noSheetsMsg = container.querySelector('p');
      if (noSheetsMsg) {
        noSheetsMsg.remove();
      }

      // Create new thumb element
      const thumb = document.createElement('div');
      thumb.className = 'sheet-thumb';
      thumb.onclick = function() { loadSheet(sheet.id); };
      thumb.innerHTML = '<button class="sheet-delete" onclick="event.stopPropagation(); deleteSheet(\\'' + sheet.id + '\\', this)" title="Delete">&times;</button>' +
        '<img src="' + encodeURI(sheet.url) + '" alt="' + (sheet.theme || '') + '">' +
        '<div class="sheet-info">' + (sheet.theme || 'New') + ' - ' + (sheet.category || 'avatar') + '</div>';

      // Insert at the beginning
      container.insertBefore(thumb, container.firstChild);
    }

    async function deleteSheet(id, btn) {
      if (!confirm('Delete this sprite sheet? This cannot be undone.')) {
        return;
      }

      btn.textContent = '...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/sheets/' + id, { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to delete');
        }

        // Remove the thumb from the DOM
        const thumb = btn.closest('.sheet-thumb');
        thumb.remove();

        // If we deleted the current sheet, clear the preview
        if (currentSheet && currentSheet.id === id) {
          currentSheet = null;
          currentSlots = [];
          document.getElementById('previewImage').style.display = 'none';
          document.getElementById('placeholder').style.display = 'block';
          document.getElementById('slotInfo').style.display = 'none';
          document.getElementById('compositorCard').style.display = 'none';
        }

      } catch (err) {
        alert('Error deleting: ' + err.message);
        btn.textContent = '×';
        btn.disabled = false;
      }
    }

    // ================================
    // EAP Intent Handling
    // ================================

    let currentIntent = null;

    function parseIntent() {
      const params = new URLSearchParams(window.location.search);
      const intentJson = params.get('intent');
      if (!intentJson) return null;

      try {
        return JSON.parse(decodeURIComponent(intentJson));
      } catch {
        return null;
      }
    }

    function initIntentMode() {
      currentIntent = parseIntent();
      if (!currentIntent) return;

      console.log('[EAP] Intent mode:', currentIntent);

      // Normalize field names (support both formats)
      const params = currentIntent.params || currentIntent.parameters || {};
      const capability = currentIntent.capability || currentIntent.intent;
      const source = currentIntent.caller?.app || currentIntent.source;
      const returnTo = params.returnTo || currentIntent.returnTo;

      // Auto-detect postMessage mode when opened as popup
      const usePostMessage = !!window.opener;

      // Store normalized values back
      currentIntent.params = params;
      currentIntent.capability = capability;
      currentIntent.source = source;
      currentIntent.returnTo = returnTo;
      currentIntent.usePostMessage = usePostMessage;

      // Pre-fill form based on intent parameters
      if (params.theme) {
        document.getElementById('theme').value = params.theme;
      }
      if (params.style) {
        // Map style string to select option
        const styleMap = {
          'pixel_art': 'pixel_art',
          'pixel-art': 'pixel_art',
          'flat_vector': 'flat_vector',
          'flat-vector': 'flat_vector',
          'hand_drawn': 'hand_drawn',
          'hand-drawn': 'hand_drawn',
          'neon': 'neon',
        };
        const styleKey = styleMap[params.style] || 'flat_vector';
        document.getElementById('style').value = styleKey;
      }

      // Force avatar category for avatar.create intent
      if (capability === 'avatar.create') {
        document.getElementById('category').value = 'avatar';
      }

      // Add intent mode banner
      const container = document.querySelector('.container');
      const banner = document.createElement('div');
      banner.id = 'intentBanner';
      banner.style.cssText = 'background: var(--accent); color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;';
      banner.innerHTML = \`
        <div>
          <strong>Avatar Selection Mode</strong>
          <span style="opacity: 0.9; margin-left: 0.5rem;">Create or select an avatar, then click "Use This Avatar" to continue</span>
        </div>
        <button onclick="cancelIntent()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Cancel</button>
      \`;
      container.insertBefore(banner, container.firstChild.nextSibling);

      // Show avatar compositor section by default
      document.getElementById('compositorCard').style.display = 'block';
    }

    function sendIntentResult(result) {
      if (!currentIntent) return;

      const response = {
        type: 'eap:result',
        capability: currentIntent.capability,
        requestId: currentIntent.requestId,
        status: 'success',
        timestamp: new Date().toISOString(),
        result
      };

      console.log('[EAP] Sending result:', response);

      if (currentIntent.usePostMessage && window.opener) {
        const targetOrigin = currentIntent.source ? \`https://\${currentIntent.source}\` : '*';
        console.log('[EAP] postMessage to:', targetOrigin);
        window.opener.postMessage(response, targetOrigin);
        window.close();
      } else if (currentIntent.returnTo) {
        const url = \`\${currentIntent.returnTo}?result=\${encodeURIComponent(JSON.stringify(response))}\`;
        window.location.href = url;
      }
    }

    function cancelIntent() {
      if (!currentIntent) return;

      const response = {
        type: 'eap:cancel',
        capability: currentIntent.capability,
        requestId: currentIntent.requestId,
        status: 'cancelled',
        timestamp: new Date().toISOString()
      };

      if (currentIntent.usePostMessage && window.opener) {
        const targetOrigin = currentIntent.source ? \`https://\${currentIntent.source}\` : '*';
        window.opener.postMessage(response, targetOrigin);
        window.close();
      } else if (currentIntent.returnTo) {
        window.location.href = currentIntent.returnTo + '?cancelled=1';
      }
    }

    async function useForAvatar() {
      if (!currentSheet) {
        alert('Please generate or select a sprite sheet first');
        return;
      }

      // Get current recipe from compositor
      const recipeJsonEl = document.getElementById('recipeJson');
      let recipe = { layers: [] };

      if (recipeJsonEl && recipeJsonEl.textContent) {
        try {
          recipe = JSON.parse(recipeJsonEl.textContent);
        } catch {}
      }

      // Check if we have layers to composite
      if (recipe.layers && recipe.layers.length > 0) {
        // Render composite to canvas and upload
        const btn = document.getElementById('useAvatarBtn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Rendering...';
        }

        try {
          const avatarUrl = await renderAndUploadAvatar(recipe.layers, currentSheet);

          const result = {
            avatarUrl,
            recipe,
            sheetId: currentSheet.id,
            sheetUrl: currentSheet.url,
            metadata: {
              theme: currentSheet.theme,
              category: currentSheet.category,
            }
          };

          if (currentIntent) {
            sendIntentResult(result);
          } else {
            console.log('Avatar result:', result);
            alert('Avatar uploaded! URL: ' + avatarUrl);
          }
        } catch (err) {
          console.error('Failed to render avatar:', err);
          alert('Failed to render avatar: ' + err.message);
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Use This Avatar';
          }
        }
      } else {
        // No layers - just use sheet URL as fallback
        const result = {
          avatarUrl: currentSheet.url,
          recipe,
          sheetId: currentSheet.id,
          sheetUrl: currentSheet.url,
          metadata: {
            theme: currentSheet.theme,
            category: currentSheet.category,
          }
        };

        if (currentIntent) {
          sendIntentResult(result);
        } else {
          console.log('Avatar result:', result);
          alert('No layers selected - using sheet image');
        }
      }
    }

    async function renderAndUploadAvatar(layers, sheet) {
      const size = 256; // Output avatar size
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Load sheet image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = sheet.url;
      });

      const gridSize = sheet.grid_size;
      const cellWidth = img.width / gridSize;
      const cellHeight = img.height / gridSize;

      // Draw each layer
      for (const layer of layers) {
        const col = layer.slot_index % gridSize;
        const row = Math.floor(layer.slot_index / gridSize);

        ctx.drawImage(
          img,
          col * cellWidth, row * cellHeight, cellWidth, cellHeight,  // source
          0, 0, size, size  // destination
        );
      }

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png');

      // Upload to server
      const response = await fetch('/api/avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl, sheetId: sheet.id })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await response.json();
      return data.data.url;
    }

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', () => {
      initIntentMode();
    });
  </script>
</body>
</html>`;
}
