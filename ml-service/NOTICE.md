# Third-Party Model Notices

## MedSAM / MedSAM2 (wound segmentation)

Used in `app/services/wound_segmentation.py`.

- Source: https://github.com/bowang-lab/MedSAM
- License: Apache License 2.0 - permissive, commercial use allowed. Requires
  keeping this notice and citing the project.
- Citation: Ma, J., He, Y., Li, F. et al. "Segment Anything in Medical Images."
  Nat Commun 15, 654 (2024).

## Segment Anything (SAM) / SAM2 (fingernail segmentation)

Used in `app/services/nail_segmentation.py`. MedSAM is also built on Meta's SAM
base weights, so this applies transitively to the wound segmentation path too.

- Source: https://github.com/facebookresearch/segment-anything
- License terms (including the patent clause and redistribution terms) should
  be re-verified against Meta's current license before shipping this to
  production - Meta can update it, and this notice reflects a point-in-time
  check, not a standing guarantee.

## Not a substitute for legal review

This file documents attribution, not licensing sign-off. Before commercial
deployment, get an actual legal review of both licenses for this specific use
case (patent scope, redistribution terms, any field-of-use restrictions).
