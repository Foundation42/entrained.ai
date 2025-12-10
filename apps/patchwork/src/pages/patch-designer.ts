import { layout } from '../components/layout';

export function patchDesignerPage(): string {
  return layout(
    {
      title: 'Patch Designer',
      description: 'AI-assisted synthesizer patch design tool',
    },
    `
    <section class="tool-page">
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
          Visual patch design with AI assistance. Create, document, and share synthesizer patches.
        </p>
      </div>

      <div class="placeholder-content">
        <div class="placeholder-box">
          <div class="placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 6v6l4 2"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <h2>Coming Soon</h2>
          <p>
            The Patch Designer is under active development. Soon you'll be able to:
          </p>
          <ul class="feature-list">
            <li>Design patches visually with a modular interface</li>
            <li>Get AI suggestions for sound design</li>
            <li>Export patches to your Sequential Pro 3 and other synths via SysEx</li>
            <li>Share your patches with a simple URL</li>
          </ul>
        </div>
      </div>
    </section>
    `
  );
}
