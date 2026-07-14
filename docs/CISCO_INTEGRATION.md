# Cisco integration

Four Cisco technologies are part of this pitch. Three are application-layer
integrations with real (if currently stubbed) code in this repo. The fourth,
Cisco ISE, is network-layer and has no code footprint here at all - it's
included below for architecture/pitch completeness, not because there's
anything in this repo to point at.

## Status summary

| Technology | Layer | Status | Blocked on |
|---|---|---|---|
| Cisco Duo | App (SSO) | Dev-login stub - `back-end/src/middleware/nurseAuth.js` | A real Duo tenant/credentials |
| Webex Contact Center | App (API) | Stub that throws `not yet provisioned` - `back-end/src/services/ContactCenterService.js` | A real Webex CC tenant |
| Webex AI Agent Studio (voice) | App (webhook) | Demo built (browser Web Speech API); real webhook receiver already live at `POST /voice/message` | A real Agent Studio tenant to point at it |
| Cisco ISE | Network (NAC) | Design only, this doc | A real ISE deployment + hospital network hardware |

## Duo, Webex CC, Agent Studio

See the relevant source files above for what's built and what's left - each
throws a clear, loud error rather than faking a response, so it's obvious at
a glance which integrations are real versus provisioned. `voiceAuth.js` is
the one exception worth a special note: it's a placeholder shared-secret
scheme, not Agent Studio's actual webhook-signing contract, since that isn't
known without a real tenant to inspect.

## Cisco ISE - intended design

**Goal:** only the kiosk devices can reach the LLMTriage backend, and the
kiosks can reach *nothing else* on the hospital network - not the EHR, not
other clinical systems, not each other. This is enforced entirely on the
network (switches, wireless controllers, ISE's policy engine) before a
kiosk's traffic ever reaches this application - there is no code in this
repo that implements or calls into it.

### Device authentication (getting onto the network at all)

- **802.1X (EAP-TLS), preferred**: each kiosk carries a device certificate
  (issued from ISE's internal CA or the hospital's existing PKI). When a
  kiosk connects to a switch port or associates to the kiosk Wi-Fi SSID, it
  authenticates via EAP-TLS against ISE acting as the RADIUS server.
  Certificate-based, not a shared secret - nothing to leak or rotate across
  a device fleet the way a pre-shared key would need.
- **MAB (MAC Authentication Bypass), fallback**: for any kiosk hardware/OS
  that can't run an 802.1X supplicant, ISE authenticates against a
  pre-registered MAC address allowlist instead. Weaker (MAC addresses can be
  spoofed) - paired with ISE device profiling (DHCP fingerprinting, HTTP
  User-Agent, traffic behavior) as a second signal that a device claiming to
  be "a kiosk" actually behaves like one.

### Authorization (what an authenticated kiosk can reach)

Once authenticated, ISE assigns the kiosk a dedicated Security Group Tag
(SGT) via TrustSec. Downstream switches/routers enforce Security Group ACLs
(SGACLs) scoped to that SGT: permit only the LLMTriage backend's IP:port
(plus DNS/NTP), deny everything else on the hospital LAN by default. This is
the actual mechanism behind "only kiosks can talk to the network" - read
literally, the real requirement is symmetric: only kiosks can reach the app,
and kiosks can reach only the app.

Kiosks would sit on their own dedicated VLAN/subnet, separate from general
hospital IT and clinical device VLANs, with SGACL enforcement at the
distribution switch (or a TrustSec-aware firewall at the VLAN boundary).

### Relationship to this app's existing `kioskAuth.js`

ISE and the app's own device API key (`KIOSK_API_KEY_SECRET`,
`kioskAuth.js`) are complementary, not redundant - they enforce at different
layers:

- **ISE** stops a device from ever reaching the backend's IP/port at all if
  it isn't an authenticated kiosk.
- **`kioskAuth.js`** stops a device that *is* already on the kiosk network
  segment (e.g. a compromised or rogue device that somehow got onto that
  VLAN) from making valid API calls without the correct signed key.

Neither one substitutes for the other - losing either layer still leaves the
other in place.

### What's genuinely out of scope for this repo

All of the above is hospital network infrastructure - switch configuration,
wireless LAN controller configuration, and ISE policy sets - owned by
whoever runs the hospital's actual network, configured against a real ISE
deployment and real switch/AP hardware neither of which exist yet for this
project. The one piece that touches an actual kiosk device (its OS-level
802.1X supplicant configuration, e.g. installing a device certificate and
configuring EAP-TLS on a Windows kiosk's network adapter) is device
provisioning/imaging, not application code - it belongs to whatever process
stands up the physical kiosk hardware, not this Git repository.
