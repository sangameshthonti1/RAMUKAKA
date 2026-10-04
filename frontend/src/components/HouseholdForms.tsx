import { useApiMutation } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import { formText } from "../utils/forms";
import { HumanInputNote, MutationFeedback } from "./ui";
import { TextField } from "./WorkspaceFields";

export function CreateHouseholdForm() {
  const mutation = useApiMutation(workspaceApi.createHousehold);
  return <details className="disclosure">
    <summary>Create a household</summary>
    <form className="form-stack mt-4" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      mutation.mutate({ name: formText(data, "name"), member_name: formText(data, "member_name") }, { onSuccess: () => form.reset() });
    }}>
      <TextField label="Household name" name="name" required maxLength={120} placeholder="For example: Our home" />
      <TextField label="First household member" name="member_name" required maxLength={120} />
      <HumanInputNote />
      <p className="small muted">Saved to SQLite. Select Household attribution. This local workspace is not an authenticated multi-user service.</p>
      <button className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save household"}</button>
      <MutationFeedback mutation={mutation} success="Household saved to the database." />
    </form>
  </details>;
}
export function AddParticipantForm({ householdId }: { householdId: string }) {
  const mutation = useApiMutation((body: { name: string }) => workspaceApi.addParticipant(householdId, body));
  return <details className="disclosure mt-4"><summary>Add household member</summary>
    <form className="form-stack mt-4" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      mutation.mutate({ name: formText(new FormData(form), "name") }, { onSuccess: () => form.reset() });
    }}>
      <TextField label="Member name" name="name" required maxLength={120} />
      <button className="btn btn-secondary" disabled={mutation.isPending}>Save member</button>
      <MutationFeedback mutation={mutation} success="Member saved locally." />
    </form>
  </details>;
}
