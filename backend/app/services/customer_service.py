from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.services.audit_service import log_action

_FIELDS = ("code", "name", "email", "phone", "address", "is_active")


def _snapshot(c: Customer) -> dict:
    return {f: getattr(c, f) for f in _FIELDS}


def get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError("CUSTOMER_NOT_FOUND", "Customer tidak ditemukan", 404)
    return customer


def create_customer(db: Session, data: CustomerCreate, actor: User) -> Customer:
    if db.scalar(select(Customer).where(Customer.code == data.code)):
        raise AppError("CUSTOMER_CODE_EXISTS", "Kode customer sudah dipakai", 409)

    customer = Customer(**data.model_dump())
    db.add(customer)
    db.flush()  # mendapatkan id sebelum audit log

    log_action(
        db,
        user_id=actor.id,
        action="CUSTOMER_CREATED",
        entity_type="customer",
        entity_id=customer.id,
        new_values=_snapshot(customer),
    )
    db.commit()
    db.refresh(customer)
    return customer


def list_customers(
    db: Session, *, search: str | None, only_active: bool, page: int, size: int
) -> tuple[list[Customer], int]:
    stmt = select(Customer)
    if only_active:
        stmt = stmt.where(Customer.is_active.is_(True))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(Customer.name.ilike(like) | Customer.code.ilike(like))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Customer.name).offset((page - 1) * size).limit(size)
    ).all()
    return list(items), total


def update_customer(
    db: Session, customer_id: int, data: CustomerUpdate, actor: User
) -> Customer:
    customer = get_customer(db, customer_id)
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return customer

    old = _snapshot(customer)
    for field, value in changes.items():
        setattr(customer, field, value)

    log_action(
        db,
        user_id=actor.id,
        action="CUSTOMER_UPDATED",
        entity_type="customer",
        entity_id=customer.id,
        old_values=old,
        new_values=_snapshot(customer),
    )
    db.commit()
    db.refresh(customer)
    return customer


def deactivate_customer(db: Session, customer_id: int, actor: User) -> Customer:
    customer = get_customer(db, customer_id)
    if not customer.is_active:
        raise AppError("CUSTOMER_ALREADY_INACTIVE", "Customer sudah nonaktif", 409)

    old = _snapshot(customer)
    customer.is_active = False
    log_action(
        db,
        user_id=actor.id,
        action="CUSTOMER_DEACTIVATED",
        entity_type="customer",
        entity_id=customer.id,
        old_values=old,
        new_values=_snapshot(customer),
    )
    db.commit()
    db.refresh(customer)
    return customer