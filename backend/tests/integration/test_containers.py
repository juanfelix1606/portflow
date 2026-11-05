from sqlalchemy import select

from app.models.audit_log import AuditLog

URL = "/api/v1/containers"
CUSTOMERS_URL = "/api/v1/customers"
VALID_NO = "CSQU3054383"


def _make_customer(client, headers, code="MSK-01") -> int:
    resp = client.post(
        CUSTOMERS_URL, json={"code": code, "name": "PT Samudera"}, headers=headers
    )
    return resp.json()["id"]


def _payload(owner_id: int, **overrides) -> dict:
    return {
        "container_no": VALID_NO,
        "type": "GP",
        "size": "20",
        "owner_customer_id": owner_id,
        **overrides,
    }


def test_register_container_success(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    resp = client.post(URL, json=_payload(owner), headers=staff_headers)
    assert resp.status_code == 201
    assert resp.json()["container_no"] == VALID_NO
    assert resp.json()["size"] == "20"


def test_register_container_normalizes_number(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    resp = client.post(
        URL, json=_payload(owner, container_no=" csqu3054383"), headers=staff_headers
    )
    assert resp.status_code == 201
    assert resp.json()["container_no"] == VALID_NO


def test_register_container_invalid_check_digit_returns_422(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    resp = client.post(
        URL, json=_payload(owner, container_no="CSQU3054384"), headers=staff_headers
    )
    assert resp.status_code == 422


def test_register_container_duplicate_returns_409(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    client.post(URL, json=_payload(owner), headers=staff_headers)
    resp = client.post(URL, json=_payload(owner), headers=staff_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONTAINER_EXISTS"


def test_register_container_unknown_customer_returns_404(client, staff_headers):
    resp = client.post(URL, json=_payload(9999), headers=staff_headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CUSTOMER_NOT_FOUND"


def test_register_container_inactive_customer_returns_409(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    client.post(f"{CUSTOMERS_URL}/{owner}/deactivate", headers=staff_headers)
    resp = client.post(URL, json=_payload(owner), headers=staff_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CUSTOMER_INACTIVE"


def test_register_container_requires_login(client):
    resp = client.post(URL, json=_payload(1))
    assert resp.status_code == 401


def test_search_container_by_number(client, staff_headers):
    owner = _make_customer(client, staff_headers)
    client.post(URL, json=_payload(owner), headers=staff_headers)
    resp = client.get(f"{URL}?search=csqu305", headers=staff_headers)
    assert resp.json()["total"] == 1
    resp = client.get(f"{URL}?search=XXXX", headers=staff_headers)
    assert resp.json()["total"] == 0


def test_register_container_writes_audit_log(client, db, admin_headers):
    owner = _make_customer(client, admin_headers)
    client.post(URL, json=_payload(owner), headers=admin_headers)
    actions = [log.action for log in db.scalars(select(AuditLog)).all()]
    assert "CONTAINER_REGISTERED" in actions