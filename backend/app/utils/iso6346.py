import re

_PATTERN = re.compile(r"^[A-Z]{3}[UJZ][0-9]{6}[0-9]$")


def _letter_values() -> dict[str, int]:
    """Nilai huruf ISO 6346: A=10, lalu lompat kelipatan 11 (11, 22, 33 dilewati)."""
    values: dict[str, int] = {}
    n = 10
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if n % 11 == 0:
            n += 1
        values[ch] = n
        n += 1
    return values


_VALUES = _letter_values()


def calculate_check_digit(first_ten: str) -> int:
    """Menghitung check digit dari 10 karakter pertama."""
    total = 0
    for i, ch in enumerate(first_ten):
        value = _VALUES[ch] if ch.isalpha() else int(ch)
        total += value * (2**i)
    return (total % 11) % 10


def is_valid_container_no(number: str) -> bool:
    """True jika format dan check digit nomor kontainer valid."""
    if not _PATTERN.match(number):
        return False
    return calculate_check_digit(number[:10]) == int(number[10])