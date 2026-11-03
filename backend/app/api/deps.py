from collections.abc import Callable

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise AppError("INVALID_TOKEN", "Token tidak valid atau kedaluwarsa", 401)

    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise AppError("USER_INACTIVE", "User tidak ditemukan atau nonaktif", 401)
    return user


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Membuat dependency yang hanya meloloskan user dengan role tertentu."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError("FORBIDDEN", "Role tidak memiliki akses", 403)
        return user

    return checker