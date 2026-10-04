from datetime import datetime, timezone
from enum import StrEnum
from uuid import uuid4, uuid5, NAMESPACE_URL


class TruthLabel(StrEnum):
    LIVE_API = "LIVE_API"
    REAL_HUMAN_INPUT = "REAL_HUMAN_INPUT"
    DOCUMENTATION_SIMULATION = "DOCUMENTATION_SIMULATION"
    PROPOSED_CAPABILITY = "PROPOSED_CAPABILITY"


SIMULATED = TruthLabel.DOCUMENTATION_SIMULATION.value
HUMAN = TruthLabel.REAL_HUMAN_INPUT.value


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


def demo_id(key: str) -> str:
    return str(uuid5(NAMESPACE_URL, "ramukaka:demo:" + key))
