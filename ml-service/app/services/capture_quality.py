import cv2

from app.config import BLUR_THRESHOLD


def check_blur(image) -> dict:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    return {"isBlurry": blur_score < BLUR_THRESHOLD, "blurScore": blur_score}
