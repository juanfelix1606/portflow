from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import create_access_token, verify_password
from app.models.user import User


def authenticate(db: Session, username: str, password: str) -> str:
    """Memeriksa kredensial, mengembalikan JWT jika benar."""
    user = db.scalar(select(User).where(User.username == username))

    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Username atau password salah", 401)

    return create_access_token(subject=str(user.id), role=user.role.value)