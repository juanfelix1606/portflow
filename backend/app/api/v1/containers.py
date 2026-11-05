from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.container import (
    ContainerCreate,
    ContainerPage,
    ContainerRead,
    ContainerUpdate,
)
from app.services import container_service

router = APIRouter(prefix="/containers", tags=["Containers"])

staff_or_admin = require_role(UserRole.ADMIN, UserRole.STAFF)


@router.post("", response_model=ContainerRead, status_code=201)
def create_container(
    data: ContainerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(staff_or_admin),
):
    return container_service.create_container(db, data, user)


@router.get("", response_model=ContainerPage)
def list_containers(
    search: str | None = None,
    owner_customer_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(staff_or_admin),
):
    items, total = container_service.list_containers(
        db, search=search, owner_customer_id=owner_customer_id, page=page, size=size
    )
    return ContainerPage(items=items, total=total, page=page, size=size)


@router.get("/{container_id}", response_model=ContainerRead)
def get_container(
    container_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(staff_or_admin),
):
    return container_service.get_container(db, container_id)


@router.patch("/{container_id}", response_model=ContainerRead)
def update_container(
    container_id: int,
    data: ContainerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(staff_or_admin),
):
    return container_service.update_container(db, container_id, data, user)