from sqlalchemy import CHAR, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.customer import Customer
from app.models.enums import ContainerSize, ContainerType
from app.models.mixins import TimestampMixin


class Container(TimestampMixin, Base):
    __tablename__ = "containers"

    id: Mapped[int] = mapped_column(primary_key=True)
    container_no: Mapped[str] = mapped_column(CHAR(11), unique=True, nullable=False)
    type: Mapped[ContainerType] = mapped_column(
        Enum(ContainerType, name="container_type"), nullable=False
    )
    size: Mapped[ContainerSize] = mapped_column(
        Enum(
            ContainerSize,
            name="container_size",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    owner_customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id"), nullable=False, index=True
    )

    owner: Mapped[Customer] = relationship()