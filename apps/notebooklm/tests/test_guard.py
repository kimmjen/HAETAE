"""Loopback guard tests — Python equivalent of HAETAE's local-guard.
Mirrors the threat model: Host must be loopback; Origin (if present) loopback."""

from app.guard import assess_local_request, is_loopback_host


def test_loopback_hosts_pass():
    assert is_loopback_host("127.0.0.1")
    assert is_loopback_host("localhost")
    assert is_loopback_host("::1")
    assert is_loopback_host("127.0.0.1:4100")
    assert is_loopback_host("[::1]:4100")
    assert is_loopback_host("http://127.0.0.1:5173")


def test_absent_host_allowed():
    # curl / native clients / same-origin GETs have no Origin.
    assert is_loopback_host(None)
    assert is_loopback_host("")


def test_non_loopback_rejected():
    assert not is_loopback_host("evil.com")
    assert not is_loopback_host("evil.com:4100")
    assert not is_loopback_host("http://attacker.example")


def test_assess_blocks_dns_rebinding():
    ok, reason = assess_local_request("attacker.example", None)
    assert not ok
    assert "Host" in reason


def test_assess_blocks_cross_origin():
    ok, reason = assess_local_request("127.0.0.1:4100", "http://evil.com")
    assert not ok
    assert "cross-origin" in reason


def test_assess_allows_local():
    ok, reason = assess_local_request("127.0.0.1:4100", "http://127.0.0.1:5173")
    assert ok and reason is None
