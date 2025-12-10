import { layout } from '../components/layout';

export function schemaExtractorPage(): string {
  return layout(
    {
      title: 'Schema Extractor',
      description: 'Extract synthesizer parameter schemas from manuals using AI',
    },
    `
    <section class="tool-page">
      <div class="tool-header">
        <div class="tool-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8"/>
            <path d="M16 17H8"/>
            <path d="M10 9H8"/>
          </svg>
        </div>
        <h1>Schema Extractor</h1>
        <p class="tool-header-description">
          Upload a synthesizer manual (PDF or text) and let AI extract a structured parameter schema.
        </p>
      </div>

      <!-- Auth gate -->
      <div id="auth-gate" class="auth-gate">
        <p>You need to be logged in to extract schemas.</p>
        <button class="btn btn-primary" onclick="showAuthModal('login')">Log in to continue</button>
      </div>

      <!-- Extractor UI (hidden until auth) -->
      <div id="extractor-ui" class="extractor-ui hidden">
        <!-- Step 1: Upload -->
        <div id="step-upload" class="extractor-step">
          <div class="drop-zone" id="drop-zone">
            <div class="drop-zone-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p class="drop-zone-text">Drop your synth manual here</p>
            <p class="drop-zone-hint">PDF or text file, max 20MB</p>
            <input type="file" id="file-input" accept=".pdf,.txt,.md" hidden>
            <button class="btn btn-ghost" onclick="document.getElementById('file-input').click()">
              Or browse files
            </button>
          </div>
          <div id="file-preview" class="file-preview hidden">
            <div class="file-info">
              <span class="file-name" id="file-name"></span>
              <span class="file-size" id="file-size"></span>
            </div>
            <button class="btn btn-ghost" onclick="clearFile()">Remove</button>
          </div>
          <button id="extract-btn" class="btn btn-primary btn-full hidden" onclick="startExtraction()">
            Extract Schema
          </button>
        </div>

        <!-- Step 2: Processing -->
        <div id="step-processing" class="extractor-step hidden">
          <div class="processing-indicator">
            <div class="spinner"></div>
            <p>Analyzing document with Gemini...</p>
            <p class="processing-hint">This may take 30-60 seconds for large manuals</p>
          </div>
        </div>

        <!-- Step 3: Result -->
        <div id="step-result" class="extractor-step hidden">
          <div class="result-header">
            <div class="result-info">
              <h2 id="result-synth-name"></h2>
              <p id="result-manufacturer"></p>
            </div>
            <div class="result-stats">
              <span class="stat"><strong id="result-param-count">0</strong> parameters</span>
              <span class="stat"><strong id="result-category-count">0</strong> categories</span>
            </div>
          </div>

          <div class="schema-preview">
            <div class="schema-tabs">
              <button class="schema-tab active" onclick="showSchemaTab('categories')">By Category</button>
              <button class="schema-tab" onclick="showSchemaTab('json')">Raw JSON</button>
            </div>
            <div id="schema-categories" class="schema-content"></div>
            <div id="schema-json" class="schema-content hidden">
              <pre><code id="schema-json-content"></code></pre>
            </div>
          </div>

          <div class="result-actions">
            <button class="btn btn-primary" onclick="saveSchema()">Save Schema</button>
            <button class="btn btn-ghost" onclick="resetExtractor()">Extract Another</button>
          </div>
        </div>

        <!-- My Schemas -->
        <div id="my-schemas" class="my-schemas">
          <h3>My Schemas</h3>
          <div id="schemas-list" class="schemas-list">
            <p class="schemas-empty">No schemas yet. Upload a manual to get started!</p>
          </div>
        </div>
      </div>
    </section>

    <script src="/schema-extractor.js"></script>
    `
  );
}
