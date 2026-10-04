import { useApiMutation } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import type { Asset, AssetCategory, Household } from "../types/api";
import { formText } from "../utils/forms";
import { HumanInputNote, MutationFeedback } from "./ui";
import {
  CategoryField,
  SelectField,
  TextAreaField,
  TextField,
} from "./WorkspaceFields";

type AssetExtraFields = Pick<
  Asset,
  "purchased_on" | "warranty_until" | "next_service_on" | "serial_number"
>;
const optionalField = (data: FormData, name: string) =>
  formText(data, name) || null;

export function AssetForm({
  households,
  onCreated,
}: {
  households: Household[];
  onCreated: (id: string) => void;
}) {
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.createAsset>[0] & AssetExtraFields) =>
      workspaceApi.createAsset(body),
  );
  return (
    <details className="disclosure">
      <summary>Add an appliance</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          mutation.mutate(
            {
              household_id: formText(data, "household_id"),
              name: formText(data, "name"),
              category: formText(data, "category") as AssetCategory,
              brand: formText(data, "brand"),
              model: formText(data, "model"),
              location: formText(data, "location"),
              installed_on: formText(data, "installed_on"),
              notes: formText(data, "notes"),
              purchased_on: optionalField(data, "purchased_on"),
              warranty_until: optionalField(data, "warranty_until"),
              next_service_on: optionalField(data, "next_service_on"),
              serial_number: optionalField(data, "serial_number"),
            },
            {
              onSuccess: (asset) => {
                form.reset();
                onCreated(asset.id);
              },
            },
          );
        }}
      >
        <SelectField
          label="Appliance household"
          name="household_id"
          required
          defaultValue=""
        >
          <option value="">Choose a household</option>
          {households.map((home) => (
            <option key={home.id} value={home.id}>
              {home.name}
            </option>
          ))}
        </SelectField>
        {!households.length && (
          <p>Create a household first using the form above.</p>
        )}
        <TextField
          label="Appliance name"
          name="name"
          required
          maxLength={120}
        />
        <CategoryField />
        <TextField label="Brand" name="brand" maxLength={120} />
        <TextField label="Model" name="model" maxLength={120} />
        <TextField
          label="Location in the home"
          name="location"
          required
          maxLength={120}
        />
        <TextField
          label="Installation date"
          name="installed_on"
          type="date"
          required
        />
        <TextField
          label="Purchase date (optional)"
          name="purchased_on"
          type="date"
        />
        <TextField
          label="Warranty expiry (optional)"
          name="warranty_until"
          type="date"
        />
        <TextField
          label="Next service date (optional)"
          name="next_service_on"
          type="date"
        />
        <TextField
          label="Serial number (optional)"
          name="serial_number"
          maxLength={120}
        />
        <p className="small muted">
          Dates are household-recorded and unverified, not proof of purchase,
          warranty coverage, or a booked service.
        </p>
        <TextAreaField label="Appliance notes" name="notes" maxLength={2000} />
        <HumanInputNote />
        <button
          className="btn btn-primary"
          disabled={mutation.isPending || !households.length}
        >
          {mutation.isPending ? "Saving…" : "Save appliance"}
        </button>
        <MutationFeedback
          mutation={mutation}
          success="Appliance saved. It is now available when reporting an issue."
        />
      </form>
    </details>
  );
}

export function EditAssetForm({ asset }: { asset: Asset }) {
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.editAsset>[1] & AssetExtraFields) =>
      workspaceApi.editAsset(asset.id, body),
  );
  return (
    <details className="disclosure">
      <summary>Edit or retire this appliance</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          mutation.mutate({
            name: formText(data, "name"),
            brand: formText(data, "brand"),
            model: formText(data, "model"),
            location: formText(data, "location"),
            notes: formText(data, "notes"),
            status: formText(data, "status") as "active" | "retired",
            purchased_on: optionalField(data, "purchased_on"),
            warranty_until: optionalField(data, "warranty_until"),
            next_service_on: optionalField(data, "next_service_on"),
            serial_number: optionalField(data, "serial_number"),
          });
        }}
      >
        <TextField
          label="Recorded appliance name"
          name="name"
          defaultValue={asset.name}
          required
          maxLength={120}
        />
        <TextField
          label="Recorded brand"
          name="brand"
          defaultValue={asset.brand}
          maxLength={120}
        />
        <TextField
          label="Recorded model"
          name="model"
          defaultValue={asset.model}
          maxLength={120}
        />
        <TextField
          label="Recorded location"
          name="location"
          defaultValue={asset.location}
          required
          maxLength={120}
        />
        <TextField
          label="Recorded purchase date (optional)"
          name="purchased_on"
          type="date"
          defaultValue={asset.purchased_on ?? ""}
        />
        <TextField
          label="Recorded warranty expiry (optional)"
          name="warranty_until"
          type="date"
          defaultValue={asset.warranty_until ?? ""}
        />
        <TextField
          label="Recorded next service date (optional)"
          name="next_service_on"
          type="date"
          defaultValue={asset.next_service_on ?? ""}
        />
        <TextField
          label="Recorded serial number (optional)"
          name="serial_number"
          defaultValue={asset.serial_number ?? ""}
          maxLength={120}
        />
        <TextAreaField
          label="Recorded notes"
          name="notes"
          defaultValue={asset.notes}
          maxLength={2000}
        />
        <SelectField
          label="Appliance status"
          name="status"
          defaultValue={asset.status}
        >
          <option value="active">Active</option>
          <option value="retired">Retired</option>
        </SelectField>
        <p className="small muted">
          Dates are household-recorded and unverified, not proof of purchase,
          warranty coverage, or a booked service. Retirement preserves history
          and is blocked while a case is open. Category, installation date, and
          household remain fixed to protect service scope.
        </p>
        <button className="btn btn-secondary" disabled={mutation.isPending}>
          Save appliance changes
        </button>
        <MutationFeedback
          mutation={mutation}
          success="Appliance changes saved."
        />
      </form>
    </details>
  );
}
