import { layout } from '../components/layout';

export function synthsPage(): string {
  return layout(
    {
      title: 'My Synths',
      description: 'Browse and visualize your extracted synth schemas',
    },
    `
    <section class="tool-page">
      <div class="tool-header">
        <div class="tool-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 7h16M4 12h16M4 17h16"/>
            <rect x="4" y="5" width="16" height="14" rx="2"/>
          </svg>
        </div>
        <h1>My Synths</h1>
        <p class="tool-header-description">
          See your extracted synthesizer schemas and visualize the signal flow.
        </p>
      </div>

      <!-- Auth gate -->
      <div id="synths-auth-gate" class="auth-gate">
        <p>You need to be logged in to view your synths.</p>
        <button class="btn btn-primary" onclick="showAuthModal('login')">Log in to continue</button>
      </div>

      <div id="synths-ui" class="synths-layout hidden">
        <div class="synths-list-panel">
          <div class="panel-header">
            <div>
              <h3>My Schemas</h3>
              <p class="panel-subtitle">Select a synth to view its architecture.</p>
            </div>
            <a class="btn btn-ghost" href="/schema-extractor">Extract another</a>
          </div>
          <div id="synths-list" class="schemas-list">
            <p class="schemas-empty">No schemas yet. Upload a manual to get started!</p>
          </div>
        </div>

        <div class="synths-detail-panel">
          <div class="detail-header">
            <div>
              <p class="detail-label">Selected synth</p>
              <h2 id="detail-name">Pick a synth</h2>
              <p id="detail-meta" class="detail-meta"></p>
            </div>
            <div class="detail-stats">
              <div class="stat">
                <span class="stat-label">Parameters</span>
                <span id="detail-param-count" class="stat-value">0</span>
              </div>
              <div class="stat">
                <span class="stat-label">Categories</span>
                <span id="detail-category-count" class="stat-value">0</span>
              </div>
            </div>
          </div>

          <div class="schema-tabs">
            <button class="schema-tab active" data-tab="flow">Flow</button>
            <button class="schema-tab" data-tab="list">List</button>
            <button class="schema-tab" data-tab="json">Raw JSON</button>
          </div>

          <div id="schema-flow" class="schema-content">
            <div id="flow-diagram" class="flow-diagram">
              <p class="schemas-empty">Select a synth to see its architecture.</p>
            </div>
            <div id="module-detail" class="module-detail hidden"></div>
          </div>
          <div id="schema-list" class="schema-content hidden">
            <div id="schema-categories" class="schema-categories"></div>
          </div>
          <div id="schema-json" class="schema-content hidden">
            <pre><code id="schema-json-content"></code></pre>
          </div>
        </div>
      </div>
    </section>

    <script src="/synths.js"></script>
    `
  );
}
