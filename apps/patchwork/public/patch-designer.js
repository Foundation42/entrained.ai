// Patch Designer - AI-assisted patch generation
const SCHEMA_API = '/api/schema';
const PATCH_API = '/api/patch';

let schemas = [];
let currentSchemaId = null;
let currentSchema = null;
let generatedPatch = null;
let midiInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkDesignerAuth, 50);
  setupEventListeners();
  initMidi();
});

window.recheckDesignerAuth = checkDesignerAuth;

function checkDesignerAuth() {
  const token = localStorage.getItem('auth_token');
  const gate = document.getElementById('designer-auth-gate');
  const ui = document.getElementById('designer-ui');
  const librarySection = document.getElementById('patch-library-section');

  if (token) {
    gate?.classList.add('hidden');
    ui?.classList.remove('hidden');
    librarySection?.classList.remove('hidden');
    loadUserSchemas();
    loadPatchLibrary(); // Load all patches on page load
  } else {
    gate?.classList.remove('hidden');
    ui?.classList.add('hidden');
    librarySection?.classList.add('hidden');
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

  // MIDI controls
  document.getElementById('midi-output-select')?.addEventListener('change', handleMidiOutputChange);
  document.getElementById('send-midi-btn')?.addEventListener('click', handleSendMidi);

  // Library filter
  document.getElementById('library-synth-filter')?.addEventListener('change', handleLibraryFilter);
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

  // Show MIDI controls
  showMidiSection();
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

    // Refresh saved patches list and library
    if (currentSchemaId) {
      loadSavedPatches(currentSchemaId);
    }
    loadPatchLibrary();
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

// ==========================================
// PATCH LIBRARY
// ==========================================

let allPatches = [];
let libraryFilter = '';

async function loadPatchLibrary() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${PATCH_API}/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load patches');

    allPatches = await res.json();
    updateLibraryFilterOptions();
    renderPatchLibrary();
  } catch (err) {
    console.error('Failed to load patch library', err);
  }
}

function updateLibraryFilterOptions() {
  const filterSelect = document.getElementById('library-synth-filter');
  if (!filterSelect) return;

  // Get unique synths from patches
  const synths = new Map();
  allPatches.forEach(p => {
    const key = p.schema_id;
    if (!synths.has(key)) {
      synths.set(key, `${p.manufacturer} ${p.synth_name}`);
    }
  });

  // Build options
  filterSelect.innerHTML = '<option value="">All Synths</option>';
  synths.forEach((name, id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    filterSelect.appendChild(option);
  });
}

function handleLibraryFilter(e) {
  libraryFilter = e.target.value;
  renderPatchLibrary();
}

function renderPatchLibrary() {
  const container = document.getElementById('patch-library-list');
  if (!container) return;

  // Filter patches
  const filteredPatches = libraryFilter
    ? allPatches.filter(p => p.schema_id === libraryFilter)
    : allPatches;

  if (!filteredPatches.length) {
    container.innerHTML = '<p class="library-empty">No patches yet. Design your first one above!</p>';
    return;
  }

  // Group by synth
  const bysynth = {};
  filteredPatches.forEach(p => {
    const synthKey = `${p.manufacturer} ${p.synth_name}`;
    if (!bysynth[synthKey]) {
      bysynth[synthKey] = [];
    }
    bysynth[synthKey].push(p);
  });

  container.innerHTML = Object.entries(bysynth).map(([synth, patches]) => `
    <div class="library-synth-group">
      <h4 class="library-synth-name">${escapeHtml(synth)}</h4>
      <div class="library-patches-grid">
        ${patches.map(p => `
          <div class="library-patch-card" onclick="loadLibraryPatch('${p.id}', '${p.schema_id}')">
            <div class="library-patch-name">${escapeHtml(p.name)}</div>
            ${p.description ? `<div class="library-patch-desc">${escapeHtml(p.description.substring(0, 80))}${p.description.length > 80 ? '...' : ''}</div>` : ''}
            <div class="library-patch-date">${formatDate(p.created_at)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.loadLibraryPatch = async function(patchId, schemaId) {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    // First, make sure we have the schema selected
    if (schemaId !== currentSchemaId) {
      // Load the schema
      const schemaRes = await fetch(`${SCHEMA_API}/${schemaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        currentSchemaId = schemaId;
        currentSchema = schemaData.schema_json || schemaData;

        // Update the synth selector
        const synthSelect = document.getElementById('synth-select');
        if (synthSelect) {
          synthSelect.value = schemaId;
        }

        // Update synth info
        const params = currentSchema.parameters || [];
        const infoEl = document.getElementById('synth-info');
        if (infoEl) {
          infoEl.textContent = `${params.length} parameters`;
        }
      }
    }

    // Now load the patch
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

// ==========================================
// MIDI FUNCTIONALITY
// ==========================================

async function initMidi() {
  const midiSection = document.getElementById('midi-section');
  const midiUnsupported = document.getElementById('midi-unsupported');

  // Check if Web MIDI is supported
  if (!window.midiService || !window.midiService.isSupported) {
    midiSection?.classList.add('hidden');
    midiUnsupported?.classList.remove('hidden');
    return;
  }

  try {
    await window.midiService.initialize();
    midiInitialized = true;

    // Set up device change listener
    window.midiService.onDevicesChanged = (outputs) => {
      updateMidiDeviceList(outputs);
    };

    // Initial device list
    updateMidiDeviceList(window.midiService.getOutputs());

    console.log('[MIDI] Initialized in Patch Designer');
  } catch (err) {
    console.error('[MIDI] Init failed:', err);
    updateMidiStatus('Permission denied', 'error');
  }
}

function updateMidiDeviceList(outputs) {
  const select = document.getElementById('midi-output-select');
  const statusEl = document.getElementById('midi-status');

  if (!select) return;

  // Remember current selection
  const currentValue = select.value;

  // Clear and rebuild options
  select.innerHTML = '<option value="">Select MIDI output...</option>';

  const connectedOutputs = outputs.filter(o => o.state === 'connected');

  connectedOutputs.forEach(output => {
    const option = document.createElement('option');
    option.value = output.id;
    option.textContent = output.name;
    select.appendChild(option);
  });

  // Restore selection if still available
  if (currentValue && connectedOutputs.some(o => o.id === currentValue)) {
    select.value = currentValue;
  }

  // Update status
  if (connectedOutputs.length === 0) {
    updateMidiStatus('No devices', 'warning');
  } else if (connectedOutputs.length === 1) {
    updateMidiStatus('1 device', 'ok');
    // Auto-select if only one device
    select.value = connectedOutputs[0].id;
    handleMidiOutputChange();
  } else {
    updateMidiStatus(`${connectedOutputs.length} devices`, 'ok');
  }

  // Try to auto-match to current synth
  autoMatchMidiDevice(connectedOutputs);
}

function autoMatchMidiDevice(outputs) {
  if (!currentSchema) return;

  const select = document.getElementById('midi-output-select');
  if (!select || select.value) return; // Don't override manual selection

  // Try to find a device matching the synth name
  const synthName = currentSchema.synth_name?.toLowerCase() || '';
  const manufacturer = currentSchema.manufacturer?.toLowerCase() || '';

  const match = outputs.find(o => {
    const name = o.name?.toLowerCase() || '';
    return name.includes(synthName) ||
           name.includes(manufacturer) ||
           (synthName.includes('pro 3') && name.includes('pro 3')) ||
           (synthName.includes('prophet') && name.includes('prophet'));
  });

  if (match) {
    select.value = match.id;
    handleMidiOutputChange();
    console.log(`[MIDI] Auto-matched to ${match.name}`);
  }
}

function updateMidiStatus(text, type = 'ok') {
  const statusEl = document.getElementById('midi-status');
  if (!statusEl) return;

  statusEl.textContent = text;
  statusEl.className = 'midi-status';
  if (type === 'error') statusEl.classList.add('status-error');
  else if (type === 'warning') statusEl.classList.add('status-warning');
  else statusEl.classList.add('status-ok');
}

function handleMidiOutputChange() {
  const select = document.getElementById('midi-output-select');
  const sendBtn = document.getElementById('send-midi-btn');

  if (!select || !sendBtn) return;

  const hasSelection = !!select.value;
  const hasPatch = !!generatedPatch;

  sendBtn.disabled = !(hasSelection && hasPatch);

  if (select.value && window.midiService) {
    window.midiService.selectOutput(select.value);
  }
}

async function handleSendMidi() {
  if (!generatedPatch || !window.midiService?.selectedOutput) return;

  const sendBtn = document.getElementById('send-midi-btn');
  const btnText = sendBtn.querySelector('.btn-text');
  const btnLoading = sendBtn.querySelector('.btn-loading');
  const progressEl = document.getElementById('midi-progress');
  const progressFill = document.getElementById('midi-progress-fill');
  const progressText = document.getElementById('midi-progress-text');
  const errorEl = document.getElementById('midi-error');
  const successEl = document.getElementById('midi-success');

  // Reset UI
  errorEl?.classList.add('hidden');
  successEl?.classList.add('hidden');

  // Show loading state
  sendBtn.disabled = true;
  btnText?.classList.add('hidden');
  btnLoading?.classList.remove('hidden');
  progressEl?.classList.remove('hidden');

  try {
    const result = await window.midiService.sendPatch(
      generatedPatch.parameters,
      0, // MIDI channel 0
      8, // 8ms delay between messages
      (progress) => {
        // Update progress bar
        const percent = (progress.current / progress.total) * 100;
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${progress.current} / ${progress.total}`;
      }
    );

    // Success!
    if (successEl) {
      successEl.textContent = `Sent ${result.sent} parameters to ${window.midiService.selectedOutput.name}`;
      successEl.classList.remove('hidden');
    }

    // Keep progress at 100% briefly
    setTimeout(() => {
      progressEl?.classList.add('hidden');
      if (progressFill) progressFill.style.width = '0%';
    }, 1500);

  } catch (err) {
    console.error('[MIDI] Send failed:', err);
    if (errorEl) {
      errorEl.textContent = err instanceof Error ? err.message : String(err);
      errorEl.classList.remove('hidden');
    }
    progressEl?.classList.add('hidden');
  } finally {
    sendBtn.disabled = false;
    btnText?.classList.remove('hidden');
    btnLoading?.classList.add('hidden');
    handleMidiOutputChange(); // Re-check button state
  }
}

// Show MIDI section when patch is generated
function showMidiSection() {
  if (!midiInitialized) return;

  const midiSection = document.getElementById('midi-section');
  midiSection?.classList.remove('hidden');

  // Update send button state
  handleMidiOutputChange();

  // Try auto-match again in case synth changed
  autoMatchMidiDevice(window.midiService.getOutputs());
}
