/**
 * Centrale instellingen. Gebruikers passen `/config.js` (in de hoofdmap) aan;
 * dit bestand vult ontbrekende waarden aan met standaardwaarden.
 */

const user = /** @type {any} */ (window);

/** Basis-URL van de RDW Open Data (Socrata) API. */
export const RDW_BASE = user.RDW_BASE || 'https://opendata.rdw.nl/resource/';

/** Optioneel Socrata app token voor hogere rate limits. */
export const RDW_APP_TOKEN = user.RDW_APP_TOKEN || '';

/**
 * Instellingen voor de optionele lokale AI (Ollama).
 * @type {{enabled: boolean, url: string, model: string, keepAlive: string, numCtx: number, think?: string|boolean}}
 */
export const AI = {
  enabled: true,
  url: 'http://localhost:11434',
  model: 'gpt-oss:20b',
  keepAlive: '30m',
  numCtx: 8192,
  ...(user.CHECKAPK_AI || {}),
};

/** Redeneerniveau voor gpt-oss ('low' | 'medium' | 'high'); andere modellen krijgen niets mee. */
export const AI_THINK = AI.think !== undefined ? AI.think : (/^gpt-oss/.test(AI.model) ? 'medium' : undefined);

/** Minimaal aantal auto's in een vergelijkgroep voordat die als betrouwbaar geldt. */
export const MIN_PEER_GROUP = 30;

/** Aantal kentekens in de steekproef voor APK-statistieken van een model. */
export const DEFECT_SAMPLE_SIZE = 250;
