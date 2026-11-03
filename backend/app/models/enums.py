import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    STAFF = "STAFF"


class ContainerType(str, enum.Enum):
    GP = "GP"  # General Purpose
    HC = "HC"  # High Cube
    RF = "RF"  # Reefer
    OT = "OT"  # Open Top
    FR = "FR"  # Flat Rack


class ContainerSize(str, enum.Enum):
    FT20 = "20"
    FT40 = "40"