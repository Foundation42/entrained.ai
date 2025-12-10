import { layout } from '../components/layout';

export function landingPage(): string {
  return layout(
    {
      title: 'Home',
      description: 'Patchwork - Web-based MIDI and synthesis tools for patch design, sequencing, and experimentation',
    },
    `
    <section class="hero">
      <h1 class="hero-title">
        <span class="hero-accent">Patchwork</span>
      </h1>
      <p class="hero-tagline">Web-based tools for synthesists</p>
      <p class="hero-description">
        Design patches, create sequences, and experiment with MIDI—all in your browser.
        Connect your hardware synths via Web MIDI and share your creations with a link.
      </p>
    </section>

    <section class="tools-grid">
      <a href="/schema-extractor" class="tool-card">
        <div class="tool-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8"/>
            <path d="M16 17H8"/>
            <path d="M10 9H8"/>
          </svg>
        </div>
        <h2 class="tool-title">Schema Extractor</h2>
        <p class="tool-description">
          Upload a synth manual and extract a structured parameter schema using AI.
        </p>
        <span class="tool-status">Live</span>
      </a>

      <a href="/patch-designer" class="tool-card">
        <div class="tool-icon">
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
        <h2 class="tool-title">Patch Designer</h2>
        <p class="tool-description">
          Visual patch design with AI assistance. Create, document, and share synthesizer patches.
        </p>
        <span class="tool-status">Coming Soon</span>
      </a>

      <a href="/sequencer" class="tool-card">
        <div class="tool-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="14" width="3" height="6" rx="0.5"/>
            <rect x="8" y="10" width="3" height="10" rx="0.5"/>
            <rect x="13" y="6" width="3" height="14" rx="0.5"/>
            <rect x="18" y="12" width="3" height="8" rx="0.5"/>
          </svg>
        </div>
        <h2 class="tool-title">Sequencer</h2>
        <p class="tool-description">
          Step sequencer and pattern creator. Build sequences and send them to your hardware via MIDI.
        </p>
        <span class="tool-status">Coming Soon</span>
      </a>
    </section>

    <section class="features">
      <h2 class="section-title">Built for Hardware</h2>
      <div class="features-grid">
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h3>Web MIDI</h3>
          <p>Direct connection to your synths, no plugins required</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <h3>Shareable Links</h3>
          <p>Share patches and sequences with a single URL</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8"/>
              <path d="M12 17v4"/>
            </svg>
          </div>
          <h3>Browser-Based</h3>
          <p>No downloads, no installs—just open and create</p>
        </div>
      </div>
    </section>
    `
  );
}
