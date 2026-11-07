from __future__ import annotations

import json
from dataclasses import replace
from datetime import date

import httpx
import pytest

from collector.config import get_settings
from collector.extract.openai_extractor import (
    OpenAIExtractor,
    amount_in_source,
    date_in_source,
    reference_in_source,
)
from collector.extract.rules import RulesExtractor
from tests.conftest import find_notice

PUB = date(2026, 10, 21)


@pytest.fixture
def settings():
    return replace(
        get_settings(), ai_provider="openai", openai_api_key="sk-test-0000000000", openai_model="gpt-test"
    )


@pytest.fixture
def bumigeb(notices_4514):
    return find_notice(notices_4514, "BUMIGEB")


def _model_payload(notice, **overrides):
    base = RulesExtractor().extract(notice, PUB).data.model_dump()
    base.update(overrides)
    return base


def _responses_body(payload: dict, as_output_text: bool = False) -> dict:
    text = json.dumps(payload, ensure_ascii=False)
    if as_output_text:
        return {"status": "completed", "output_text": text}
    return {
        "id": "resp_1",
        "status": "completed",
        "output": [
            {"type": "reasoning", "summary": []},
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]},
        ],
    }


def test_valid_response(settings, bumigeb):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers["authorization"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_responses_body(_model_payload(bumigeb, summary="Résumé du modèle.")))

    ex = OpenAIExtractor(settings, transport=httpx.MockTransport(handler))
    out = ex.extract(bumigeb, PUB)
    assert out.model == "openai:gpt-test"
    assert out.data.summary == "Résumé du modèle."
    assert out.data.estimated_budget == 82_600_000
    assert out.data.submission_deadline == "2026-10-30"
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["auth"] == "Bearer sk-test-0000000000"
    body = captured["body"]
    assert body["model"] == "gpt-test"
    fmt = body["text"]["format"]
    assert fmt["type"] == "json_schema" and fmt["name"] == "tender_extraction" and fmt["strict"] is True
    assert fmt["schema"]["additionalProperties"] is False
    assert "submission_deadline" in fmt["schema"]["required"]
    assert body["input"][0]["role"] == "system"
    assert "null" in body["input"][0]["content"]
    assert "avant le le 30/10/2026" in body["input"][1]["content"]


def test_output_text_shortcut(settings, bumigeb):
    transport = httpx.MockTransport(
        lambda r: httpx.Response(200, json=_responses_body(_model_payload(bumigeb), as_output_text=True))
    )
    out = OpenAIExtractor(settings, transport=transport).extract(bumigeb, PUB)
    assert out.model == "openai:gpt-test"


def test_invented_values_are_rejected(settings, bumigeb):
    invented = _model_payload(
        bumigeb,
        estimated_budget=95_000_000,  # absent du texte
        budget_tax_basis="TTC",
        submission_deadline="2026-11-15",  # absente du texte
        submission_time="10:00",
        reference="N°2026-99/INVENTE/DG",
        missing_or_uncertain_fields=[],
    )
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json=_responses_body(invented)))
    out = OpenAIExtractor(settings, transport=transport).extract(bumigeb, PUB)
    d = out.data
    assert out.model == "openai:gpt-test"
    assert d.estimated_budget is None and d.budget_tax_basis is None
    assert d.submission_deadline is None and d.submission_time is None
    assert d.reference is None
    for f in ("estimated_budget", "submission_deadline", "submission_time", "reference"):
        assert f in d.missing_or_uncertain_fields
    assert out.evidence["estimated_budget"] is None


def test_http_500_falls_back_to_rules(settings, bumigeb, caplog):
    transport = httpx.MockTransport(lambda r: httpx.Response(500, json={"error": {"message": "boom"}}))
    out = OpenAIExtractor(settings, transport=transport).extract(bumigeb, PUB)
    assert out.model == "rules:v1"
    assert out.data.estimated_budget == 82_600_000
    assert "repli" in caplog.text
    assert "sk-test" not in caplog.text


def test_timeout_and_invalid_schema_fall_back(settings, bumigeb):
    def timeout(request):
        raise httpx.ReadTimeout("timeout", request=request)

    assert (
        OpenAIExtractor(settings, transport=httpx.MockTransport(timeout)).extract(bumigeb).model == "rules:v1"
    )
    bad = _model_payload(bumigeb, sectors=["inconnu"])
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json=_responses_body(bad)))
    assert OpenAIExtractor(settings, transport=transport).extract(bumigeb).model == "rules:v1"
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json=_responses_body({"title": "x"})))
    assert OpenAIExtractor(settings, transport=transport).extract(bumigeb).model == "rules:v1"


def test_missing_key_uses_rules(settings, bumigeb):
    def fail(request):
        raise AssertionError("aucun appel réseau attendu")

    ex = OpenAIExtractor(replace(settings, openai_api_key=None), transport=httpx.MockTransport(fail))
    assert ex.extract(bumigeb).model == "rules:v1"


def test_source_presence_helpers():
    src = "montant de quatre-vingt-deux millions (82 600 000) FCFA TTC, avant le 06 novembre 2026"
    assert amount_in_source(82_600_000, src)
    assert not amount_in_source(8_260_000, src)
    assert date_in_source("2026-11-06", src)
    assert not date_in_source("2026-11-07", src)
    assert date_in_source("2026-10-30", "avant le 30/10/2026")
    assert reference_in_source("N°2026-15/BUMIGEB/DG/PRM", "n°2026-15/BUMIGEB/DG/PRM du 05/10/2026")
    assert not reference_in_source("N°2026-16/BUMIGEB/DG/PRM", "n°2026-15/BUMIGEB/DG/PRM")


def test_pydantic_model_matches_json_schema():
    from collector.extract.schema import Evidence, TenderExtraction
    from collector.taxonomy import extraction_json_schema

    schema = extraction_json_schema()
    assert set(TenderExtraction.model_fields) == set(schema["properties"]) == set(schema["required"])
    assert set(Evidence.model_fields) == set(schema["properties"]["evidence"]["required"])
