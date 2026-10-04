from datetime import date
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.api import Identifier, Input, Text

Name = Annotated[str, Field(min_length=1, max_length=120)]
Category = Literal[
    "water_purifier",
    "air_conditioner",
    "refrigerator",
    "washing_machine",
    "dishwasher",
    "microwave",
    "geyser",
    "fan",
    "electrical",
    "plumbing",
    "carpentry",
    "pest_control",
    "furniture",
    "lift",
    "general",
    "other",
]


class Location(Input):
    address: Annotated[str, Field(max_length=500)] | None = None
    latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Supply both latitude and longitude or neither")
        return self


class HouseholdCreate(Location):
    name: Name
    member_name: Name


class ParticipantCreate(Input):
    name: Name


class AssetCreate(Input):
    household_id: Identifier
    name: Name
    category: Category
    brand: Annotated[str, Field(max_length=120)] = ""
    model: Annotated[str, Field(max_length=120)] = ""
    location: Name
    installed_on: date
    purchased_on: date | None = None
    warranty_until: date | None = None
    next_service_on: date | None = None
    serial_number: Annotated[str, Field(max_length=120)] | None = None
    notes: Annotated[str, Field(max_length=2000)] = ""

    @field_validator("installed_on")
    @classmethod
    def not_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Installation date cannot be in the future")
        return value

    @model_validator(mode="after")
    def valid_purchase(self):
        if self.purchased_on and self.purchased_on > date.today():
            raise ValueError("Purchase date cannot be in the future")
        if self.purchased_on and self.warranty_until and self.warranty_until < self.purchased_on:
            raise ValueError("Warranty expiry cannot precede purchase")
        return self


class AssetEdit(Input):
    name: Name
    brand: Annotated[str, Field(max_length=120)] = ""
    model: Annotated[str, Field(max_length=120)] = ""
    location: Name
    notes: Annotated[str, Field(max_length=2000)] = ""
    purchased_on: date | None = None
    warranty_until: date | None = None
    next_service_on: date | None = None
    serial_number: Annotated[str, Field(max_length=120)] | None = None
    status: Literal["active", "retired"]

    @model_validator(mode="after")
    def valid_purchase(self):
        if self.purchased_on and self.purchased_on > date.today():
            raise ValueError("Purchase date cannot be in the future")
        if self.purchased_on and self.warranty_until and self.warranty_until < self.purchased_on:
            raise ValueError("Warranty expiry cannot precede purchase")
        return self


class ProviderCreate(Input):
    name: Name
    trade: Category
    shop_address: Annotated[str, Field(max_length=500)] | None = None
    latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Supply both latitude and longitude or neither")
        return self


class ProviderEdit(Input):
    name: Name
    status: Literal["available", "unavailable"]


class QuoteCreate(Input):
    provider_id: Identifier
    amount: Annotated[int, Field(strict=True, ge=0, le=1000000)]
    service_description: Annotated[str, Field(min_length=5, max_length=500)]
    expected_revision: Annotated[int, Field(strict=True, ge=1)]


class CaseCancel(Input):
    reason: Text


class ServiceReportCreate(Input):
    provider_id: Identifier
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    work_performed: Annotated[str, Field(min_length=10, max_length=2000)]
    observed_result: Annotated[str, Field(min_length=10, max_length=2000)]
