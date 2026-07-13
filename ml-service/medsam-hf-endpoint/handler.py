import base64
import io
import os

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import SamModel, SamProcessor

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Both tunable via the endpoint's own environment variables (HF Inference
# Endpoints dashboard -> your endpoint -> Settings -> Environment Variables),
# not this repo's ml-service/.env - this code runs on the endpoint's
# container, a separate deployment. Changing these applies without a full
# rebuild, so it's fast to iterate against scripts/test_pipeline.py's
# --show-image.
#
# MASK_THRESHOLD: the model outputs a per-pixel probability (0-1), binarized
# with this cutoff. Lower (e.g. 0.3) = more uncertain pixels count as "in
# the mask" = bigger/more aggressive mask. Higher (e.g. 0.7) = only
# high-confidence pixels count = smaller/tighter mask. Tune this first -
# it's adjusting what the model itself computed, not reshaping the result.
#
# MASK_EROSION_PX / MASK_DILATION_PX: true morphological erosion/dilation,
# applied AFTER binarizing - a purely geometric pixel-count adjustment,
# independent of model confidence. Erosion shrinks the mask boundary by
# peeling off this many pixels (also cleans up small noisy specks/islands);
# dilation grows it by this many pixels. Both default to 0 (no-op). Rarely
# need both nonzero at once - pick one direction based on whether the mask
# is running too large or too small relative to the actual nail/wound.
MASK_THRESHOLD = float(os.environ.get("MASK_THRESHOLD", "0.5"))
MASK_EROSION_PX = int(os.environ.get("MASK_EROSION_PX", "0"))
MASK_DILATION_PX = int(os.environ.get("MASK_DILATION_PX", "0"))


# HF Inference Endpoints auto-detects this class in the model repo and uses
# it instead of a default task handler - needed here because box-prompted
# segmentation (image + a box prompt) isn't one of the standard pipeline
# tasks endpoints support out of the box.
class EndpointHandler:
    def __init__(self, path=""):
        self.model = SamModel.from_pretrained(path).to(DEVICE)
        self.processor = SamProcessor.from_pretrained(path)

    def __call__(self, data):
        inputs_data = data.get("inputs", data)
        image = Image.open(io.BytesIO(base64.b64decode(inputs_data["image"]))).convert("RGB")
        box = inputs_data["box"]  # [x1, y1, x2, y2], original image pixel coordinates

        inputs = self.processor(image, input_boxes=[[box]], return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = self.model(**inputs, multimask_output=False)

        masks = self.processor.image_processor.post_process_masks(
            outputs.pred_masks.sigmoid().cpu(),
            inputs["original_sizes"].cpu(),
            inputs["reshaped_input_sizes"].cpu(),
            binarize=False,
        )
        mask = (masks[0][0, 0].numpy() > MASK_THRESHOLD).astype(np.uint8)
        confidence = float(outputs.iou_scores.squeeze().cpu().numpy())

        if MASK_EROSION_PX > 0:
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.erode(mask, kernel, iterations=MASK_EROSION_PX)
        if MASK_DILATION_PX > 0:
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=MASK_DILATION_PX)

        if mask.sum() == 0:
            return {"valid": False, "failReasons": ["wound_not_found"]}

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)

        # minAreaRect - the minimum-area rectangle rotated to actually hug the
        # contour's own orientation, unlike boundingRect above which is locked
        # to the image's x/y axes. Its two side lengths are the shape's true
        # extents along its own principal axes regardless of in-frame
        # rotation - nail_segmentation.py uses the larger of the two as the
        # nail's real width (a fingernail's visible plate is wider side-to-side
        # than it is long cuticle-to-tip), instead of boundingBox.width, which
        # conflates width and length once the finger is tilted rather than
        # perfectly horizontal/vertical in the photo. boundingBox itself is
        # left as-is - wound_segmentation.py/vision_llm_client.py's crop logic
        # needs an axis-aligned rect to slice out of the raster image, which a
        # rotated rect can't give without a perspective warp.
        (_, _), (rect_w, rect_h), _ = cv2.minAreaRect(largest)
        rotated_width_px = max(rect_w, rect_h)

        return {
            "valid": True,
            "failReasons": [],
            "areaPx": int(mask.sum()),
            "boundingBox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
            "rotatedWidthPx": float(rotated_width_px),
            "boundaryCoords": largest.reshape(-1, 2).tolist(),
            "confidence": confidence,
        }
