import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.enums import UserRole
from app.models.user import User


def main() -> None:
    username = input("Username admin: ").strip()
    full_name = input("Nama lengkap: ").strip()
    password = getpass.getpass("Password (min 8 karakter): ")

    if len(password) < 8:
        print("Password terlalu pendek.")
        return

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == username)):
            print("Username sudah dipakai.")
            return
        db.add(
            User(
                username=username,
                full_name=full_name,
                password_hash=hash_password(password),
                role=UserRole.ADMIN,
            )
        )
        db.commit()
    print("Admin berhasil dibuat.")


if __name__ == "__main__":
    main()