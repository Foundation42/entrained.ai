import { Hono } from 'hono';
import { landingPage } from './pages/landing';
import { patchDesignerPage } from './pages/patch-designer';
import { sequencerPage } from './pages/sequencer';

const app = new Hono();

app.get('/', (c) => c.html(landingPage()));
app.get('/patch-designer', (c) => c.html(patchDesignerPage()));
app.get('/sequencer', (c) => c.html(sequencerPage()));

export default app;
