from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerPage,
    CustomerRead,
    CustomerUpdate,
)
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["Customers"])

staff_or_admin = require_role(UserRole.ADMIN, UserRole.STAFF)


@router.post("", response_model=CustomerRead, status_code=201)
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(staff_or_admin),
):
    return customer_service.create_customer(db, data, user)


@router.get("", response_model=CustomerPage)
def list_customers(
    search: str | None = None,
    only_active: bool = True,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(staff_or_admin),
):
    items, total = customer_service.list_customers(
        db, search=search, only_active=only_active, page=page, size=size
    )
    return CustomerPage(items=items, total=total, page=page, size=size)


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(staff_or_admin),
):
    return customer_service.get_customer(db, customer_id)


@router.patch("/{customer_id}", response_model=CustomerRead)
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(staff_or_admin),
):
    return customer_service.update_customer(db, customer_id, data, user)


@router.post("/{customer_id}/deactivate", response_model=CustomerRead)
def deactivate_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(staff_or_admin),
):
    return customer_service.deactivate_customer(db, customer_id, user)