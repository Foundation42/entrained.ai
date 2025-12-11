import { layout } from '../components/layout';

export function patchDesignerPage(): string {
  return layout(
    {
      title: 'Patch Designer',
      description: 'AI-assisted synthesizer patch design tool',
    },
    `
    <section class="tool-page patch-designer-page">
      <div class="tool-header">
        <div class="tool-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="6" cy="6" r="2"/>
            <circle cx="18" cy="6" r="2"/>
            <circle cx="6" cy="18" r="2"/>
            <circle cx="18" cy="18" r="2"/>
            <path d="M6 8v2a4 4 0 004 4h4a4 4 0 004-4V8"/>
            <path d="M6 16v-2"/>
            <path d="M18 16v-2"/>
          </svg>
        </div>
        <h1>Patch Designer</h1>
        <p class="tool-header-description">
          Describe a sound in natural language and let AI design the patch for your synth.
        </p>
      </div>

      <!-- Auth gate -->
      <div id="designer-auth-gate" class="auth-gate">
        <p>You need to be logged in to design patches.</p>
        <button class="btn btn-primary" onclick="showAuthModal('login')">Log in to continue</button>
      </div>

      <div id="designer-ui" class="designer-layout hidden">
        <!-- Left panel: Synth selector and prompt -->
        <div class="designer-input-panel">
          <div class="panel-section">
            <label for="synth-select" class="panel-label">Select Synthesizer</label>
            <select id="synth-select" class="select-input">
              <option value="">Loading your synths...</option>
            </select>
            <p id="synth-info" class="synth-info"></p>
          </div>

          <div class="panel-section">
            <label for="sound-prompt" class="panel-label">Describe Your Sound</label>
            <textarea
              id="sound-prompt"
              class="prompt-input"
              placeholder="e.g., A warm, unstable Boards of Canada style pad with detuned oscillators and subtle modulation..."
              rows="4"
            ></textarea>
            <div class="prompt-suggestions">
              <span class="suggestion-label">Try:</span>
              <button class="suggestion-chip" data-prompt="A thick, aggressive bass with lots of drive and sub harmonics">Aggressive bass</button>
              <button class="suggestion-chip" data-prompt="A dreamy, evolving pad with slow filter movement and chorus">Dreamy pad</button>
              <button class="suggestion-chip" data-prompt="A punchy, percussive pluck with fast decay and resonance">Punchy pluck</button>
              <button class="suggestion-chip" data-prompt="An unstable, detuned lead with vibrato and tape-like wobble">Wobbly lead</button>
            </div>
          </div>

          <button id="generate-btn" class="btn btn-primary btn-full" disabled>
            <span class="btn-text">Generate Patch</span>
            <span class="btn-loading hidden">
              <svg class="spinner" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round"/>
              </svg>
              Designing...
            </span>
          </button>

          <div id="generate-error" class="error-message hidden"></div>
        </div>

        <!-- Right panel: Generated patch output -->
        <div class="designer-output-panel">
          <div id="output-empty" class="output-empty">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <h3>Ready to Design</h3>
            <p>Select a synth and describe the sound you want to create.</p>
          </div>

          <div id="output-result" class="output-result hidden">
            <div class="patch-header">
              <div>
                <h3 id="patch-name" class="patch-name">Patch Name</h3>
                <p id="patch-synth" class="patch-synth"></p>
              </div>
              <div class="patch-actions">
                <button id="save-patch-btn" class="btn btn-ghost">Save Patch</button>
                <button id="copy-patch-btn" class="btn btn-ghost">Copy JSON</button>
              </div>
            </div>

            <div id="patch-explanation" class="patch-explanation"></div>

            <div class="patch-parameters">
              <h4>Parameter Values</h4>
              <div id="patch-params-list" class="params-list"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Saved patches section -->
      <div id="saved-patches-section" class="saved-patches-section hidden">
        <h3>Your Saved Patches</h3>
        <div id="saved-patches-list" class="saved-patches-list"></div>
      </div>
    </section>

    <script src="/patch-designer.js"></script>
    `
  );
}
