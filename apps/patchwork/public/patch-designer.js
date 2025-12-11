// Patch Designer - AI-assisted patch generation
const SCHEMA_API = '/api/schema';
const PATCH_API = '/api/patch';

let schemas = [];
let currentSchemaId = null;
let currentSchema = null;
let generatedPatch = null;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkDesignerAuth, 50);
  setupEventListeners();
});

window.recheckDesignerAuth = checkDesignerAuth;

function checkDesignerAuth() {
  const token = localStorage.getItem('auth_token');
  const gate = document.getElementById('designer-auth-gate');
  const ui = document.getElementById('designer-ui');
  const savedSection = document.getElementById('saved-patches-section');

  if (token) {
    gate?.classList.add('hidden');
    ui?.classList.remove('hidden');
    loadUserSchemas();
  } else {
    gate?.classList.remove('hidden');
    ui?.classList.add('hidden');
    savedSection?.classList.add('hidden');
  }
}

function setupEventListeners() {
  // Synth selector change
  const synthSelect = document.getElementById('synth-select');
  synthSelect?.addEventListener('change', handleSynthChange);

  // Prompt input
  const promptInput = document.getElementById('sound-prompt');
  promptInput?.addEventListener('input', updateGenerateButton);

  // Generate button
  const generateBtn = document.getElementById('generate-btn');
  generateBtn?.addEventListener('click', handleGenerate);

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt) {
        document.getElementById('sound-prompt').value = prompt;
        updateGenerateButton();
      }
    });
  });

  // Save and copy buttons
  document.getElementById('save-patch-btn')?.addEventListener('click', handleSavePatch);
  document.getElementById('copy-patch-btn')?.addEventListener('click', handleCopyPatch);
}

async function loadUserSchemas() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${SCHEMA_API}/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load schemas');

    schemas = await res.json();
    renderSynthSelector();
  } catch (err) {
    console.error('Failed to load schemas', err);
    const select = document.getElementById('synth-select');
    if (select) {
      select.innerHTML = '<option value="">Failed to load synths</option>';
    }
  }
}

function renderSynthSelector() {
  const select = document.getElementById('synth-select');
  if (!select) return;

  if (!schemas.length) {
    select.innerHTML = `
      <option value="">No synths yet - extract a schema first!</option>
    `;
    return;
  }

  select.innerHTML = `
    <option value="">Select a synthesizer...</option>
    ${schemas.map(s => `
      <option value="${s.id}">${s.manufacturer} ${s.synth_name}</option>
    `).join('')}
  `;

  updateGenerateButton();
}

async function handleSynthChange(e) {
  const schemaId = e.target.value;
  currentSchemaId = schemaId || null;
  currentSchema = null;

  const infoEl = document.getElementById('synth-info');

  if (!schemaId) {
    if (infoEl) infoEl.textContent = '';
    updateGenerateButton();
    return;
  }

  // Load full schema to show info
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`${SCHEMA_API}/${schemaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentSchema = data.schema_json || data;
      const params = currentSchema.parameters || [];
      const description = currentSchema.description || '';
      const flow = currentSchema.architecture?.signal_flow;

      let infoText = `${params.length} parameters`;
      if (description) infoText += ` · ${description}`;
      if (flow?.length) infoText += ` · Flow: ${flow.slice(0, 4).join(' → ')}${flow.length > 4 ? '...' : ''}`;

      if (infoEl) infoEl.textContent = infoText;
    }
  } catch (err) {
    console.error('Failed to load schema details', err);
  }

  updateGenerateButton();
  loadSavedPatches(schemaId);
}

function updateGenerateButton() {
  const generateBtn = document.getElementById('generate-btn');
  const promptInput = document.getElementById('sound-prompt');

  if (!generateBtn || !promptInput) return;

  const hasSchema = !!currentSchemaId;
  const hasPrompt = promptInput.value.trim().length > 5;

  generateBtn.disabled = !(hasSchema && hasPrompt);
}

async function handleGenerate() {
  const token = localStorage.getItem('auth_token');
  const prompt = document.getElementById('sound-prompt').value.trim();

  if (!token || !currentSchemaId || !prompt) return;

  const generateBtn = document.getElementById('generate-btn');
  const btnText = generateBtn.querySelector('.btn-text');
  const btnLoading = generateBtn.querySelector('.btn-loading');
  const errorEl = document.getElementById('generate-error');

  // Show loading state
  generateBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  errorEl.classList.add('hidden');

  try {
    const res = await fetch(`${PATCH_API}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        schema_id: currentSchemaId,
        prompt: prompt
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate patch');
    }

    generatedPatch = {
      ...data.patch,
      schema_id: data.schema_id,
      synth_name: data.synth_name,
      prompt: data.prompt
    };

    renderGeneratedPatch(generatedPatch);
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    errorEl.classList.remove('hidden');
  } finally {
    generateBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    updateGenerateButton();
  }
}

function renderGeneratedPatch(patch) {
  const emptyEl = document.getElementById('output-empty');
  const resultEl = document.getElementById('output-result');

  if (!patch) {
    emptyEl?.classList.remove('hidden');
    resultEl?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  resultEl?.classList.remove('hidden');

  // Set patch name and synth
  document.getElementById('patch-name').textContent = patch.patch_name;
  document.getElementById('patch-synth').textContent = patch.synth_name;

  // Set explanation
  const explanationEl = document.getElementById('patch-explanation');
  if (explanationEl) {
    explanationEl.textContent = patch.explanation;
  }

  // Render parameters
  const paramsEl = document.getElementById('patch-params-list');
  if (paramsEl && patch.parameters) {
    // Group parameters by category (from schema)
    const paramsByCategory = {};

    for (const param of patch.parameters) {
      // Try to find category from schema
      let category = 'Other';
      if (currentSchema?.parameters) {
        const schemaParam = currentSchema.parameters.find(
          p => p.name.toLowerCase() === param.name.toLowerCase()
        );
        if (schemaParam) {
          category = schemaParam.category || 'Other';
        }
      }

      if (!paramsByCategory[category]) {
        paramsByCategory[category] = [];
      }
      paramsByCategory[category].push(param);
    }

    paramsEl.innerHTML = Object.entries(paramsByCategory).map(([category, params]) => `
      <div class="param-category">
        <h5 class="param-category-name">${category}</h5>
        <div class="param-items">
          ${params.map(p => `
            <div class="param-item">
              <span class="param-item-name">${p.name}</span>
              <span class="param-item-value">${p.value}</span>
              ${p.cc ? `<span class="param-item-cc">CC ${p.cc}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }
}

async function handleSavePatch() {
  if (!generatedPatch) return;

  const token = localStorage.getItem('auth_token');
  if (!token) {
    showAuthModal('login');
    return;
  }

  const saveBtn = document.getElementById('save-patch-btn');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const res = await fetch(PATCH_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        schema_id: generatedPatch.schema_id,
        name: generatedPatch.patch_name,
        description: generatedPatch.explanation,
        patch_json: {
          patch_name: generatedPatch.patch_name,
          explanation: generatedPatch.explanation,
          parameters: generatedPatch.parameters
        },
        prompt: generatedPatch.prompt
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to save patch');
    }

    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);

    // Refresh saved patches list
    if (currentSchemaId) {
      loadSavedPatches(currentSchemaId);
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  }
}

function handleCopyPatch() {
  if (!generatedPatch) return;

  const patchData = {
    patch_name: generatedPatch.patch_name,
    synth: generatedPatch.synth_name,
    explanation: generatedPatch.explanation,
    parameters: generatedPatch.parameters
  };

  navigator.clipboard.writeText(JSON.stringify(patchData, null, 2))
    .then(() => {
      const copyBtn = document.getElementById('copy-patch-btn');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy', err);
      alert('Failed to copy to clipboard');
    });
}

async function loadSavedPatches(schemaId) {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const section = document.getElementById('saved-patches-section');
  const list = document.getElementById('saved-patches-list');

  if (!section || !list) return;

  try {
    const res = await fetch(`${PATCH_API}/mine?schema_id=${schemaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load patches');

    const patches = await res.json();

    if (!patches.length) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = patches.map(p => `
      <div class="saved-patch-card" onclick="loadSavedPatch('${p.id}')">
        <div class="saved-patch-name">${escapeHtml(p.name)}</div>
        <div class="saved-patch-meta">
          ${p.description ? `<span class="saved-patch-desc">${escapeHtml(p.description.substring(0, 60))}${p.description.length > 60 ? '...' : ''}</span>` : ''}
          <span class="saved-patch-date">${formatDate(p.created_at)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load saved patches', err);
  }
}

window.loadSavedPatch = async function(patchId) {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${PATCH_API}/${patchId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load patch');

    const data = await res.json();

    generatedPatch = {
      patch_name: data.name,
      explanation: data.patch_json.explanation || data.description || '',
      parameters: data.patch_json.parameters || [],
      schema_id: data.schema_id,
      synth_name: `${data.manufacturer} ${data.synth_name}`,
      prompt: data.reasoning
    };

    renderGeneratedPatch(generatedPatch);

    // Scroll to results
    document.getElementById('output-result')?.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
};

function formatDate(seconds) {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
