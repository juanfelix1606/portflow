from app.utils.iso6346 import calculate_check_digit, is_valid_container_no


def test_known_valid_number():
    assert is_valid_container_no("CSQU3054383") is True


def test_wrong_check_digit_is_invalid():
    assert is_valid_container_no("CSQU3054384") is False


def test_wrong_format_is_invalid():
    assert is_valid_container_no("csqu3054383") is False
    assert is_valid_container_no("CSQU305438") is False
    assert is_valid_container_no("CSQX3054383") is False


def test_check_digit_calculation():
    assert calculate_check_digit("CSQU305438") == 3