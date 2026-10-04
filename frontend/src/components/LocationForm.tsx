import { useState } from "react";
import { useApiMutation } from "../hooks/useApi";
import { coordinationApi } from "../services/coordination";
import type { Household, Provider } from "../types/api";
import { TextField } from "./WorkspaceFields";
import { MutationFeedback } from "./ui";

export function LocationForm({
  record,
  party,
}: {
  record: Household | Provider;
  party: "household" | "provider";
}) {
  const [error, setError] = useState("");
  const mutation = useApiMutation(
    async (body: Parameters<typeof coordinationApi.householdLocation>[1]) =>
      party === "household"
        ? coordinationApi.householdLocation(record.id, body)
        : coordinationApi.providerLocation(record.id, body),
  );
  return (
    <form
      className="form-stack mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const lat = String(data.get("latitude") ?? "").trim();
        const lon = String(data.get("longitude") ?? "").trim();
        if (Boolean(lat) !== Boolean(lon)) {
          setError("Supply both latitude and longitude or neither.");
          return;
        }
        setError("");
        mutation.mutate({
          address: String(data.get("address") ?? "").trim() || null,
          latitude: lat ? Number(lat) : null,
          longitude: lon ? Number(lon) : null,
        });
      }}
    >
      <h3>
        {party === "household"
          ? "Household location"
          : "Recorded shop location"}
      </h3>
      <TextField
        name="address"
        label={
          party === "household"
            ? "Household address (optional)"
            : "Shop address (optional)"
        }
        maxLength={500}
        defaultValue={
          "address" in record
            ? (record.address ?? "")
            : (record.shop_address ?? "")
        }
      />
      <TextField
        name="latitude"
        label="Latitude (optional)"
        type="number"
        min={-90}
        max={90}
        step="any"
        defaultValue={record.latitude ?? ""}
      />
      <TextField
        name="longitude"
        label="Longitude (optional)"
        type="number"
        min={-180}
        max={180}
        step="any"
        defaultValue={record.longitude ?? ""}
      />
      <p className="small muted">
        Enter both coordinates for distance calculations; an address alone is
        not geocoded. Blank fields clear saved values. No live location lookup
        occurs.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-secondary" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save recorded location"}
      </button>
      <MutationFeedback
        mutation={mutation}
        success="Location saved to the local record."
      />
    </form>
  );
}
