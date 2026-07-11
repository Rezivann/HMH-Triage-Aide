import base64

import cv2
import numpy as np


def decode_image(image_ref: str):
    image_bytes = base64.b64decode(image_ref)
    return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
