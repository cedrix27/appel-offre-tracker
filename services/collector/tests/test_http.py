from __future__ import annotations

import httpx
import pytest

from collector.http import FetchError, PoliteClient, RobotsDisallowed


def _client(handler, **kw):
    clock = {"t": 0.0}
    sleeps: list[float] = []

    def sleep(s: float) -> None:
        sleeps.append(s)
        clock["t"] += s

    c = PoliteClient(
        "UA/1",
        min_delay_seconds=5,
        transport=httpx.MockTransport(handler),
        sleep=sleep,
        clock=lambda: clock["t"],
        **kw,
    )
    return c, sleeps


def test_robots_disallow_is_respected():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /prive/\n")
        return httpx.Response(200, text="ok")

    c, _ = _client(handler)
    assert c.get("https://x.test/public").text == "ok"
    with pytest.raises(RobotsDisallowed):
        c.get("https://x.test/prive/doc.pdf")


def test_min_delay_between_requests():
    c, sleeps = _client(lambda req: httpx.Response(200, text="ok"))
    c.get("https://x.test/a")
    c.get("https://x.test/b")
    # robots.txt + a + b : deux attentes de 5 s
    assert sleeps == [5.0, 5.0]


def test_limited_retries_on_5xx():
    calls = {"n": 0}

    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        calls["n"] += 1
        return httpx.Response(503)

    c, _ = _client(handler, max_retries=2)
    with pytest.raises(FetchError):
        c.get("https://x.test/a")
    assert calls["n"] == 3


def test_conditional_request_headers():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        assert req.headers["if-none-match"] == '"e1"'
        assert req.headers["if-modified-since"] == "Wed, 21 Oct 2026 08:00:00 GMT"
        return httpx.Response(304)

    c, _ = _client(handler)
    res = c.get("https://x.test/f.pdf", etag='"e1"', last_modified="Wed, 21 Oct 2026 08:00:00 GMT")
    assert res.not_modified
