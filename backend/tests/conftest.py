import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.enums import UserRole
from app.models.user import User

assert settings.TEST_DATABASE_URL, "TEST_DATABASE_URL belum diatur di .env"
assert settings.TEST_DATABASE_URL != settings.DATABASE_URL, "Database test harus berbeda!"

test_engine = create_engine(settings.TEST_DATABASE_URL, pool_pre_ping=True)
TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def _database():
    """Buat tabel bersih sebelum setiap test, hapus sesudahnya."""
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    yield
    Base.metadata.drop_all(test_engine)


@pytest.fixture
def db():
    with TestSession() as session:
        yield session


@pytest.fixture
def client(db):
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _make_user(db, username: str, role: UserRole) -> None:
    db.add(
        User(
            username=username,
            full_name=username.title(),
            password_hash=hash_password("password123"),
            role=role,
        )
    )
    db.commit()


def _login(client, username: str) -> dict:
    resp = client.post(
        "/api/v1/auth/login", data={"username": username, "password": "password123"}
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def admin_headers(client, db):
    _make_user(db, "admin_test", UserRole.ADMIN)
    return _login(client, "admin_test")


@pytest.fixture
def staff_headers(client, db):
    _make_user(db, "staff_test", UserRole.STAFF)
    return _login(client, "staff_test")