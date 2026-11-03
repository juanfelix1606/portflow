from fastapi import FastAPI

from app.api.v1 import auth
from app.core.exceptions import AppError, app_error_handler

app = FastAPI(
    title="PortFlow API",
    description="Container Terminal Operations & Financial Management System",
    version="0.1.0",
)

app.add_exception_handler(AppError, app_error_handler)

app.include_router(auth.router, prefix="/api/v1")


@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    """Endpoint sederhana untuk memastikan aplikasi hidup."""
    return {"status": "ok"}