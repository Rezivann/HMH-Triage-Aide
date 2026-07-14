const { cvServiceUrl } = require('../config/env');

// Thin HTTP client for ml-service (Python/FastAPI, GPU-backed, never runs
// on-device). Wraps the 3-stage pipeline so kioskController never talks to
// ml-service directly - swap FastAPI routes, or the whole CV backend, for
// Cogniac later without touching the controller. Field shapes here match
// ml-service/app/models/schemas.py exactly - see MeasurementRequest/
// FindingsRequest there if either side ever needs updating.
class CvServiceClient {
  constructor({ baseUrl = cvServiceUrl } = {}) {
    this.baseUrl = baseUrl;
  }

  // Stage 1 - blur check. { valid: false, failReasons } means the frontend
  // should prompt a retake; nothing else runs.
  async validateCapture(imageRef) {
    return this._post('/capture/validate', { imageRef });
  }

  // Stage 2 - MedSAM wound segmentation using woundBoxPrompt (mandatory -
  // see front-end's WoundBoxSelector.jsx). No nail/scale step anymore - this
  // pipeline no longer estimates wound area in real-world units at all; the
  // segmentation mask is fed to Claude as a visual overlay instead (Stage 3).
  async measure(imageRef, { woundBoxPrompt }) {
    return this._post('/capture/measure', { imageRef, woundBoxPrompt });
  }

  // Stage 3 - Claude vision findings. Takes the whole Stage 2 result rather
  // than individual fields so a schema change on either side only touches
  // one call site.
  async classifyFindings(imageRef, measurement) {
    return this._post('/capture/findings', {
      imageRef,
      woundBox: measurement.woundBox,
      boundaryCoords: measurement.boundaryCoords,
      measurementConfidence: measurement.confidence,
    });
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
