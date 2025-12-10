// Synth visualization page
const API_BASE = '/api/schema';

let schemas = [];
let currentSchema = null;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkSynthAuth, 50);
  setupTabs();
});

window.recheckSynthAuth = checkSynthAuth;

function checkSynthAuth() {
  const token = localStorage.getItem('auth_token');
  const gate = document.getElementById('synths-auth-gate');
  const ui = document.getElementById('synths-ui');

  if (token) {
    gate?.classList.add('hidden');
    ui?.classList.remove('hidden');
    loadSchemas();
  } else {
    gate?.classList.remove('hidden');
    ui?.classList.add('hidden');
  }
}

async function loadSchemas() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load schemas');

    schemas = await res.json();
    renderSchemaList();
  } catch (err) {
    console.error('Failed to load schemas', err);
  }
}

function renderSchemaList() {
  const container = document.getElementById('synths-list');
  if (!container) return;

  if (!schemas.length) {
    container.innerHTML = '<p class="schemas-empty">No schemas yet. Upload a manual to get started!</p>';
    return;
  }

  container.innerHTML = schemas.map((s) => `
    <div class="schema-card" data-id="${s.id}" onclick="openSchema('${s.id}')">
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
}

window.openSchema = openSchema;
async function openSchema(id) {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    showAuthModal('login');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load schema');
    }

    currentSchema = data;
    renderSchemaDetail(data);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
}

function renderSchemaDetail(schema) {
  const parsed = schema.schema_json || schema.schema || schema;
  if (!parsed) return;

  const headerName = `${schema.manufacturer} ${schema.synth_name}`;
  document.getElementById('detail-name').textContent = headerName;
  const descParts = [];
  if (parsed.description) descParts.push(parsed.description);
  if (parsed.version) descParts.push(`v${parsed.version}`);
  if (schema.created_at) descParts.push(`Created ${formatDate(schema.created_at)}`);
  descParts.push(schema.is_public ? 'Public' : 'Private');
  document.getElementById('detail-meta').textContent = descParts.join(' · ');

  const params = parsed.parameters || [];
  const categories = new Set(params.map((p) => p.category || 'Uncategorized'));
  document.getElementById('detail-param-count').textContent = params.length.toString();
  document.getElementById('detail-category-count').textContent = categories.size.toString();

  renderFlowDiagram(parsed);
  renderCategoriesView(parsed);
  const jsonEl = document.getElementById('schema-json-content');
  if (jsonEl) jsonEl.textContent = JSON.stringify(parsed, null, 2);
  showSchemaTab('flow');
}

function formatDate(seconds) {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function setupTabs() {
  document.querySelectorAll('.schema-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) {
        showSchemaTab(tab);
      }
    });
  });
}

function showSchemaTab(tab) {
  document.querySelectorAll('.schema-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.schema-content').forEach((content) => {
    content.classList.toggle('hidden', content.id !== `schema-${tab}`);
  });
}

function renderCategoriesView(schema) {
  const container = document.getElementById('schema-categories');
  if (!container) return;

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

function renderFlowDiagram(schema) {
  const container = document.getElementById('flow-diagram');
  if (!container) return;
  container.innerHTML = '';

  const sections = buildSections(schema);
  if (!sections.length) {
    container.innerHTML = '<p class="schemas-empty">No parameters to visualize.</p>';
    return;
  }

  // Layout constants
  const MODULES_PER_ROW = 4;
  const nodeWidth = 240;
  const nodeHeight = 120;
  const hGap = 40;  // horizontal gap between modules
  const vGap = 60;  // vertical gap between rows
  const padding = 40;

  // Split sections into rows
  const rows = [];
  for (let i = 0; i < sections.length; i += MODULES_PER_ROW) {
    rows.push(sections.slice(i, i + MODULES_PER_ROW));
  }

  // Calculate SVG dimensions
  const maxModulesInRow = Math.max(...rows.map(r => r.length));
  const width = maxModulesInRow * (nodeWidth + hGap) + padding * 2;
  const height = rows.length * (nodeHeight + vGap) + padding * 2;
  const svg = createSvg(width, height);

  // Add arrow marker
  svg.appendChild(makeMarker(svg));

  // Draw each row
  rows.forEach((row, rowIdx) => {
    const y = padding + rowIdx * (nodeHeight + vGap);

    row.forEach((section, colIdx) => {
      const x = padding + colIdx * (nodeWidth + hGap);
      const node = drawNode(section, x, y, nodeWidth, nodeHeight);
      svg.appendChild(node);

      // Draw horizontal arrow to next module in same row
      if (colIdx < row.length - 1) {
        const x2 = x + nodeWidth + hGap;
        const arrow = drawArrow(
          x + nodeWidth,
          y + nodeHeight / 2,
          x2,
          y + nodeHeight / 2
        );
        svg.appendChild(arrow);
      }
      // Draw connecting arrow to next row
      else if (rowIdx < rows.length - 1) {
        const nextRow = rows[rowIdx + 1];
        const nextY = y + nodeHeight + vGap;
        const nextX = padding;

        // Vertical line down
        const centerX = x + nodeWidth / 2;
        const midY = y + nodeHeight + vGap / 2;

        const line1 = drawArrow(
          centerX,
          y + nodeHeight,
          centerX,
          midY,
          true // no arrowhead on first segment
        );
        svg.appendChild(line1);

        // Horizontal line to start of next row
        const line2 = drawArrow(
          centerX,
          midY,
          nextX,
          midY,
          true // no arrowhead on middle segment
        );
        svg.appendChild(line2);

        // Vertical line to first module of next row
        const line3 = drawArrow(
          nextX,
          midY,
          nextX,
          nextY + nodeHeight / 2
        );
        svg.appendChild(line3);
      }
    });
  });

  container.appendChild(svg);
}

function buildSections(schema) {
  const params = schema.parameters || [];
  const archFlow = schema.architecture?.signal_flow;
  const archModules = schema.architecture?.modules || [];

  if (archFlow && archFlow.length) {
    return archFlow.map((label) => {
      const module = archModules.find((m) => (m.label || '').toLowerCase() === label.toLowerCase());
      const categories = module?.categories || [label];
      const count = params.filter((p) => categories.some((cat) => (p.category || '').includes(cat) || (p.name || '').includes(cat))).length;
      return {
        id: module?.id || label.toLowerCase().replace(/\s+/g, '-'),
        label: module?.label || label,
        count: count || (module?.controls?.length || 0) || 0,
      };
    });
  }

  const sectionDefs = [
    { id: 'osc', label: 'Oscillators', categories: ['Oscillator', 'Oscillator 1', 'Oscillator 2', 'Oscillator 3'] },
    { id: 'mixer', label: 'Mixer', categories: ['Mixer'] },
    { id: 'filter', label: 'Filters', categories: ['Filter'] },
    { id: 'env', label: 'Envelopes', categories: ['Filter Envelope', 'Amplifier Envelope', 'Auxiliary Envelope 1', 'Auxiliary Envelope 2'] },
    { id: 'lfo', label: 'LFOs', categories: ['LFO', 'LFO 1', 'LFO 2', 'LFO 3'] },
    { id: 'fx', label: 'FX', categories: ['Effects', 'Distortion', 'Tuned Feedback'] },
    { id: 'ctrl', label: 'Control', categories: ['Arpeggiator', 'Sequencer', 'Glide', 'Misc'] },
  ];

  const sections = sectionDefs.map((def) => {
    const matched = params.filter((p) => def.categories.some((cat) => (p.category || '').includes(cat)));
    return { ...def, count: matched.length };
  }).filter((s) => s.count > 0);

  const others = params.filter((p) => !sections.some((s) => s.categories.some((cat) => (p.category || '').includes(cat))));
  if (others.length) {
    sections.push({ id: 'other', label: 'Other', count: others.length, categories: [] });
  }

  return sections;
}

function createSvg(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.classList.add('flow-svg');
  return svg;
}

function makeMarker(svg) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L0,6 L6,3 z');
  path.setAttribute('fill', 'currentColor');
  marker.appendChild(path);
  defs.appendChild(marker);
  return defs;
}

function drawArrow(x1, y1, x2, y2, noArrowhead = false) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1.toString());
  line.setAttribute('y1', y1.toString());
  line.setAttribute('x2', x2.toString());
  line.setAttribute('y2', y2.toString());
  line.setAttribute('stroke', 'var(--border-accent)');
  line.setAttribute('stroke-width', '2');
  if (!noArrowhead) {
    line.setAttribute('marker-end', 'url(#arrow)');
  }
  line.setAttribute('opacity', '0.8');
  return line;
}

function drawNode(section, x, y, width, height) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x.toString());
  rect.setAttribute('y', y.toString());
  rect.setAttribute('rx', '10');
  rect.setAttribute('ry', '10');
  rect.setAttribute('width', width.toString());
  rect.setAttribute('height', height.toString());
  rect.setAttribute('fill', 'var(--bg-card)');
  rect.setAttribute('stroke', 'var(--border-accent)');
  rect.setAttribute('stroke-width', '1.5');
  g.appendChild(rect);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.textContent = section.label;
  title.setAttribute('x', (x + width / 2).toString());
  title.setAttribute('y', (y + 34).toString());
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'node-title');
  g.appendChild(title);

  const count = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  count.textContent = `${section.count} params`;
  count.setAttribute('x', (x + width / 2).toString());
  count.setAttribute('y', (y + 60).toString());
  count.setAttribute('text-anchor', 'middle');
  count.setAttribute('class', 'node-count');
  g.appendChild(count);

  return g;
}
