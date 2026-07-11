const { llmApiKey, llmModel, llmApiVersion } = require('../config/env');
const acuityPolicyStore = require('../controllers/fakeAcuityPolicyStore');

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const TRIAGE_SYSTEM_PROMPT =
  'You are a triage intake assistant at an urgent care kiosk. Ask short, ' +
  'adaptive follow-up questions to fill in missing clinical context about the ' +
  "patient's problem. Do not diagnose or give treatment advice.";

const ACUITY_SYSTEM_PROMPT =
  'You are assisting emergency triage. Acuity is scored 0-1000, where 1000 ' +
  'represents a patient at the brink of death. Given a patient narrative and ' +
  'structured CV findings, choose the single category that best matches this ' +
  'presentation, then submit a bounded adjustment reflecting anything about ' +
  'this specific narrative that makes it more or less severe than a typical ' +
  'case in that category. The category baseline and decay rate are fixed ' +
  'clinical policy on the 0-1000 scale - you are never asked for and must ' +
  'never invent a raw numeric score. Do not invent findings that were not provided.';

// Everything the app knows about the LLM lives behind this class - swap the
// provider or the underlying model without touching kioskController.
// No LLM_API_KEY is configured yet (see project brief: nothing has been
// built against a real provider), so this throws clearly instead of
// fabricating a clinical response.
class LlmService {
  constructor({ apiKey = llmApiKey, model = llmModel, apiVersion = llmApiVersion } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.apiVersion = apiVersion;
  }

  async sendMessage(session, message) {
    this._assertConfigured();
    const messages = [
      ...session.messages.map((m) => ({ role: m.role === 'patient' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message },
    ];
    return this._request({ system: TRIAGE_SYSTEM_PROMPT, messages });
  }

  // Returns { rawScore, category, adjustment, confidence, rationale }.
  // rawScore is computed here from the policy's baseline for the category
  // Claude picked plus its bounded adjustment - never taken directly from
  // the model, so a policy edit in fakeAcuityPolicyStore.js takes effect on
  // the next call without any prompt or parsing change.
  async synthesizeAcuity(narrative, findings) {
    this._assertConfigured();

    const policy = acuityPolicyStore.getPolicy();
    const categoryKeys = Object.keys(policy.categories);
    const adjustmentRange = policy.adjustmentRange;

    const tool = {
      name: 'submit_acuity_assessment',
      description: 'Submit the structured acuity assessment for this patient.',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: categoryKeys,
            description: 'Best-matching clinical category for this presentation.',
          },
          adjustment: {
            type: 'integer',
            minimum: -adjustmentRange,
            maximum: adjustmentRange,
            description:
              `Bounded ${-adjustmentRange} to ${adjustmentRange} nudge for narrative-specific ` +
              'severity within the category - not a replacement for the category baseline.',
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
        },
        required: ['category', 'adjustment', 'confidence', 'rationale'],
      },
    };

    const messages = [{ role: 'user', content: JSON.stringify({ narrative, findings }) }];

    const assessment = await this._request({ system: ACUITY_SYSTEM_PROMPT, messages, tool });

    // Falls back to 'unclassified' if the model somehow returns a category
    // outside the enum (schema-enforced tool calls should prevent this, but
    // the fallback matches queueSort.js's own unclassified handling).
    const category = policy.categories[assessment.category] ? assessment.category : 'unclassified';
    const baseline = policy.categories[category].baselineScore;

    // Clamped again here even though the schema already bounds it - the
    // model's output is never trusted as authoritative arithmetic, only as
    // a category pick and a bounded nudge.
    const adjustment = Math.max(-adjustmentRange, Math.min(adjustmentRange, assessment.adjustment));

    return {
      rawScore: baseline + adjustment,
      category,
      adjustment,
      confidence: assessment.confidence,
      rationale: assessment.rationale,
    };
  }

  async _request({ system, messages, tool }) {
    const body = { model: this.model, max_tokens: 1024, system, messages };
    if (tool) {
      body.tools = [tool];
      body.tool_choice = { type: 'tool', name: tool.name };
    }

    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`LlmService request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();

    if (tool) {
      const toolUse = data.content.find((block) => block.type === 'tool_use');
      if (!toolUse) {
        throw new Error('LlmService: expected a tool_use block in the response');
      }
      return toolUse.input;
    }

    return data.content.find((block) => block.type === 'text')?.text ?? '';
  }

  _assertConfigured() {
    if (!this.apiKey) {
      throw new Error('LlmService is not configured - set LLM_API_KEY in .env');
    }
  }
}

module.exports = LlmService;
