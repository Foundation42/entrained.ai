// Schema Extractor client logic for the new UI
const API_BASE = '/api/schema';

let selectedFile = null;
let extractedSchema = null;
let currentJobId = null;
let pollInterval = null;

function setAuthVisibility(isLoggedIn) {
  const authGate = document.getElementById('auth-gate');
  const extractorUI = document.getElementById('extractor-ui');

  if (isLoggedIn) {
    authGate?.classList.add('hidden');
    extractorUI?.classList.remove('hidden');
  } else {
    authGate?.classList.remove('hidden');
    extractorUI?.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Small delay to allow auth.js to initialize
  setTimeout(checkAuth, 50);
  setupDropZone();
  setupTabs();

  // Listen for auth changes from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth_token') {
      checkAuth();
    }
  });
});

// Expose for auth.js callbacks / inline handlers
window.recheckSchemaAuth = checkAuth;
window.startExtraction = startExtraction;
window.clearFile = clearFile;
window.saveSchema = saveSchema;
window.resetExtractor = resetExtractor;
window.showSchemaTab = showSchemaTab;

function checkAuth() {
  const token = localStorage.getItem('auth_token');
  setAuthVisibility(Boolean(token));
  if (token) loadMySchemas();
}

function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  });
}

function setupTabs() {
  document.querySelectorAll('.schema-tab').forEach((btn) => {
    if (!btn.dataset.tab) {
      btn.dataset.tab = btn.textContent?.toLowerCase().includes('json') ? 'json' : 'categories';
    }
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) {
        showSchemaTab(tab);
      }
    });
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleFile(file) {
  const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
  const validExts = ['.pdf', '.txt', '.md'];

  const hasValidType = validTypes.includes(file.type);
  const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!hasValidType && !hasValidExt) {
    alert('Please upload a PDF or text file');
    return;
  }

  selectedFile = file;

  const dropZone = document.getElementById('drop-zone');
  const preview = document.getElementById('file-preview');
  const extractBtn = document.getElementById('extract-btn');

  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatSize(file.size);

  dropZone.classList.add('hidden');
  preview.classList.remove('hidden');
  extractBtn.classList.remove('hidden');
  extractBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  currentJobId = null;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';

  document.getElementById('drop-zone')?.classList.remove('hidden');
  document.getElementById('file-preview')?.classList.add('hidden');
  const extractBtn = document.getElementById('extract-btn');
  if (extractBtn) {
    extractBtn.classList.add('hidden');
    extractBtn.disabled = false;
  }
}

async function startExtraction() {
  if (!selectedFile) return;

  const token = localStorage.getItem('auth_token');
  if (!token) {
    showAuthModal('login');
    return;
  }

  const extractBtn = document.getElementById('extract-btn');
  if (extractBtn?.disabled) return;
  if (extractBtn) extractBtn.disabled = true;

  document.getElementById('step-upload')?.classList.add('hidden');
  document.getElementById('step-result')?.classList.add('hidden');
  document.getElementById('step-processing')?.classList.remove('hidden');
  updateProcessingStatus('Uploading file...');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.details || 'Upload failed');
    }

    currentJobId = data.job_id;
    updateProcessingStatus('Processing with AI... This may take a minute or two.');
    startPolling();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

function updateProcessingStatus(message) {
  const statusEl = document.getElementById('processing-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(checkJobStatus, 2000);
  checkJobStatus();
}

async function checkJobStatus() {
  if (!currentJobId) return;

  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/job/${currentJobId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to check job status');
    }

    switch (data.status) {
      case 'uploading':
        updateProcessingStatus('Uploading to AI service...');
        break;
      case 'processing':
        updateProcessingStatus('AI is extracting parameters... This may take a minute or two.');
        break;
      case 'completed':
        clearInterval(pollInterval);
        pollInterval = null;
        extractedSchema = data.schema;
        showResult(data.schema);
        loadMySchemas();
        break;
      case 'failed':
        clearInterval(pollInterval);
        pollInterval = null;
        throw new Error(data.error || 'Extraction failed');
      default:
        updateProcessingStatus(`Status: ${data.status}`);
    }
  } catch (err) {
    clearInterval(pollInterval);
    pollInterval = null;
    showError(err instanceof Error ? err.message : String(err));
  }
}

function showError(message) {
  document.getElementById('step-processing')?.classList.add('hidden');
  document.getElementById('step-upload')?.classList.remove('hidden');
  const extractBtn = document.getElementById('extract-btn');
  if (extractBtn) extractBtn.disabled = false;
  alert(`Extraction failed: ${message}`);
}

function showResult(data) {
  document.getElementById('step-processing')?.classList.add('hidden');
  document.getElementById('step-upload')?.classList.add('hidden');
  document.getElementById('step-result')?.classList.remove('hidden');
  setAuthVisibility(true);

  const parsed = data?.schema || data;
  const params = parsed?.parameters || [];
  const categories = new Set(params.map((p) => p.category || 'Uncategorized'));

  document.getElementById('result-synth-name').textContent = data?.synth_name || parsed?.synth_name || 'Unknown synth';
  document.getElementById('result-manufacturer').textContent = data?.manufacturer || parsed?.manufacturer || '';
  document.getElementById('result-param-count').textContent = (data?.parameter_count ?? params.length ?? 0).toString();
  document.getElementById('result-category-count').textContent = categories.size.toString();

  renderCategoriesView(parsed);
  const jsonEl = document.getElementById('schema-json-content');
  if (jsonEl) {
    jsonEl.textContent = JSON.stringify(parsed, null, 2);
  }

  showSchemaTab('categories');
}

function renderCategoriesView(schema) {
  const container = document.getElementById('schema-categories');
  if (!container || !schema) return;

  const byCategory = {};
  for (const param of schema.parameters || []) {
    const cat = param.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(param);
  }

  const html = Object.entries(byCategory).map(([category, params]) => `
    <div class="category-section">
      <div class="category-header">
        <h4 class="category-name">${category}</h4>
        <span class="param-count">${params.length} params</span>
      </div>
      <div class="params-grid">
        ${params.map((p) => `
          <div class="param-card">
            <div class="param-top">
              <div class="param-name">${p.name || 'Unnamed'}</div>
              ${p.type ? `<div class="param-type">${p.type}</div>` : ''}
            </div>
            ${p.description ? `<div class="param-desc">${p.description}</div>` : ''}
            <div class="param-meta">
              ${p.min !== undefined && p.max !== undefined ? `<span class="param-range">${p.min} – ${p.max}</span>` : ''}
              ${p.cc ? `<span class="param-chip">CC ${p.cc}</span>` : ''}
              ${p.nrpn ? `<span class="param-chip">NRPN ${p.nrpn}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = html || '<p class="schemas-empty">No parameters found.</p>';
}

async function loadMySchemas() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const container = document.getElementById('schemas-list');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    const schemas = await res.json();

    if (!schemas.length) {
      container.innerHTML = '<p class="schemas-empty">No schemas yet. Upload a manual to get started!</p>';
      setAuthVisibility(true);
      return;
    }

    container.innerHTML = schemas.map((s) => `
      <div class="schema-card" data-id="${s.id}">
        <div class="schema-info">
          <span class="schema-manufacturer">${s.manufacturer}</span>
          <span class="schema-name">${s.synth_name}</span>
        </div>
        <div class="schema-meta">
          <span class="schema-patches">${s.patch_count || 0} patches</span>
          <span class="schema-visibility">${s.is_public ? 'Public' : 'Private'}</span>
        </div>
      </div>
    `).join('');
    setAuthVisibility(true);
  } catch (err) {
    console.error('Failed to load schemas:', err);
  }
}

function showSchemaTab(tab) {
  document.querySelectorAll('.schema-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  document.querySelectorAll('.schema-content').forEach((content) => {
    content.classList.toggle('hidden', content.id !== `schema-${tab}`);
  });
}

function resetExtractor() {
  clearFile();
  extractedSchema = null;
  document.getElementById('step-result')?.classList.add('hidden');
  document.getElementById('step-processing')?.classList.add('hidden');
  document.getElementById('step-upload')?.classList.remove('hidden');
  showSchemaTab('categories');
}

function saveSchema() {
  if (!extractedSchema) {
    alert('No schema to save yet.');
    return;
  }

  const parsed = extractedSchema.schema || extractedSchema;
  const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = `${parsed.manufacturer || 'synth'}-${parsed.synth_name || 'schema'}.json`.replace(/\s+/g, '-');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
