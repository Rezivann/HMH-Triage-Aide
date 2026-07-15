import base64
import os

from fastapi import APIRouter, HTTPException

# Dev-only convenience so a photo can be tested through the full kiosk flow
# (blur check -> wound box -> Claude findings) without a real camera - only
# mounted when ENVIRONMENT != "production" (see main.py). Drop jpg/png files
# directly into ml-service/test-images/ (gitignored - see .gitignore).
TEST_IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "test-images")

EXTENSION_TO_MEDIA_TYPE = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

router = APIRouter()


@router.get("")
def list_test_images():
    if not os.path.isdir(TEST_IMAGES_DIR):
        return {"files": []}

    files = sorted(
        name
        for name in os.listdir(TEST_IMAGES_DIR)
        if os.path.splitext(name)[1].lower() in EXTENSION_TO_MEDIA_TYPE
    )
    return {"files": files}


@router.get("/{filename}")
def get_test_image(filename: str):
    # basename strips any path components - filename is untrusted request
    # input, so this is the guard against escaping TEST_IMAGES_DIR.
    safe_name = os.path.basename(filename)
    extension = os.path.splitext(safe_name)[1].lower()
    media_type = EXTENSION_TO_MEDIA_TYPE.get(extension)
    path = os.path.join(TEST_IMAGES_DIR, safe_name)

    if not media_type or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="test_image_not_found")

    with open(path, "rb") as image_file:
        image_bytes = image_file.read()

    # Base64 in the JSON body, not a raw image response - matches every other
    # image in this pipeline (imageRef is always base64), so the Node backend
    # can pass it straight through unchanged.
    return {"imageBase64": base64.b64encode(image_bytes).decode("utf-8"), "mediaType": media_type}
