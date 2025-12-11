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

            <!-- MIDI Send Section -->
            <div id="midi-section" class="midi-section hidden">
              <div class="midi-header">
                <div class="midi-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                    <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="10" r="1.5" fill="currentColor"/>
                    <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
                    <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
                    <circle cx="14" cy="14" r="1.5" fill="currentColor"/>
                  </svg>
                </div>
                <div class="midi-title">
                  <span>Send to Synth</span>
                  <span id="midi-status" class="midi-status">No devices</span>
                </div>
              </div>
              <div class="midi-controls">
                <select id="midi-output-select" class="select-input midi-select">
                  <option value="">Select MIDI output...</option>
                </select>
                <button id="send-midi-btn" class="btn btn-primary" disabled>
                  <span class="btn-text">Send Patch</span>
                  <span class="btn-loading hidden">
                    <svg class="spinner" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round"/>
                    </svg>
                    Sending...
                  </span>
                </button>
              </div>
              <div id="midi-progress" class="midi-progress hidden">
                <div class="progress-bar">
                  <div id="midi-progress-fill" class="progress-fill"></div>
                </div>
                <span id="midi-progress-text" class="progress-text">0 / 0</span>
              </div>
              <div id="midi-error" class="error-message hidden"></div>
              <div id="midi-success" class="success-message hidden"></div>

              <!-- TODO: REMOVE - Patch naming via SysEx is more complex than anticipated.
                   Most synths require full patch dump read-modify-write, not a simple name command.
                   This should be part of a proper Patch Librarian feature later. -->
              <div id="patch-naming-section" class="patch-naming-section hidden">
                <div class="naming-header">
                  <span class="naming-label">Update Synth Display</span>
                  <span id="naming-status" class="naming-status">Checking...</span>
                </div>
                <div class="naming-controls">
                  <span id="naming-info" class="naming-info"></span>
                  <button id="send-name-btn" class="btn btn-ghost btn-sm" disabled>
                    Send Name
                  </button>
                </div>
                <div id="naming-error" class="error-message hidden"></div>
                <div id="naming-success" class="success-message hidden"></div>
              </div>
            </div>

            <div id="midi-unsupported" class="midi-unsupported hidden">
              <p>Web MIDI not supported. Use Chrome or Edge to send patches directly to your synth.</p>
            </div>

            <div id="patch-explanation" class="patch-explanation"></div>

            <div class="patch-parameters">
              <h4>Parameter Values</h4>
              <div id="patch-params-list" class="params-list"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Patch Library Section - shown on page load -->
      <div id="patch-library-section" class="patch-library-section hidden">
        <div class="library-header">
          <h3>Your Patch Library</h3>
          <div class="library-filters">
            <select id="library-synth-filter" class="select-input select-small">
              <option value="">All Synths</option>
            </select>
          </div>
        </div>
        <div id="patch-library-list" class="patch-library-list">
          <p class="library-empty">No patches yet. Design your first one above!</p>
        </div>
      </div>
    </section>

    <script src="/midi.js"></script>
    <script src="/patch-designer.js"></script>
    `
  );
}
