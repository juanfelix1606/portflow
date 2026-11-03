from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Mengubah password asli menjadi hash Argon2."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Memeriksa apakah password cocok dengan hash yang tersimpan."""
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(subject: str, role: str) -> str:
    """Membuat JWT berisi user (sub), role, dan waktu kedaluwarsa."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Memverifikasi JWT. Mengembalikan payload, atau None jika tidak valid/kedaluwarsa."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None