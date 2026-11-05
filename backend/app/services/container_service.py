from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.container import Container
from app.models.customer import Customer
from app.models.user import User
from app.schemas.container import ContainerCreate, ContainerUpdate
from app.services.audit_service import log_action

_FIELDS = ("container_no", "type", "size", "owner_customer_id")


def _snapshot(c: Container) -> dict:
    return {
        f: (getattr(c, f).value if hasattr(getattr(c, f), "value") else getattr(c, f))
        for f in _FIELDS
    }


def _require_active_customer(db: Session, customer_id: int) -> Customer:
    """BR-5: customer nonaktif tidak boleh dipakai untuk data baru."""
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError("CUSTOMER_NOT_FOUND", "Customer tidak ditemukan", 404)
    if not customer.is_active:
        raise AppError("CUSTOMER_INACTIVE", "Customer nonaktif tidak dapat dipakai", 409)
    return customer


def get_container(db: Session, container_id: int) -> Container:
    container = db.get(Container, container_id)
    if container is None:
        raise AppError("CONTAINER_NOT_FOUND", "Kontainer tidak ditemukan", 404)
    return container


def create_container(db: Session, data: ContainerCreate, actor: User) -> Container:
    if db.scalar(select(Container).where(Container.container_no == data.container_no)):
        raise AppError("CONTAINER_EXISTS", "Nomor kontainer sudah terdaftar", 409)
    _require_active_customer(db, data.owner_customer_id)

    container = Container(**data.model_dump())
    db.add(container)
    db.flush()

    log_action(
        db,
        user_id=actor.id,
        action="CONTAINER_REGISTERED",
        entity_type="container",
        entity_id=container.id,
        new_values=_snapshot(container),
    )
    db.commit()
    db.refresh(container)
    return container


def list_containers(
    db: Session, *, search: str | None, owner_customer_id: int | None, page: int, size: int
) -> tuple[list[Container], int]:
    stmt = select(Container)
    if search:
        stmt = stmt.where(Container.container_no.ilike(f"%{search.upper()}%"))
    if owner_customer_id:
        stmt = stmt.where(Container.owner_customer_id == owner_customer_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Container.container_no).offset((page - 1) * size).limit(size)
    ).all()
    return list(items), total


def update_container(
    db: Session, container_id: int, data: ContainerUpdate, actor: User
) -> Container:
    container = get_container(db, container_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        return container

    if "owner_customer_id" in changes:
        _require_active_customer(db, changes["owner_customer_id"])

    old = _snapshot(container)
    for field, value in changes.items():
        setattr(container, field, value)

    log_action(
        db,
        user_id=actor.id,
        action="CONTAINER_UPDATED",
        entity_type="container",
        entity_id=container.id,
        old_values=old,
        new_values=_snapshot(container),
    )
    db.commit()
    db.refresh(container)
    return container