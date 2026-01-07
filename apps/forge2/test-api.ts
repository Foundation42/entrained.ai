/**
 * Quick API test script
 * Run with: npx tsx test-api.ts
 */

const BASE_URL = 'https://forge2.divine-cell-b9ef.workers.dev';

async function testSpeech() {
  console.log('Testing speech generation...');

  const response = await fetch(`${BASE_URL}/api/generate/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Hello! Welcome to Forge 2.0, your conversational asset workspace!',
      options: { voice: 'nova' }
    })
  });

  const result = await response.json();
  console.log('Speech result:', result);
  return result;
}

async function testImage() {
  console.log('Testing image generation...');

  const response = await fetch(`${BASE_URL}/api/generate/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'A friendly robot waving hello, cartoon style'
    })
  });

  const result = await response.json();
  console.log('Image result:', result);
  return result;
}

async function testCompose(fileId: string) {
  console.log(`Testing compose with ${fileId}...`);

  const response = await fetch(`${BASE_URL}/api/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'test-bundle',
      description: 'Test bundle',
      files: [fileId]
    })
  });

  const result = await response.json();
  console.log('Compose result:', result);
  return result;
}

async function testCssForComponent() {
  console.log('=== Testing AI-assisted composition ===\n');

  // Step 1: Generate a component with rich metadata
  console.log('Step 1: Generating component with css_classes metadata...');
  const componentResponse = await fetch(`${BASE_URL}/api/generate/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'A notification badge component that shows a count with optional pulse animation',
      file_type: 'tsx',
      hints: {
        style: 'modern, animated'
      }
    })
  });

  const component = await componentResponse.json() as {
    id: string;
    canonical_name: string;
    metadata?: { css_classes?: string[] }
  };
  console.log('Component generated:', component.id);
  console.log('CSS classes used:', component.metadata?.css_classes);

  if (!component.metadata?.css_classes?.length) {
    console.error('ERROR: Component has no css_classes!');
    return;
  }

  // Step 2: Generate CSS that matches those classes
  console.log('\nStep 2: Generating CSS that matches component classes...');
  const cssResponse = await fetch(`${BASE_URL}/api/generate/css-for-component`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      component_id: component.id,
      style: 'glassmorphic with animated gradients'
    })
  });

  const css = await cssResponse.json() as {
    id: string;
    classes_defined?: string[];
    classes_requested?: string[];
    missing_classes?: string[];
    content?: string;
    error?: string;
  };

  if (css.error) {
    console.error('CSS generation error:', css.error);
    return;
  }

  console.log('CSS generated:', css.id);
  console.log('Classes requested:', css.classes_requested);
  console.log('Classes defined:', css.classes_defined);
  console.log('Missing classes:', css.missing_classes);

  if (css.content) {
    console.log('\n--- Generated CSS (first 1000 chars) ---');
    console.log(css.content.slice(0, 1000));
    if (css.content.length > 1000) console.log('...(truncated)');
  }

  // Step 3: Compose them together
  console.log('\nStep 3: Composing component + CSS...');
  const composeResponse = await fetch(`${BASE_URL}/api/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'badge-with-styles',
      description: 'Notification badge with matching CSS',
      files: [component.id, css.id]
    })
  });

  const composed = await composeResponse.json() as { id?: string; preview_url?: string; error?: string };

  if (composed.error) {
    console.error('Compose error:', composed.error);
    return;
  }

  console.log('\nComposed result:', composed.id);
  console.log('Preview URL:', composed.preview_url);

  return { component, css, composed };
}

async function main() {
  const args = process.argv.slice(2);
  const test = args[0] || 'speech';

  switch (test) {
    case 'speech':
      await testSpeech();
      break;
    case 'image':
      await testImage();
      break;
    case 'compose':
      await testCompose(args[1] || 'a-button-with-label-and-onclick-handler@latest');
      break;
    case 'css-for-component':
      await testCssForComponent();
      break;
    default:
      console.log('Usage: npx tsx test-api.ts [speech|image|compose|css-for-component] [args]');
  }
}

main().catch(console.error);
