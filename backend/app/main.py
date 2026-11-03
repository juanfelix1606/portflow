from fastapi import FastAPI

app = FastAPI(
    title="PortFlow API",
    description="Container Terminal Operations & Financial Management System",
    version="0.1.0",
)


@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    """Endpoint sederhana untuk memastikan aplikasi hidup."""
    return {"status": "ok"}