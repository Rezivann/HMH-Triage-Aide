# HMH Triage Aide — AI-Assisted Urgent-Care Intake and Prioritization System

A multimodal intake platform that combines conversational AI, wound-image analysis, configurable acuity policies, and human clinical oversight to help urgent-care teams identify higher-priority patients sooner.

> [!IMPORTANT]
> HMH Triage Aide is an educational prototype and clinical decision-support concept. It is not a medical device, has not been clinically validated, and is not intended to diagnose patients or replace assessment by a qualified healthcare professional.

## What it does

A patient walks up to a kiosk, describes what's wrong - out loud or by typing - and optionally shows a wound photo. They're placed into a live, continuously re-ranked queue by clinical urgency, not simply by arrival order. A nurse dashboard shows that queue in real time. The patient gets their own link to track status, see an estimated wait, and options like leaving the queue or checking a telehealth alternative.

## Features

### For the patient

* Conversational intake, typed or by voice - one question at a time, only what's clinically necessary (3-5 questions typical)
* A photo step via the patient's own phone (QR code) or the kiosk's camera, with the patient drawing a box around their own wound as the only spatial guide the vision model gets
* A safety check that runs on *every* conversational turn, independent of everything else: a life-threatening description immediately ends intake and sends the patient to the front desk, before a photo or a score is ever computed
* A personal status page: queue position, an estimated wait, a comparison against nearby urgent cares (hardcoded sample data for the demo, not a real facility database), an option to leave the queue, and - when appropriate - a telehealth alternative instead of waiting in person (a placeholder message, not real telehealth routing)
* A human-readable check-in reference (e.g. `IvanR_0001`) instead of a raw database ID

### For the nurse

* A live-ranked queue that re-sorts on its own as clinical urgency evolves over time - no manual refresh needed
* Full override controls: fix a score by hand, guarantee a floor position, or dismiss an automatic safety floor - each one audited with a required reason
* A tunable clinical policy panel - every category's baseline severity, decay rate, and decay ceiling, plus the global emergency threshold, editable live with immediate visual feedback on what would change
* Automatic floor positions for anything the pipeline doesn't trust its own judgment on (a failed capture-quality check, disagreement between models, low confidence) - guaranteed a top-10% slot regardless of computed score

## Design

A few decisions worth knowing about, because they weren't the obvious first answer:

**Three independent safety layers, not one.** Nothing here relies on a single score to catch a dangerous case. Any one of three separate paths is enough to bypass the queue and send a patient straight to the front desk:
- The conversation itself, checked on every turn before anything else (even before the patient's name) - severe difficulty breathing, chest pain with other cardiac symptoms, uncontrolled or severe bleeding, signs of stroke, unresponsiveness or fainting, or anaphylaxis/severe allergic reaction.
- A fixed set of categorical red flags from the photo, independent of any score - gunshot wound, suspected domestic violence, or a high-risk pediatric presentation.
- The synthesized acuity score itself crossing a clinical threshold, whether or not a photo was ever taken.

**The model never invents a number.** An LLM picks a clinical *category* and a small, bounded adjustment within it - never a raw severity score. The category's baseline, its decay behavior over time, and the adjustment's bounds are clinical policy, editable by a nurse, not the model. Decay is capped per category, so a bruise can never drift toward "brink of death" purely from sitting in a waiting room, no matter how long.

**No segmentation model.** An earlier version used a wound-segmentation model to compute area. It was replaced with something simpler and more reliable: a local image-quality check, then the patient's own hand-drawn box as the only spatial hint, handed to a vision model alongside the full, unaltered photo.

**Ask the identifying question last, not first.** A first name and last initial - just enough to turn a database ID into something a nurse can actually read - is asked for *after* the clinical picture is gathered, not before. A genuine emergency is never delayed behind small talk, and the patient gets to read the intake's conclusion at their own pace while they answer, rather than that message flashing by right before an automatic timer moves them along.

**Two independent voice paths.** Not every browser exposes the same speech APIs. Where live speech recognition is available, it runs entirely client-side. Where it isn't (notably Safari and some embedded kiosk browsers), a recording gets sent to a transcription service instead. Same conversation, same downstream logic, either way.

## How it's built

Three independent services:

* **A React/Vite frontend** - the intake conversation, photo capture, hand-off screen to the patient status page, live nurse queue, policy editor, per-case detail, and override tools.
* **A Node/Express backend** - authentication, patient sessions, queue ranking, acuity policy logic, nurse overrides, real-time updates, and model orchestration.
* **A small Python/FastAPI vision service** - just what a photo actually needs: a quality check, and a model call to describe what's in it.

The backend never calls a model provider directly from application logic - the conversation, the vision analysis, and transcription each sit behind their own dedicated interface, so any one of them could be swapped without touching whatever calls it.
