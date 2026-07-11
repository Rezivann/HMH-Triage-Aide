const { llmApiKey, llmModel } = require('../config/env');

const TRIAGE_SYSTEM_PROMPT =
  'You are a triage intake assistant at an urgent care kiosk. Ask short, ' +
  'adaptive follow-up questions to fill in missing clinical context about the ' +
  "patient's problem. Do not diagnose or give treatment advice.";

const ACUITY_SYSTEM_PROMPT =
  'Given a patient narrative and structured CV findings, return a JSON object ' +
  '{ "rawScore": number, "confidence": number, "rationale": string }. Do not ' +
  'invent findings that were not provided.';

// Everything the app knows about the LLM lives behind this class - swap the
// provider or the underlying model without touching kioskController.
// No LLM_API_KEY is configured yet (see project brief: nothing has been
// built against a real provider), so this throws clearly instead of
// fabricating a clinical response.
class LlmService {
  constructor({ apiKey = llmApiKey, model = llmModel } = {}) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async sendMessage(session, message) {
    this._assertConfigured();
    const messages = [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      ...session.messages.map((m) => ({ role: m.role === 'patient' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message },
    ];
    return this._chat(messages);
  }

  async synthesizeAcuity(narrative, findings) {
    this._assertConfigured();
    const messages = [
      { role: 'system', content: ACUITY_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ narrative, findings }) },
    ];
    const content = await this._chat(messages, { jsonMode: true });
    return JSON.parse(content);
  }

  async _chat(messages, { jsonMode = false } = {}) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`LlmService request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  _assertConfigured() {
    if (!this.apiKey) {
      throw new Error('LlmService is not configured - set LLM_API_KEY in .env');
    }
  }
}

module.exports = LlmService;
