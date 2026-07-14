const { openaiApiKey } = require('../config/env');

// Fallback speech-to-text for browsers with no SpeechRecognition API (Webex
// Desk's RoomOS browser) - the client records raw audio and sends it here
// instead of getting a transcript client-side. Separate provider from
// LlmService (Anthropic) since Claude has no audio-input modality.
class TranscriptionService {
  constructor({ apiKey = openaiApiKey } = {}) {
    this.apiKey = apiKey;
  }

  async transcribe(audioBuffer, mimeType) {
    if (!this.apiKey) {
      throw new Error('TranscriptionService is not configured - set OPENAI_API_KEY in .env');
    }

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio');
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Whisper transcription failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.text;
  }
}

module.exports = TranscriptionService;
