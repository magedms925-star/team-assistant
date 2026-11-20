// A local stand-in for the Gateway's AI default route and members list, so the
// suites can exercise successful model calls. It never reaches a real provider.
const script = `
const calls = [];
let aiOn = true;
let replies = 0;
const LANDING = (headline) => '<!doctype html><html><body><h1>' + headline + '</h1><p>Sourdough, rye and seeded loaves from our oven on Mill Lane.</p></body></html>';
function reply(body) {
  const messages = body.messages ?? [];
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\\n');
  const users = messages.filter((m) => m.role === 'user');
  const last = String(users.at(-1)?.content ?? '');
  const lower = last.toLowerCase();
  if (body.max_tokens === 1) return 'ok';
  if (/Write a short title/.test(system)) {
    if (lower.includes('bread')) return 'Weekend bread menu';
    if (lower.includes('supplier')) return 'Supplier questions';
    return last.split(/\\s+/).slice(0, 3).join(' ');
  }
  if (lower.includes('headline')) {
    return 'I changed the headline.\\n\\n<artifact identifier="bakery-landing" type="html" title="Bakery landing page">\\n' + LANDING('Baked before sunrise') + '\\n</artifact>';
  }
  if (lower.includes('landing page')) {
    return 'Here is a first draft of the page.\\n\\n<artifact identifier="bakery-landing" type="html" title="Bakery landing page">\\n' + LANDING('Fresh loaves every morning') + '\\n</artifact>';
  }
  replies += 1;
  return 'Draft ' + replies + ': Saturday brings country sourdough and cinnamon buns; Sunday brings rye, focaccia and a seeded loaf.';
}
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/__calls') return Response.json(calls);
  if (url.pathname === '/__mode') { aiOn = (await request.json()).ai === 'on'; return Response.json({ aiOn }); }
  const body = request.method === 'GET' ? null : await request.text();
  calls.push({ method: request.method, path: url.pathname, body });
  if (url.pathname === '/api/integrations/members/list') {
    return Response.json({ members: [
      { id: 'owner', email: 'owner@example.test', name: 'Olivia Baker', role: 'owner' },
      { id: 'member', email: 'member@example.test', name: 'Sam Rivera', role: 'member' },
    ] });
  }
  if (url.pathname === '/api/ai/default/v1/chat/completions') {
    if (!aiOn) {
      const code = 'ai_default_not_configured';
      return Response.json({ error: 'Service Unavailable', code, message: 'No default model is set.', setup: 'Choose a default AI model in your Gateway.' }, { status: 503, headers: { 'x-everyapp-error': code } });
    }
    const content = reply(JSON.parse(body));
    return Response.json({ id: 'cmpl-' + calls.length, object: 'chat.completion', created: 0, model: 'local-test', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  }
  const code = 'integration_not_configured';
  return Response.json({ error: 'Service Unavailable', code, message: 'Not configured here.' }, { status: 503, headers: { 'x-everyapp-error': code } });
} };`;

export const fakeGatewayOptions = {
  bindings: { EVERY_APP_GATEWAY: { type: 'worker', worker: 'fake-gateway' } },
  workers: [{ config: { name: 'fake-gateway', compatibilityDate: '2025-01-01', manifest: { mainModule: 'fake.mjs', modules: { 'fake.mjs': { type: 'esm', contents: script } } } } }],
};

async function fake(runtime) {
  return runtime.mf.getWorker('fake-gateway');
}

/** The model calls the app made, each as its parsed request body. */
export async function modelCalls(runtime) {
  const all = await (await (await fake(runtime)).fetch('http://fake/__calls')).json();
  return all.filter((c) => c.path.endsWith('/chat/completions')).map((c) => JSON.parse(c.body));
}

/** Everything the model was given in one call, as one string. */
export function callText(call) {
  return call.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

export async function setModel(runtime, on) {
  await (await fake(runtime)).fetch('http://fake/__mode', { method: 'POST', body: JSON.stringify({ ai: on ? 'on' : 'off' }) });
}

/** Rewrites a server function call's payload, to send another person's id as if it were one's own. */
export async function rewriteServerCalls(page, from, to) {
  await page.route('**/_serverFn/**', async (route) => {
    const request = route.request();
    const data = request.postData();
    const url = request.url().replaceAll(encodeURIComponent(from), encodeURIComponent(to)).replaceAll(from, to);
    await route.continue({ url, ...(data ? { postData: data.replaceAll(from, to) } : {}) });
  });
}
