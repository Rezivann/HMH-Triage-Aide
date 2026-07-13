import base64

import cv2
import numpy as np
import pytest


def _to_b64(image) -> str:
    _, buffer = cv2.imencode(".jpg", image)
    return base64.b64encode(buffer).decode("utf-8")


@pytest.fixture
def encode_image():
    return _to_b64


@pytest.fixture
def flat_image():
    # Uniform gray - no edges, so it's deliberately blurry for Stage 1 tests.
    # Content-neutral for Stage 2/3 tests, which only care about the boxes and
    # mocked segmentation/classification results layered on top of it.
    return np.full((200, 200, 3), 128, dtype=np.uint8)


@pytest.fixture
def sharp_image():
    # High-frequency noise - guaranteed high Laplacian variance regardless of
    # BLUR_THRESHOLD, so this is deliberately not-blurry for Stage 1 tests.
    rng = np.random.default_rng(42)
    return rng.integers(0, 255, size=(200, 200, 3), dtype=np.uint8).astype(np.uint8)


@pytest.fixture
def box():
    def _box(x=10, y=10, width=50, height=50):
        return {"x": x, "y": y, "width": width, "height": height}

    return _box
