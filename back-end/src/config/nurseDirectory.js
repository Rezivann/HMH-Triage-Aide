// Stand-in for a real nurse/identity directory. Duo only confirms *who*
// someone is (via their enrolled device) - it has no concept of which
// hospital locations a nurse is allowed to see, so that mapping has to live
// somewhere on this side. Keyed by the identity claim DuoAuthService reads
// off the verified ID token (email, falling back to preferred_username/sub).
//
// Add a real nurse by adding a line here and redeploying.
const NURSE_SITE_ACCESS = {
  // 'nurse@hospital.example': ['loc-1'],
};

function lookupSiteAccess(identity) {
  return NURSE_SITE_ACCESS[identity] || null;
}

module.exports = { lookupSiteAccess };
