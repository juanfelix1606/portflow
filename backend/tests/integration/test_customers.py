from sqlalchemy import select

from app.models.audit_log import AuditLog

URL = "/api/v1/customers"
PAYLOAD = {"code": "MSK-01", "name": "PT Samudera Lintas Nusantara"}


def test_create_customer_success(client, staff_headers):
    resp = client.post(URL, json=PAYLOAD, headers=staff_headers)
    assert resp.status_code == 201
    assert resp.json()["code"] == "MSK-01"
    assert resp.json()["is_active"] is True


def test_create_customer_duplicate_code_returns_409(client, staff_headers):
    client.post(URL, json=PAYLOAD, headers=staff_headers)
    resp = client.post(URL, json=PAYLOAD, headers=staff_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CUSTOMER_CODE_EXISTS"


def test_create_customer_requires_login(client):
    resp = client.post(URL, json=PAYLOAD)
    assert resp.status_code == 401


def test_create_customer_invalid_code_returns_422(client, staff_headers):
    resp = client.post(URL, json={**PAYLOAD, "code": "huruf kecil"}, headers=staff_headers)
    assert resp.status_code == 422


def test_deactivate_customer_twice_returns_409(client, staff_headers):
    cid = client.post(URL, json=PAYLOAD, headers=staff_headers).json()["id"]
    assert client.post(f"{URL}/{cid}/deactivate", headers=staff_headers).status_code == 200
    resp = client.post(f"{URL}/{cid}/deactivate", headers=staff_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CUSTOMER_ALREADY_INACTIVE"


def test_inactive_customers_hidden_by_default(client, staff_headers):
    cid = client.post(URL, json=PAYLOAD, headers=staff_headers).json()["id"]
    client.post(f"{URL}/{cid}/deactivate", headers=staff_headers)
    assert client.get(URL, headers=staff_headers).json()["total"] == 0
    assert client.get(f"{URL}?only_active=false", headers=staff_headers).json()["total"] == 1


def test_create_customer_writes_audit_log(client, db, admin_headers):
    client.post(URL, json=PAYLOAD, headers=admin_headers)
    logs = db.scalars(select(AuditLog)).all()
    assert len(logs) == 1
    assert logs[0].action == "CUSTOMER_CREATED"
    assert logs[0].new_values["code"] == "MSK-01"