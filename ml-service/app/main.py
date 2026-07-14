from fastapi import FastAPI

from app.routes import capture_validation, findings

app = FastAPI(title="LLMTriage ml-service")

app.include_router(capture_validation.router, prefix="/capture")
app.include_router(findings.router, prefix="/capture")


# Matches the Node backend's GET /health convention (back-end/src/app.js) so
# both services can be probed the same way.
@app.get("/health")
def health():
    return {"status": "ok"}
