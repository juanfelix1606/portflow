from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Membaca konfigurasi dari environment variable / file .env."""

    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ALGORITHM: str = "HS256"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()