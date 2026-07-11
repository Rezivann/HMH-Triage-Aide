const { webexCcClientId, webexCcClientSecret, webexCcOrgId } = require('../config/env');

// Webex Contact Center integration. No tenant is provisioned yet, so every
// network-calling method throws clearly instead of no-op'ing - a missing
// integration should fail loud, not silently pretend a contact was queued.
class ContactCenterService {
  constructor({ clientId = webexCcClientId, clientSecret = webexCcClientSecret, orgId = webexCcOrgId } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.orgId = orgId;
  }

  // Creates a Webex CC contact at intake completion, carrying findings
  // summary / photo ref / kioskId as CAD variables.
  async queueContact({ sessionId, locationId, rawScore, cadVariables }) {
    this._assertConfigured();
    throw new Error('ContactCenterService.queueContact: Webex CC tenant not yet provisioned');
  }

  // Formal nurse claim -> Webex CC queue-to-agent assignment.
  async queueToAgent({ contactId, nurseId }) {
    this._assertConfigured();
    throw new Error('ContactCenterService.queueToAgent: Webex CC tenant not yet provisioned');
  }

  async getQueueStatus({ locationId }) {
    this._assertConfigured();
    throw new Error('ContactCenterService.getQueueStatus: Webex CC tenant not yet provisioned');
  }

  _assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.orgId) {
      throw new Error('ContactCenterService is not configured - set WEBEX_CC_* in .env');
    }
  }

  // Maps our 0-100ish rawScore onto Webex CC's 1-10 priority field (1 =
  // most urgent in CC's convention). This is a quantized byproduct for CC
  // routing only - the real ranking authority is always utils/queueSort.js.
  static scorePriority(rawScore) {
    const clamped = Math.max(0, Math.min(100, rawScore));
    return 10 - Math.round((clamped / 100) * 9);
  }
}

module.exports = ContactCenterService;
