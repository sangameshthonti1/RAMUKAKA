import { useApiMutation } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import type { AssetCategory, Provider } from "../types/api";
import { formText } from "../utils/forms";
import { HumanInputNote, MutationFeedback } from "./ui";
import { CategoryField, TextField, SelectField } from "./WorkspaceFields";

export function CreateProviderForm() {
  const mutation = useApiMutation(workspaceApi.createProvider);
  return (
    <details className="disclosure mt-5">
      <summary>Add a provider record</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          mutation.mutate(
            {
              name: formText(data, "name"),
              trade: formText(data, "trade") as AssetCategory,
            },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <TextField name="name" label="Provider name" required maxLength={120} />
        <CategoryField name="trade" label="Provider trade" />
        <HumanInputNote />
        <p className="small muted">
          This stores an unverified local directory entry, not a partnership or
          booking.
        </p>
        <button className="btn btn-primary" disabled={mutation.isPending}>
          Save provider
        </button>
        <MutationFeedback
          mutation={mutation}
          success="Provider saved to SQLite."
        />
      </form>
    </details>
  );
}
export function EditProviderForm({ provider }: { provider: Provider }) {
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.editProvider>[1]) =>
      workspaceApi.editProvider(provider.id, body),
  );
  return (
    <details className="disclosure mt-3">
      <summary>Edit availability</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          mutation.mutate({
            name: formText(data, "name"),
            status: formText(data, "status") as "available" | "unavailable",
          });
        }}
      >
        <TextField
          name="name"
          label="Recorded provider name"
          defaultValue={provider.name}
          required
          maxLength={120}
        />
        <SelectField
          name="status"
          label="Provider availability"
          defaultValue={provider.status}
        >
          <option value="available">Available</option>
          <option value="unavailable">Unavailable for new assignments</option>
        </SelectField>
        <p className="small muted">
          Existing assigned work remains on record. Trade cannot change
          underneath an approved service.
        </p>
        <button className="btn btn-secondary" disabled={mutation.isPending}>
          Save provider changes
        </button>
        <MutationFeedback mutation={mutation} success="Availability updated." />
      </form>
    </details>
  );
}
