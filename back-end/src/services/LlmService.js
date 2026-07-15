const { llmApiKey, llmModel, llmApiVersion } = require('../config/env');
const acuityPolicyStore = require('../controllers/fakeAcuityPolicyStore');

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const TRIAGE_SYSTEM_PROMPT =
  'You are a triage intake assistant at an urgent care kiosk. Ask exactly ONE short, ' +
  'specific question per turn - your reply must contain a single question mark, asking ' +
  'about exactly one thing. Never join two questions with "and"/"or", and never ask about ' +
  'a second topic in the same message even if related. Be efficient: gather only the ' +
  'clinical context genuinely needed - most patients need 3-5 questions, and you must ' +
  'never ask more than 7 total. Do not diagnose or give treatment advice.\n\n' +
  'At every turn, before anything else, check whether the patient has described a ' +
  'very high-risk, potentially life-threatening presentation - examples include severe ' +
  'difficulty breathing, chest pain with other cardiac symptoms, uncontrolled or severe ' +
  'bleeding, signs of stroke, unresponsiveness or fainting, anaphylaxis/severe allergic ' +
  'reaction, or the patient saying someone is dying or bleeding out. If so, immediately ' +
  'stop intake - do not ask any more questions and do not continue toward a photo. Set ' +
  'status to "emergency" and your reply must tell them to go to the front desk right now ' +
  'and that a staff member will meet them there. This overrides every other instruction ' +
  'in this prompt, including mid-conversation.\n\n' +
  'Early on, reason about whether this presentation has a visually inspectable component ' +
  '(a wound, rash, swelling, deformity, bleeding, or anything else a camera could usefully ' +
  'show) versus something purely internal with nothing to see (e.g. stomach pain, ' +
  'headache, chest pain, nausea, dizziness). Let that judgment shape your questions - do ' +
  'not ask questions that only make sense if you were expecting a photo (like wound size ' +
  'or bleeding) for a purely internal complaint.\n\n' +
  'Never request a photo of a private body area - genitals, breasts, or buttocks - ' +
  'regardless of how visually inspectable the issue there is. Always set status to ' +
  '"ready_no_photo" for these, and rely on the patient\'s verbal description alone; this is ' +
  'for patient privacy and dignity, not a judgment about clinical usefulness.\n\n' +
  'Once you have gathered enough clinical context, do not move to "ready_for_photo" or ' +
  '"ready_no_photo" yet if you do not already have the patient\'s name (patientFirstName/ ' +
  'patientLastInitial both still null) - first, in that same reply, briefly acknowledge ' +
  'you have what you need and ask for their first name and the first letter of their last ' +
  'name (e.g. "Ivan R.") as the true last question, keeping status "asking" for this turn. ' +
  'Asking for the name last (not first) means a genuine emergency is never delayed behind ' +
  'a name question, and lets the patient read your clinical wrap-up at their own pace while ' +
  'they answer, rather than a name Q&A pushing that message later. Once given, parse out ' +
  'patientFirstName and patientLastInitial (a single capitalized letter) - this does not ' +
  'count toward the question budget above. Only once you have both the clinical context ' +
  'AND the name should you actually set status to "ready_for_photo" (tell the patient in ' +
  'your reply that you are ready to take a look at a photo) if a photo would help, or ' +
  '"ready_no_photo" (tell the patient in your reply that you have enough information and ' +
  'are ready to proceed without a photo) if nothing here is visually inspectable. Until ' +
  'both conditions hold, set status to "asking" - unless the emergency check above fires, ' +
  'which takes priority over all of this (and over the name question - never ask for a ' +
  'name before flagging an emergency).\n\n' +
  'At every turn, also assess whether a telehealth (video call) visit could reasonably ' +
  'substitute for this in-person visit - true for things like medication questions, ' +
  'follow-ups, prescription refill concerns, or mild symptoms that do not need a hands-on ' +
  'exam or in-person treatment. False for anything involving active bleeding, an open ' +
  'wound needing care, suspected fracture/deformity, or anything already flagged ' +
  '"emergency" - those need to be seen in person. Set telehealthViable accordingly on ' +
  'every turn, even while still "asking" (your best guess so far, refined as you learn more).';

const INTAKE_TOOL = {
  name: 'submit_intake_turn',
  description: 'Submit the next message to send the patient, and whether intake is complete.',
  input_schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description:
          'The single next message to send the patient - either exactly one follow-up ' +
          'question, or (once status is not "asking") a short message telling them what ' +
          'happens next. If status is "emergency", this must tell them to go to the front ' +
          'desk immediately.',
      },
      status: {
        type: 'string',
        enum: ['asking', 'ready_for_photo', 'ready_no_photo', 'emergency'],
        description:
          '"asking" to keep gathering context with one more question, INCLUDING while you ' +
          'have enough clinical context but still need to ask for the patient\'s name (the ' +
          'true last question) - never set a "ready_*" status with patientFirstName/ ' +
          'patientLastInitial still null. "ready_for_photo" once you have both enough ' +
          'context AND the patient\'s name, AND this presentation has something visually ' +
          'inspectable a photo would help with, AND that is not on a private body area ' +
          '(genitals, breasts, buttocks). "ready_no_photo" once you have both enough context ' +
          'AND the patient\'s name, AND either this presentation is purely internal with ' +
          'nothing a photo could show, or it involves a private body area. "emergency" the ' +
          'moment the patient describes a very high-risk, potentially life-threatening ' +
          'presentation - takes priority over every other status (and over needing a name), ' +
          'even mid-conversation with no further questions asked, and skips any photo ' +
          'entirely.',
      },
      telehealthViable: {
        type: 'boolean',
        description:
          'Whether a telehealth (video call) visit could reasonably substitute for seeing ' +
          'this patient in person, based on what they have said so far.',
      },
      patientFirstName: {
        type: ['string', 'null'],
        description:
          'The patient\'s first name, parsed from their answer to the name question - ' +
          'null until asked and answered.',
      },
      patientLastInitial: {
        type: ['string', 'null'],
        description:
          'A single capitalized letter - the first letter of the patient\'s last name, ' +
          'parsed from their answer to the name question - null until asked and answered.',
      },
    },
    required: ['reply', 'status', 'telehealthViable', 'patientFirstName', 'patientLastInitial'],
  },
};

const ACUITY_SYSTEM_PROMPT =
  'You are assisting emergency triage. Acuity is scored 0-1000, where 1000 ' +
  'represents a patient at the brink of death. Given a patient narrative and, when ' +
  'available, structured CV findings from a wound photo, choose the single category ' +
  'that best matches this presentation, then submit a bounded adjustment reflecting ' +
  'anything about this specific narrative that makes it more or less severe than a ' +
  'typical case in that category. CV findings will be null for purely internal ' +
  'presentations with no photo (e.g. abdominal pain) - assess those from the narrative ' +
  'alone. The category baseline and decay rate are fixed clinical policy on the 0-1000 ' +
  'scale - you are never asked for and must never invent a raw numeric score. Do not ' +
  'invent findings that were not provided.';

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

  // Returns { reply, status, telehealthViable, patientFirstName,
  // patientLastInitial }, status one of 'asking' | 'ready_for_photo' |
  // 'ready_no_photo' | 'emergency'. Forced tool-use (not free-text) so this
  // is structured rather than parsed out of prose - same pattern
  // synthesizeAcuity/classify_findings already use.
  async sendMessage(session, message) {
    this._assertConfigured();
    const messages = [
      ...session.messages.map((m) => ({ role: m.role === 'patient' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message },
    ];
    return this._request({ system: TRIAGE_SYSTEM_PROMPT, messages, tool: INTAKE_TOOL });
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
