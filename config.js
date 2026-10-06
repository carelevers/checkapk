/* Optionele instellingen.
 * Een (gratis) Socrata app token geeft hogere rate limits:
 * https://opendata.rdw.nl/profile/edit/developer_settings */
window.RDW_APP_TOKEN = '';

/* Lokale AI voor "Vraag het" (optioneel), via Ollama: https://ollama.com
 * Installeer Ollama en daarna het model, bijv.:  ollama pull gpt-oss:20b
 * - gpt-oss:20b  ±13 GB, slimst; prettig vanaf 32 GB werkgeheugen
 * - qwen2.5:7b   ±5 GB,  goede middenweg (16 GB werkgeheugen)
 * - qwen2.5:3b   ±2 GB,  snelst
 * Zonder Ollama werkt "Vraag het" ook, dan met de ingebouwde vraagherkenning. */
window.CHECKAPK_AI = {
  enabled: true,
  url: 'http://localhost:11434',
  model: 'gpt-oss:20b',
};
