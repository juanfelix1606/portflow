from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import ContainerSize, ContainerType
from app.utils.iso6346 import is_valid_container_no


class ContainerCreate(BaseModel):
    container_no: str
    type: ContainerType
    size: ContainerSize
    owner_customer_id: int

    @field_validator("container_no")
    @classmethod
    def validate_container_no(cls, v: str) -> str:
        v = v.strip().upper()
        if not is_valid_container_no(v):
            raise ValueError("Nomor kontainer tidak valid (format ISO 6346 / check digit salah)")
        return v


class ContainerUpdate(BaseModel):
    type: ContainerType | None = None
    size: ContainerSize | None = None
    owner_customer_id: int | None = None


class ContainerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    container_no: str
    type: ContainerType
    size: ContainerSize
    owner_customer_id: int
    created_at: datetime
    updated_at: datetime


class ContainerPage(BaseModel):
    items: list[ContainerRead]
    total: int
    page: int
    size: int