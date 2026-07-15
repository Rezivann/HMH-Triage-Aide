const { cvServiceUrl } = require('../config/env');

// Thin HTTP client for ml-service (Python/FastAPI, GPU-backed, never runs
// on-device). Wraps the 2-stage pipeline so kioskController never talks to
// ml-service directly - swap FastAPI routes, or the whole CV backend, for
// Cogniac later without touching the controller. Field shapes here match
// ml-service/app/models/schemas.py exactly - see FindingsRequest there if
// either side ever needs updating. No segmentation model in this pipeline -
// woundBox is exactly the patient's own drawn box, passed straight through.
class CvServiceClient {
  constructor({ baseUrl = cvServiceUrl } = {}) {
    this.baseUrl = baseUrl;
  }

  // Stage 1 - blur check. { valid: false, failReasons } means the frontend
  // should prompt a retake; nothing else runs.
  async validateCapture(imageRef) {
    return this._post('/capture/validate', { imageRef });
  }

  // Stage 2 - Claude vision findings, using the patient's own drawn wound
  // box (mandatory - see front-end's WoundBoxSelector.jsx) as a spatial hint.
  async classifyFindings(imageRef, woundBox) {
    return this._post('/capture/findings', { imageRef, woundBox });
  }

  // Dev-only "use a test image" flow (see kioskController's test-images
  // routes) - ml-service 404s /test-images entirely in production (see
  // ml-service/app/main.py), so these two calls only ever succeed locally.
  async listTestImages() {
    return this._get('/test-images');
  }

  async getTestImage(filename) {
    return this._get(`/test-images/${encodeURIComponent(filename)}`);
  }

  async _get(path) {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`CvServiceClient ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
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
