from fastapi import FastAPI

from app.routes import capture_validation, findings, test_images

app = FastAPI(title="LLMTriage ml-service")

app.include_router(capture_validation.router, prefix="/capture")
app.include_router(findings.router, prefix="/capture")

# "Use a test image" endpoint - deliberately mounted in every environment
# per explicit request, so it works against the real deployed ml-service too.
# Path-guarded (routes/test_images.py basenames the filename), and this
# service isn't reachable from the public internet directly (only the Node
# backend calls it), so this isn't a public attack surface either way.
app.include_router(test_images.router, prefix="/test-images")


# Matches the Node backend's GET /health convention (back-end/src/app.js) so
# both services can be probed the same way.
@app.get("/health")
def health():
    return {"status": "ok"}
