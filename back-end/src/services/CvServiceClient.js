const { cvServiceUrl } = require('../config/env');

// Thin HTTP client for ml-service (Python/FastAPI, GPU-backed, never runs
// on-device). Wraps the 3-stage pipeline so kioskController never talks to
// ml-service directly - swap FastAPI routes, or the whole CV backend, for
// Cogniac later without touching the controller.
class CvServiceClient {
  constructor({ baseUrl = cvServiceUrl } = {}) {
    this.baseUrl = baseUrl;
  }

  // Stage 1 - blur/nail-present/wound-in-frame. { valid: false, failReasons }
  // means the frontend should prompt a retake; nothing else runs.
  async validateCapture(imageRef) {
    return this._post('/capture/validate', { imageRef });
  }

  // Stage 2 - nail segmentation, scale factor, wound area range (core/extended).
  async measure(imageRef) {
    return this._post('/capture/measure', { imageRef });
  }

  // Stage 3 - independent binary finding classifiers + wound type + confidenceMeta.
  async classifyFindings(imageRef) {
    return this._post('/capture/findings', { imageRef });
  }

  async _post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`CvServiceClient ${path} failed: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }
}

module.exports = CvServiceClient;
