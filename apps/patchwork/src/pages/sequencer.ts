import { layout } from '../components/layout';

export function sequencerPage(): string {
  return layout(
    {
      title: 'Sequencer',
      description: 'Step sequencer and pattern creator with MIDI output',
    },
    `
    <section class="tool-page">
      <div class="tool-header">
        <div class="tool-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="14" width="3" height="6" rx="0.5"/>
            <rect x="8" y="10" width="3" height="10" rx="0.5"/>
            <rect x="13" y="6" width="3" height="14" rx="0.5"/>
            <rect x="18" y="12" width="3" height="8" rx="0.5"/>
          </svg>
        </div>
        <h1>Sequencer</h1>
        <p class="tool-header-description">
          Step sequencer and pattern creator. Build sequences and send them to your hardware via MIDI.
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
            The Sequencer is under active development. Soon you'll be able to:
          </p>
          <ul class="feature-list">
            <li>Create step sequences with velocity and gate control</li>
            <li>Build polyrhythmic patterns with multiple tracks</li>
            <li>Send sequences to hardware synths via Web MIDI</li>
            <li>Share and remix sequences with shareable links</li>
          </ul>
        </div>
      </div>
    </section>
    `
  );
}
