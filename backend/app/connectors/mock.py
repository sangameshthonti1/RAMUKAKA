from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from app.agent.providers import model_provider
from app.connectors.base import Connector
from app.core.types import SIMULATED


@dataclass(frozen=True)
class MockAdapter:
    name: str
    description: str
    operations: dict[str, frozenset[str]]

    def execute(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        if operation not in self.operations or set(payload) != self.operations[operation]:
            raise ValueError("Unsupported mock operation or payload shape")
        for key, value in payload.items():
            if key == "amount":
                if type(value) is not int or value < 0:
                    raise ValueError("Amount must be whole, nonnegative INR")
            elif key == "issue_category":
                if value not in {
                    "water_purifier_service",
                    "air_conditioner_service",
                    "refrigerator_service",
                    "washing_machine_service",
                    "dishwasher_service",
                    "microwave_service",
                    "geyser_service",
                    "fan_service",
                    "electrical_service",
                    "plumbing_service",
                    "carpentry_service",
                    "pest_control_service",
                    "furniture_service",
                    "lift_service",
                    "general_service",
                    "other_service",
                }:
                    raise ValueError("Unsupported category")
            elif key == "access_window":
                if value != "contact_household_in_app":
                    raise ValueError("Unsupported share scope")
            elif (
                not isinstance(value, str)
                or not value
                or len(value) > 160
                or not all(c.isascii() and (c.isalnum() or c in "-_:") for c in value)
            ):
                raise ValueError("Only safe reference identifiers are permitted")
        fingerprint = sha256(
            (self.name + operation + repr(sorted(payload.items()))).encode()
        ).hexdigest()[:20]
        result: dict[str, Any] = {
            "mode": "mock",
            "external_effect": False,
            "reference": "mock-" + fingerprint,
        }
        if operation == "classify":
            classification = model_provider().classify(
                case_id=payload["case_id"], asset_id=payload["asset_id"]
            )
            result.update(category=classification.category, urgency=classification.urgency)
        elif operation == "record_service_evidence":
            result.update(service_recorded=True, flow_check="documentary_pass")
        elif operation == "payment":
            result.update(amount=payload["amount"], currency="INR", payment_status="mock_succeeded")
        else:
            result["result"] = "simulated"
        return result


def fields(*names: str) -> frozenset[str]:
    return frozenset(names)


class GnaniMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "Gnani",
            "Mock intake only; no voice call or transcription.",
            {"intake": fields("case_id", "asset_id")},
        )


class PineLabsMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "Pine Labs",
            "Mock payment ledger; no funds move.",
            {
                "payment": fields(
                    "case_id", "provider_id", "approval_id", "amount", "idempotency_key"
                )
            },
        )


class DelhiveryMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "Delhivery",
            "Documentary dispatch/evidence placeholders; no actual shipment or technician API.",
            {
                "assign_provider": fields("case_id", "provider_id"),
                "record_service_evidence": fields("case_id", "provider_id"),
                "change_provider": fields("case_id", "provider_id", "approval_id"),
            },
        )


class WhatsAppMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "WhatsApp",
            "Local notification and minimal-scope share mock; nothing is delivered.",
            {
                "notify": fields("case_id", "template"),
                "share_sensitive": fields(
                    "case_id", "asset_id", "provider_id", "issue_category", "access_window"
                ),
            },
        )


class EmailMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "Email",
            "Local templated email mock; no addresses or outbound messages.",
            {"notify": fields("case_id", "template")},
        )


class AIMock(MockAdapter):
    def __init__(self):
        super().__init__(
            "AI",
            "Deterministic fixture classification, not model inference.",
            {"classify": fields("case_id", "asset_id")},
        )


class ConnectorRegistry:
    def __init__(self, mode: str = "mock"):
        if mode != "mock":
            raise ValueError("External/real connectors are unsupported; refusing to start")
        self.adapters: dict[str, Connector] = {
            a.name: a
            for a in (
                GnaniMock(),
                PineLabsMock(),
                DelhiveryMock(),
                WhatsAppMock(),
                EmailMock(),
                AIMock(),
            )
        }

    def execute(self, connector: str, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        if connector not in self.adapters:
            raise ValueError("Unsupported connector")
        return self.adapters[connector].execute(operation, payload)

    def rails(self) -> list[dict[str, Any]]:
        return [
            {
                "name": a.name,
                "description": a.description,
                "mode": "mock",
                "truth_label": SIMULATED,
                "operations": list(a.operations),
            }
            for a in self.adapters.values()
        ]
