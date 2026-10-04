from typing import Annotated, Literal

from pydantic import Field, StrictBool

from app.schemas.api import Identifier, Input, Output


class Start(Input):
    expected_revision: Annotated[int, Field(strict=True, ge=1)]


class Consent(Input):
    offer_id: Identifier
    approve_cost: StrictBool
    approve_timing: StrictBool


class ProviderResponse(Input):
    offer_id: Identifier
    response: Literal["accept", "decline", "complete"]


class Coordination(Output):
    case_id: str
    mode: Literal["local_mock"] = "local_mock"
    real_calls_supported: Literal[False] = False
    state: dict
