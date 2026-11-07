"""Client HTTP « poli » : User-Agent identifié, délai minimal entre requêtes, robots.txt,
timeouts, retries limités et requêtes conditionnelles (ETag / If-Modified-Since)."""

from __future__ import annotations

import logging
import time
import urllib.robotparser
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

log = logging.getLogger(__name__)


class FetchError(RuntimeError):
    """Échec de récupération d'une ressource distante."""


class RobotsDisallowed(FetchError):
    """L'URL est interdite par robots.txt : on n'insiste pas."""


@dataclass
class FetchResult:
    url: str
    status: int
    content: bytes
    etag: str | None
    last_modified: str | None

    @property
    def not_modified(self) -> bool:
        return self.status == 304

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")


class PoliteClient:
    def __init__(
        self,
        user_agent: str,
        min_delay_seconds: float = 5.0,
        timeout_seconds: float = 60.0,
        max_retries: int = 2,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.user_agent = user_agent
        self.min_delay = min_delay_seconds
        self.max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._client = httpx.Client(
            headers={"User-Agent": user_agent},
            timeout=httpx.Timeout(timeout_seconds, connect=min(20.0, timeout_seconds)),
            follow_redirects=True,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> PoliteClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- interne ------------------------------------------------------------
    def _wait_turn(self, host: str) -> None:
        last = self._last_request.get(host)
        if last is not None:
            remaining = self.min_delay - (self._clock() - last)
            if remaining > 0:
                self._sleep(remaining)
        self._last_request[host] = self._clock()

    def _raw_get(self, url: str, headers: dict[str, str] | None = None) -> httpx.Response:
        host = urlsplit(url).netloc
        attempt = 0
        while True:
            self._wait_turn(host)
            try:
                resp = self._client.get(url, headers=headers)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt >= self.max_retries:
                    raise FetchError(f"échec réseau sur {url} : {exc.__class__.__name__}") from exc
                attempt += 1
                log.warning(
                    "requête échouée (%s), nouvel essai %d/%d",
                    exc.__class__.__name__,
                    attempt,
                    self.max_retries,
                )
                continue
            if resp.status_code >= 500 and attempt < self.max_retries:
                attempt += 1
                log.warning(
                    "HTTP %d sur %s, nouvel essai %d/%d", resp.status_code, url, attempt, self.max_retries
                )
                continue
            return resp

    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser:
        parts = urlsplit(url)
        key = f"{parts.scheme}://{parts.netloc}"
        rp = self._robots.get(key)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                resp = self._raw_get(f"{key}/robots.txt")
                if resp.status_code in (401, 403):
                    rp.disallow_all = True
                elif resp.status_code >= 400:
                    rp.allow_all = True  # pas de robots.txt : pas de restriction déclarée
                else:
                    rp.parse(resp.text.splitlines())
            except FetchError:
                # robots.txt inaccessible : on s'abstient (prudence) plutôt que de passer outre.
                rp.disallow_all = True
            self._robots[key] = rp
        return rp

    # -- public -------------------------------------------------------------
    def allowed(self, url: str) -> bool:
        return self._robots_for(url).can_fetch(self.user_agent, url)

    def get(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        if not self.allowed(url):
            raise RobotsDisallowed(f"URL interdite par robots.txt : {url}")
        headers: dict[str, str] = {}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        resp = self._raw_get(url, headers=headers or None)
        if resp.status_code == 304:
            return FetchResult(url, 304, b"", etag, last_modified)
        if resp.status_code >= 400:
            raise FetchError(f"HTTP {resp.status_code} sur {url}")
        return FetchResult(
            url=str(resp.url),
            status=resp.status_code,
            content=resp.content,
            etag=resp.headers.get("etag"),
            last_modified=resp.headers.get("last-modified"),
        )
