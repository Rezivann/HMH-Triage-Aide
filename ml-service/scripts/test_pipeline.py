"""Manual end-to-end test against a running `uvicorn app.main:app`.

Usage:
    python scripts/test_pipeline.py path/to/photo.jpg --wound-box X Y W H [--nail-box X Y W H] [--show-image]

Box coordinates are in the image's actual pixel dimensions (not on-screen size) -
open the photo in any image viewer (e.g. Windows Paint) and hover the corners of
the region you want to box; most viewers show the cursor's pixel position in the
status bar. --nail-box is optional, same as the kiosk's skip button - omit it to
exercise the fallback low-confidence scale path instead of the real one.

--show-image opens two OpenCV windows (nail, wound) showing the box you sent MedSAM
(blue), the bounding box MedSAM's mask actually landed on (red), and the mask's
own outline (green) - lets you eyeball segmentation quality directly instead of
just trusting the numbers. Requires opencv-python, not opencv-python-headless
(see requirements.txt's comment on this).
"""

import argparse
import base64
import os
import sys

import cv2
import httpx
import numpy as np
from dotenv import load_dotenv

BASE_URL = "http://localhost:8000"

load_dotenv()
MEDSAM_ENDPOINT_URL = os.environ.get("MEDSAM_ENDPOINT_URL")
MEDSAM_API_KEY = os.environ.get("MEDSAM_API_KEY")


def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def box_arg(x, y, w, h):
    return {"x": x, "y": y, "width": w, "height": h}


def print_response(r):
    # Always print the status code first, and fall back to raw text if the
    # body isn't valid JSON (a 500 from an unhandled exception, a proxy
    # error, or the server crashing mid-request can all return a non-JSON
    # or empty body) - silently calling r.json() and letting it throw hides
    # the status code and the real error text, which is the only useful
    # signal when something's actually broken server-side.
    print(f"HTTP {r.status_code}")
    try:
        print(r.json())
    except ValueError:
        print(f"(non-JSON response body, {len(r.content)} bytes):")
        print(r.text[:2000])


# Calls MedSAM directly (bypassing kioskController-equivalent plumbing) so
# --show-image works independent of what /capture/measure's response shape
# happens to expose - the production API deliberately doesn't return the
# nail's own mask/box, only the scale factor derived from it (see
# nail_segmentation.py), so this is the only way to see what MedSAM actually
# found for the nail specifically.
def call_medsam(image_b64, box):
    if not MEDSAM_API_KEY or not MEDSAM_ENDPOINT_URL:
        print("(skipping visualization - MEDSAM_ENDPOINT_URL/MEDSAM_API_KEY not set in .env)")
        return None

    xyxy = [box["x"], box["y"], box["x"] + box["width"], box["y"] + box["height"]]
    response = httpx.post(
        MEDSAM_ENDPOINT_URL,
        headers={"Authorization": f"Bearer {MEDSAM_API_KEY}"},
        json={"inputs": {"image": image_b64, "box": xyxy}},
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


def show_segmentation(image_path, prompt_box, medsam_result, window_title):
    img = cv2.imread(image_path)
    if img is None:
        print(f"Could not load {image_path} for visualization")
        return

    x, y, w, h = prompt_box["x"], prompt_box["y"], prompt_box["width"], prompt_box["height"]
    cv2.rectangle(img, (x, y), (x + w, y + h), (255, 0, 0), 2)  # blue - the box we sent

    if medsam_result is None:
        cv2.putText(img, "no MEDSAM credentials - box only", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
    elif not medsam_result.get("valid"):
        cv2.putText(
            img,
            f"INVALID: {medsam_result.get('failReasons')}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 255),
            2,
        )
    else:
        bbox = medsam_result["boundingBox"]
        bx, by, bw, bh = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
        cv2.rectangle(img, (bx, by), (bx + bw, by + bh), (0, 0, 255), 2)  # red - MedSAM's own bounding box

        coords = np.array(medsam_result["boundaryCoords"], dtype=np.int32).reshape(-1, 1, 2)
        overlay = img.copy()
        cv2.fillPoly(overlay, [coords], color=(0, 255, 0))
        img = cv2.addWeighted(overlay, 0.3, img, 0.7, 0)  # green, translucent - the actual mask
        cv2.polylines(img, [coords], isClosed=True, color=(0, 255, 0), thickness=2)

    cv2.imshow(window_title, img)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path")
    parser.add_argument("--nail-box", nargs=4, type=int, metavar=("X", "Y", "W", "H"))
    parser.add_argument("--wound-box", nargs=4, type=int, metavar=("X", "Y", "W", "H"), required=True)
    parser.add_argument("--show-image", action="store_true", help="Open OpenCV windows visualizing segmentation")
    args = parser.parse_args()

    image_b64 = encode_image(args.image_path)

    print("=== Stage 1: /capture/validate ===")
    r = httpx.post(f"{BASE_URL}/capture/validate", json={"imageRef": image_b64})
    print_response(r)
    if r.status_code != 200:
        sys.exit(1)
    if not r.json().get("valid"):
        print("Capture failed validation - fix the photo (or lower BLUR_THRESHOLD) before continuing.")
        sys.exit(1)

    print("\n=== Stage 2: /capture/measure ===")
    nail_box = box_arg(*args.nail_box) if args.nail_box else None
    wound_box = box_arg(*args.wound_box)

    r = httpx.post(
        f"{BASE_URL}/capture/measure",
        json={"imageRef": image_b64, "nailBox": nail_box, "woundBoxPrompt": wound_box},
        timeout=45,  # short on purpose - fail fast during debugging; bump back up once things actually work
    )
    print_response(r)
    if r.status_code != 200:
        sys.exit(1)
    measurement = r.json()
    if not measurement.get("valid"):
        print("Measurement failed or invalid - stopping before Stage 3.")
        sys.exit(1)

    print("\n=== Stage 3: /capture/findings ===")
    r = httpx.post(
        f"{BASE_URL}/capture/findings",
        json={
            "imageRef": image_b64,
            "woundBox": measurement["woundBox"],
            "scaleFactorMmPerPixel": measurement["scaleFactorMmPerPixel"],
            "woundAreaCm2": measurement["woundAreaCm2"],
            "areaMarginPercent": measurement["areaMarginPercent"],
            "measurementConfidence": measurement["confidence"],
        },
        timeout=45,  # short on purpose - fail fast during debugging; bump back up once things actually work
    )
    print_response(r)

    if args.show_image:
        print("\n=== Visualizing segmentation (press any key in an image window to close) ===")
        if nail_box:
            show_segmentation(args.image_path, nail_box, call_medsam(image_b64, nail_box), "Nail segmentation")
        else:
            print("(no --nail-box given - nothing to visualize for the nail)")
        show_segmentation(args.image_path, wound_box, call_medsam(image_b64, wound_box), "Wound segmentation")
        cv2.waitKey(0)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
