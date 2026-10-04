import { useApiMutation, useProviders } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import type { CaseDetail } from "../types/api";
import { formText } from "../utils/forms";
import { HumanInputNote, MutationFeedback, QueryState } from "./ui";
import { SelectField, TextAreaField, TextField } from "./WorkspaceFields";

export function QuoteForm({ item }: { item: CaseDetail }) {
  const providers = useProviders();
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.quote>[1]) =>
      workspaceApi.quote(item.id, body),
  );
  if (item.id === "RK-2048")
    return (
      <p className="small muted">
        RK-2048 retains its fixed documentary quote. Create a new case to enter
        your own service plan and price.
      </p>
    );
  if (item.assigned || ["closed", "cancelled"].includes(item.status))
    return (
      <p className="small muted">
        This assignment cannot be repriced. Additional paid work requires a
        separate case and approval.
      </p>
    );
  const eligible =
    providers.data?.filter(
      (provider) =>
        provider.trade === item.service_category &&
        provider.status === "available" &&
        (!item.provider_id || provider.id === item.provider_id),
    ) ?? [];
  return (
    <section className="space-y-4">
      <h3>Record a provider quote</h3>
      <QueryState
        pending={providers.isPending}
        error={providers.error}
        retry={() => void providers.refetch()}
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate({
              provider_id: formText(data, "provider_id"),
              amount: Number(formText(data, "amount")),
              service_description: formText(data, "service_description"),
              expected_revision: item.service_revision,
            });
          }}
        >
          <SelectField
            label="Quoting provider"
            name="provider_id"
            required
            defaultValue={item.provider_id ?? ""}
          >
            <option value="">Choose an eligible provider</option>
            {eligible.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </SelectField>
          {!eligible.length && (
            <p className="small muted">
              No available provider matches this asset category. Add a provider
              with the matching trade or update availability.
            </p>
          )}
          <TextField
            name="amount"
            label="Quote amount (whole INR)"
            type="number"
            min={0}
            max={1000000}
            step={1}
            required
            defaultValue={item.quote_amount ?? ""}
          />
          <TextAreaField
            name="service_description"
            label="Proposed service"
            required
            minLength={5}
            maxLength={500}
            defaultValue={item.service_description ?? ""}
          />
          <HumanInputNote />
          <p className="small muted">
            Use Provider attribution. Enter the actual local quote, not an
            assumed price. Revised quotes invalidate old approvals; changing
            providers requires separate household approval.
          </p>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !eligible.length}
          >
            {mutation.isPending ? "Saving…" : "Submit quote for approval"}
          </button>
          <MutationFeedback
            mutation={mutation}
            success="Quote saved. Household approval is required before assignment."
          />
        </form>
      </QueryState>
    </section>
  );
}
