// Temporary in-memory stand-in for a persisted, nurse-editable clinical policy.
// Unlike per-session data (now real - see services/SessionStore.js), this is
// global config with no per-patient identity, so there's no natural Mongoose
// model for it yet - replace with a real one if/when policy history/audit
// needs to survive a restart the way session data now does.
//
// Scale: 0-1000, where 1000 represents a patient at the brink of death. Three
// knobs nurses control from the dashboard (dashboardController's
// getAcuityPolicy/updateAcuityPolicy), per category:
//   - baselineScore: severity at intake, before any wait
//   - decayWeightPerMinute: how fast urgency climbs per minute waited
//   - decayCap: the most decay alone can ever add for this category, i.e.
//     even after an infinite wait, decay contribution never exceeds this -
//     a bruise should never drift near "brink of death" purely from sitting
//     in a waiting room, no matter how long
// decayWeightPerMinute is derived as decayCap / (clinically-estimated minutes
// for this category to go untreated from baseline to that category's ceiling)
// - see the per-category comments below. These are starting estimates for a
// demo, not a clinically validated table; a real deployment authors this
// with the hospital's clinical staff, same as the original brief intended
// for decay generally.
//
// A global adjustmentRange also lives here, bounding how far
// LlmService.synthesizeAcuity's Claude call can nudge a category's baseline
// for a specific patient's narrative - Claude picks the category and the
// nudge, never baselineScore/decayWeightPerMinute/decayCap themselves.
const DEFAULT_POLICY = {
  adjustmentRange: 100,
  // Nurse-tunable version of ReviewRoutingService's force-escalate score
  // check - a session whose synthesized rawScore reaches this (from either
  // the photo or no-photo path) skips the queue entirely and force-escalates
  // the patient to the front desk. Independent of the categorical hardFlag
  // escalation (gunshot/DV/pediatric-high-risk), which always fires
  // regardless of this number.
  emergencyScoreThreshold: 700,
  categories: {
    // Uncontrolled active bleeding can be fatal within roughly 30 minutes
    // without intervention (trauma "golden hour" reasoning) - ceiling
    // 750 + 250 = 1000, reached in 30 min -> 250/30.
    active_hemorrhage: {
      label: 'Active bleeding',
      baselineScore: 750,
      decayWeightPerMinute: 8.33,
      decayCap: 250,
    },
    // Open fracture: infection/blood-loss complications can become
    // extremely dangerous over a few hours if untreated - ceiling
    // 550 + 300 = 850 over 240 min (4h) -> 300/240.
    bone_visible: {
      label: 'Bone visible / suspected fracture',
      baselineScore: 550,
      decayWeightPerMinute: 1.25,
      decayCap: 300,
    },
    // Closed deformity/dislocation: secondary complications (e.g.
    // compartment syndrome) build slowly over many hours - ceiling
    // 350 + 150 = 500 over 480 min (8h) -> 150/480.
    deformity: {
      label: 'Deformity',
      baselineScore: 350,
      decayWeightPerMinute: 0.31,
      decayCap: 150,
    },
    // Minor laceration: infection risk only, over a long horizon - ceiling
    // 150 + 60 = 210 over 360 min (6h) -> 60/360.
    laceration_minor: {
      label: 'Minor laceration',
      baselineScore: 150,
      decayWeightPerMinute: 0.17,
      decayCap: 60,
    },
    // Bruise/contusion: essentially never becomes life-threatening from
    // waiting alone - ceiling 60 + 30 = 90 over 480 min (8h) -> 30/480.
    contusion: {
      label: 'Bruise / contusion',
      baselineScore: 60,
      decayWeightPerMinute: 0.06,
      decayCap: 30,
    },
    // Fallback for sessions with no decayCategory assigned yet (e.g. the
    // kiosk's current fake CV result). Erring cautious since the true
    // severity is unknown - ceiling 250 + 250 = 500 over 120 min (2h) ->
    // 250/120.
    unclassified: {
      label: 'Unclassified (fallback)',
      baselineScore: 250,
      decayWeightPerMinute: 2.08,
      decayCap: 250,
    },
    // Internal/non-visible presentations (no photo taken) - severity is
    // judged from the narrative alone, so these are coarser buckets than the
    // wound-photo categories above. Cardiac-pattern chest pain can be fatal
    // within minutes untreated - highest baseline and by far the fastest
    // decay of any category, wound or not - ceiling 800+200=1000 over 10 min
    // -> 200/10.
    possible_cardiac: {
      label: 'Chest pain / possible cardiac',
      baselineScore: 800,
      decayWeightPerMinute: 20,
      decayCap: 200,
    },
    // Severe abdominal pain (e.g. suspected appendicitis/obstruction) -
    // dangerous over hours, not minutes - ceiling 500+200=700 over 180 min
    // (3h) -> 200/180.
    severe_abdominal_pain: {
      label: 'Severe abdominal pain',
      baselineScore: 500,
      decayWeightPerMinute: 1.11,
      decayCap: 200,
    },
    // Mild internal symptoms (nausea, mild headache, etc.) with no red-flag
    // features - similar risk profile to a minor laceration - ceiling
    // 120+50=170 over 360 min (6h) -> 50/360.
    mild_internal_symptom: {
      label: 'Mild internal symptom',
      baselineScore: 120,
      decayWeightPerMinute: 0.14,
      decayCap: 50,
    },
  },
};

let policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
let lastChanged = null;

function getPolicy() {
  return {
    adjustmentRange: policy.adjustmentRange,
    emergencyScoreThreshold: policy.emergencyScoreThreshold,
    categories: policy.categories,
    lastChanged,
  };
}

// Plain { categoryKey: { rate, cap } } map - kept separate from the full
// policy object so utils/queueSort.js can stay pure (no store import) and
// take this as ordinary data, same as it always has.
function getCategoryDecay() {
  return Object.fromEntries(
    Object.entries(policy.categories).map(([key, c]) => [key, { rate: c.decayWeightPerMinute, cap: c.decayCap }])
  );
}

function getCategory(key) {
  return policy.categories[key] || policy.categories.unclassified;
}

// Only patches keys that already exist - a typo'd or unknown category key
// is silently ignored rather than creating a new, unlabeled category.
function updatePolicy({ categories, adjustmentRange, emergencyScoreThreshold, nurseId, note }) {
  if (categories) {
    Object.entries(categories).forEach(([key, patch]) => {
      if (!policy.categories[key]) return;
      policy.categories[key] = { ...policy.categories[key], ...patch };
    });
  }
  if (typeof adjustmentRange === 'number') {
    policy.adjustmentRange = adjustmentRange;
  }
  if (typeof emergencyScoreThreshold === 'number') {
    policy.emergencyScoreThreshold = emergencyScoreThreshold;
  }
  lastChanged = { nurseId, note, at: new Date().toISOString() };
  return getPolicy();
}

module.exports = { getPolicy, getCategoryDecay, getCategory, updatePolicy, DEFAULT_POLICY };
