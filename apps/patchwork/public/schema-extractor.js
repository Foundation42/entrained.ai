// Schema Extractor client-side logic
const API_BASE = '/api/schema';

let selectedFile = null;
let extractedSchema = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupDropZone();
  loadMySchemas();
});

function checkAuth() {
  const token = localStorage.getItem('auth_token');
  const authGate = document.getElementById('auth-gate');
  const extractorUI = document.getElementById('extractor-ui');

  if (token) {
    authGate.classList.add('hidden');
    extractorUI.classList.remove('hidden');
  } else {
    authGate.classList.remove('hidden');
    extractorUI.classList.add('hidden');
  }
}

function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    dropZone.addEventListener(event, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  ['dragenter', 'dragover'].forEach(event => {
    dropZone.addEventListener(event, () => dropZone.classList.add('drag-over'));
  });

  ['dragleave', 'drop'].forEach(event => {
    dropZone.addEventListener(event, () => dropZone.classList.remove('drag-over'));
  });

  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  // Validate file type
  const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
  const validExtensions = ['.pdf', '.txt', '.md'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
    alert('Please upload a PDF or text file');
    return;
  }

  // Validate size (20MB max)
  if (file.size > 20 * 1024 * 1024) {
    alert('File too large. Maximum size is 20MB.');
    return;
  }

  selectedFile = file;
  showFilePreview(file);
}

function showFilePreview(file) {
  const dropZone = document.getElementById('drop-zone');
  const preview = document.getElementById('file-preview');
  const extractBtn = document.getElementById('extract-btn');

  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatSize(file.size);

  dropZone.classList.add('hidden');
  preview.classList.remove('hidden');
  extractBtn.classList.remove('hidden');
}

function clearFile() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('extract-btn').classList.add('hidden');
}

async function startExtraction() {
  if (!selectedFile) return;

  const token = localStorage.getItem('auth_token');
  if (!token) {
    showAuthModal('login');
    return;
  }

  // Show processing state
  document.getElementById('step-upload').classList.add('hidden');
  document.getElementById('step-processing').classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.details || 'Extraction failed');
    }

    extractedSchema = data;
    showResult(data);
    loadMySchemas(); // Refresh list

  } catch (err) {
    alert('Extraction failed: ' + err.message);
    resetExtractor();
  }
}

function showResult(data) {
  document.getElementById('step-processing').classList.add('hidden');
  document.getElementById('step-result').classList.remove('hidden');

  document.getElementById('result-synth-name').textContent = data.synth_name;
  document.getElementById('result-manufacturer').textContent = data.manufacturer;
  document.getElementById('result-param-count').textContent = data.parameter_count;
  document.getElementById('result-category-count').textContent = data.categories.length;

  // Render categories view
  renderCategoriesView(data.schema);

  // Render JSON view
  document.getElementById('schema-json-content').textContent =
    JSON.stringify(data.schema, null, 2);
}

function renderCategoriesView(schema) {
  const container = document.getElementById('schema-categories');
  const byCategory = {};

  schema.parameters.forEach(param => {
    if (!byCategory[param.category]) {
      byCategory[param.category] = [];
    }
    byCategory[param.category].push(param);
  });

  container.innerHTML = Object.entries(byCategory).map(([category, params]) => `
    <div class="category-section">
      <h4 class="category-name">${escapeHtml(category)} <span class="category-count">(${params.length})</span></h4>
      <div class="params-grid">
        ${params.map(p => `
          <div class="param-card">
            <div class="param-name">${escapeHtml(p.name)}</div>
            <div class="param-type">${p.type}</div>
            ${p.min !== null && p.max !== null ? `
              <div class="param-range">${p.min} – ${p.max}</div>
            ` : ''}
            ${p.values ? `
              <div class="param-values">${p.values.slice(0, 3).join(', ')}${p.values.length > 3 ? '...' : ''}</div>
            ` : ''}
            ${p.cc ? `<div class="param-cc">CC ${p.cc}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function showSchemaTab(tab) {
  document.querySelectorAll('.schema-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.schema-content').forEach(c => c.classList.add('hidden'));

  document.querySelector(`.schema-tab[onclick*="${tab}"]`).classList.add('active');
  document.getElementById(`schema-${tab}`).classList.remove('hidden');
}

function saveSchema() {
  // Schema is already saved during extraction, just show success
  alert('Schema saved successfully!');
  resetExtractor();
}

function resetExtractor() {
  selectedFile = null;
  extractedSchema = null;

  document.getElementById('file-input').value = '';
  document.getElementById('step-upload').classList.remove('hidden');
  document.getElementById('step-processing').classList.add('hidden');
  document.getElementById('step-result').classList.add('hidden');

  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('extract-btn').classList.add('hidden');
}

async function loadMySchemas() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    const schemas = await res.json();
    renderMySchemas(schemas);

  } catch (err) {
    console.error('Failed to load schemas:', err);
  }
}

function renderMySchemas(schemas) {
  const container = document.getElementById('schemas-list');

  if (!schemas.length) {
    container.innerHTML = '<p class="schemas-empty">No schemas yet. Upload a manual to get started!</p>';
    return;
  }

  container.innerHTML = schemas.map(s => `
    <a href="/schema/${s.id}" class="schema-card">
      <div class="schema-info">
        <span class="schema-name">${escapeHtml(s.synth_name)}</span>
        <span class="schema-manufacturer">${escapeHtml(s.manufacturer)}</span>
      </div>
      <div class="schema-meta">
        <span class="schema-patches">${s.patch_count || 0} patches</span>
        <span class="schema-date">${formatDate(s.created_at)}</span>
      </div>
    </a>
  `).join('');
}

// Utilities
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Make functions available globally
window.clearFile = clearFile;
window.startExtraction = startExtraction;
window.showSchemaTab = showSchemaTab;
window.saveSchema = saveSchema;
window.resetExtractor = resetExtractor;
