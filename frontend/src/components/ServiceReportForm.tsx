import { useApiMutation } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import type { CaseDetail } from "../types/api";
import { formText } from "../utils/forms";
import { HumanInputNote, MutationFeedback } from "./ui";
import { TextAreaField } from "./WorkspaceFields";

export function ServiceReportForm({ item }: { item: CaseDetail }) {
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.serviceReport>[1]) =>
      workspaceApi.serviceReport(item.id, body),
  );
  if (!item.assigned)
    return (
      <p className="small muted">
        Service reporting unlocks after household approval and mock assignment
        from the Case Room.
      </p>
    );
  if (["closed", "cancelled"].includes(item.status))
    return (
      <p className="small muted">
        Case closed. Report an unresolved issue in the Case Room before adding a
        follow-up service report.
      </p>
    );
  return (
    <section className="space-y-4">
      <h3>Record service evidence</h3>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          mutation.mutate(
            {
              provider_id: item.provider_id!,
              expected_revision: item.service_revision,
              work_performed: formText(data, "work_performed"),
              observed_result: formText(data, "observed_result"),
            },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <TextAreaField
          label="Work performed"
          name="work_performed"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Describe the work you actually performed."
        />
        <TextAreaField
          label="Observed result"
          name="observed_result"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Describe your checks and any remaining issue."
        />
        <HumanInputNote />
        <p className="small muted">
          Select Provider attribution. This records your claim, not
          independently verified proof. A new report clears previous
          confirmations; both parties must confirm the current result again.
        </p>
        <button className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save service report"}
        </button>
        <MutationFeedback
          mutation={mutation}
          success="Service report saved. Provider and household must now confirm separately."
        />
      </form>
    </section>
  );
}
