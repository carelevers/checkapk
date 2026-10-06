/** Laag 2 van "Vraag het": verbinding met een lokale AI via Ollama (https://ollama.com). */
import { AI, AI_THINK } from '../config.js';

/** @typedef {{role: 'system'|'user'|'assistant', content: string}} Message */

const options = () => ({ temperature: 0, num_ctx: AI.numCtx });

/** @type {Promise<{ok: boolean, reason?: string}>|null} */
let statusPromise = null;

/** Draait Ollama en is het ingestelde model geïnstalleerd? (één keer gecontroleerd) */
export function checkAI() {
  if (!AI.enabled) return Promise.resolve({ ok: false, reason: 'uitgeschakeld' });
  if (!statusPromise) {
    statusPromise = (async () => {
      try {
        const res = await fetch(AI.url + '/api/tags', { signal: AbortSignal.timeout(2000) });
        const names = ((await res.json()).models || []).map((m) => m.name);
        const wanted = AI.model.includes(':') ? [AI.model] : [AI.model, AI.model + ':latest'];
        return names.some((n) => wanted.includes(n)) ? { ok: true } : { ok: false, reason: `model "${AI.model}" niet geïnstalleerd` };
      } catch {
        return { ok: false, reason: 'Ollama niet bereikbaar' };
      }
    })();
  }
  return statusPromise;
}

/** @type {Promise<boolean>|null} */
let warmPromise = null;

/** Laadt het model alvast in het geheugen, zodat de eerste vraag niet op het laden wacht. */
export function warmUp() {
  if (!warmPromise) {
    warmPromise = fetch(AI.url + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI.model, keep_alive: AI.keepAlive, options: options() }),
    }).then((r) => r.ok, () => false);
  }
  return warmPromise;
}

/**
 * Chat met het model.
 * @param {Message[]} messages
 * @param {{format?: object, timeoutMs?: number, onToken?: (text: string, thinking: boolean) => void}} [opts]
 *   format: JSON-schema voor gestructureerde uitvoer; onToken: streamt het antwoord woord voor woord
 * @returns {Promise<string>} het volledige antwoord
 */
export async function chat(messages, opts = {}) {
  const { format, timeoutMs = 120000, onToken } = opts;
  /** @type {Record<string, any>} */
  const body = { model: AI.model, stream: !!onToken, messages, format, keep_alive: AI.keepAlive, options: options() };
  if (AI_THINK !== undefined) body.think = AI_THINK;
  const res = await fetch(AI.url + '/api/chat', {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('AI gaf ' + res.status);
  if (!onToken || !res.body) return ((await res.json()).message || {}).content || '';

  // Ollama streamt één JSON-object per regel
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = JSON.parse(line).message || {};
      if (m.content) { text += m.content; onToken(text, false); }
      else if (m.thinking) onToken(text, true);
    }
  }
  return text;
}
