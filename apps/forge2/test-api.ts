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
    default:
      console.log('Usage: npx tsx test-api.ts [speech|image|compose] [args]');
  }
}

main().catch(console.error);
