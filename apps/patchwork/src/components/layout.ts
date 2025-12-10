export interface LayoutOptions {
  title: string;
  description?: string;
}

export function layout(options: LayoutOptions, content: string): string {
  const { title, description = 'Web-based MIDI and synthesis tools' } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description}">
  <title>${title} | Patchwork</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <nav class="nav">
    <a href="/" class="nav-logo">
      <span class="logo-icon">◈</span>
      <span class="logo-text">Patchwork</span>
    </a>
    <div class="nav-links">
      <a href="/patch-designer">Patch Designer</a>
      <a href="/sequencer">Sequencer</a>
    </div>
  </nav>
  <main>
    ${content}
  </main>
  <footer class="footer">
    <p>Built for synthesists by <a href="https://entrained.ai">entrained.ai</a></p>
  </footer>
</body>
</html>`;
}
