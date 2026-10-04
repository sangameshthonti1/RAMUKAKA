from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.connectors.mock import ConnectorRegistry
from app.core.errors import WorkflowError
from app.core.types import SIMULATED, demo_id, new_id, utcnow
from app.models import CaseEvent, ConnectorCall, Decision, Evidence, Notification, ServiceCase


class Audit:
    def __init__(
        self,
        session: Session,
        case: ServiceCase,
        truth: str,
        *,
        at: datetime | None = None,
        namespace: str | None = None,
    ):
        self.session = session
        self.case = case
        self.truth = truth
        self.at = at or utcnow()
        self.namespace = namespace
        self.index = 0

    def record(self, model, **values):
        self.index += 1
        record = model(
            id=demo_id(f"{self.namespace}:{self.index}") if self.namespace else new_id(),
            case_id=self.case.id,
            created_at=self.at + timedelta(microseconds=self.index),
            **values,
        )
        self.session.add(record)
        return record

    def decision(self, action: str, reason: str, rule: str, *, truth: str | None = None):
        return self.record(
            Decision, action=action, reason=reason, rule=rule, truth_label=truth or self.truth
        )

    def event(self, type: str, title: str, detail: str):
        return self.record(CaseEvent, type=type, title=title, detail=detail, truth_label=self.truth)

    def evidence(self, title: str, description: str, source: str, *, service: bool = False):
        return self.record(
            Evidence,
            title=title,
            description=description,
            source=source,
            truth_label=SIMULATED,
            kind="service" if service else "context",
            service_revision=self.case.service_revision if service else None,
            provider_id=self.case.provider_id if service else None,
        )

    def call(self, connector: str, operation: str, payload: dict[str, Any]):
        try:
            response = ConnectorRegistry().execute(connector, operation, payload)
        except (ValueError, RuntimeError) as exc:
            raise WorkflowError(
                503,
                "Mock connector could not complete the operation; no effects were committed",
                case_id=self.case.id,
                action="connector_failure",
                rule="ATOMIC_CONNECTOR_FAILURE",
                truth_label=self.truth,
            ) from exc
        return self.record(
            ConnectorCall,
            connector=connector,
            operation=operation,
            request=payload,
            response=response,
            truth_label=SIMULATED,
            status="mock_succeeded",
        )

    def notify(self, template: str, message: str, channel: str = "WhatsApp"):
        self.call(channel, "notify", {"case_id": self.case.id, "template": template})
        self.record(
            Notification,
            channel=channel,
            message=message,
            truth_label=SIMULATED,
            status="mock_recorded",
        )

    def touch(self):
        self.case.updated_at = self.at
