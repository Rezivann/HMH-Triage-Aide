"""Manual end-to-end test against a running `uvicorn app.main:app`.

Usage:
    python scripts/test_pipeline.py path/to/photo.jpg --wound-box X Y W H

Box coordinates are in the image's actual pixel dimensions (not on-screen size) -
open the photo in any image viewer (e.g. Windows Paint) and hover the corners of
the region you want to box; most viewers show the cursor's pixel position in the
status bar.
"""

import argparse
import base64
import sys

import httpx

BASE_URL = "http://localhost:8000"


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path")
    parser.add_argument("--wound-box", nargs=4, type=int, metavar=("X", "Y", "W", "H"), required=True)
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

    print("\n=== Stage 2: /capture/findings ===")
    wound_box = box_arg(*args.wound_box)

    r = httpx.post(
        f"{BASE_URL}/capture/findings",
        json={"imageRef": image_b64, "woundBox": wound_box},
        timeout=45,  # short on purpose - fail fast during debugging; bump back up once things actually work
    )
    print_response(r)


if __name__ == "__main__":
    main()
