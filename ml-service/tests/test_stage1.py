from fastapi.testclient import TestClient

from app.main import app
from app.services.capture_quality import check_blur

client = TestClient(app)


class TestCheckBlur:
    def test_sharp_image_is_not_blurry(self, sharp_image):
        result = check_blur(sharp_image)
        assert result["isBlurry"] == False  # noqa: E712 - cv2/numpy returns np.bool_, not a Python bool

    def test_flat_image_is_blurry(self, flat_image):
        result = check_blur(flat_image)
        assert result["isBlurry"] == True  # noqa: E712 - cv2/numpy returns np.bool_, not a Python bool


class TestValidateCaptureRoute:
    def test_accepts_sharp_image(self, encode_image, sharp_image):
        response = client.post("/capture/validate", json={"imageRef": encode_image(sharp_image)})

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["failReasons"] == []

    def test_rejects_blurry_image(self, encode_image, flat_image):
        response = client.post("/capture/validate", json={"imageRef": encode_image(flat_image)})

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["failReasons"] == ["blurry"]
