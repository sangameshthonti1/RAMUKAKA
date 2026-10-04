import { useState } from "react";
import { api } from "../services/api";
import { useApiMutation } from "../hooks/useApi";
import { HumanInputNote, MutationFeedback } from "./ui";
export function CaseNoteForm({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState("");
  const [type, setType] = useState<"customer_note" | "emergency">(
    "customer_note",
  );
  const mutation = useApiMutation(
    (body: { type: "customer_note" | "emergency"; detail: string }) =>
      api.event(caseId, body),
  );
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          { type, detail: detail.trim() },
          { onSuccess: () => setDetail("") },
        );
      }}
    >
      <label htmlFor="note-type">Update type</label>
      <select
        id="note-type"
        value={type}
        onChange={(event) => setType(event.target.value as typeof type)}
      >
        <option value="customer_note">Household note</option>
        <option value="emergency">Flag a safety concern</option>
      </select>
      {type === "emergency" && (
        <p className="warning-callout">
          This is not an emergency service. For immediate danger, stop using the
          appliance and contact local emergency services or a qualified
          professional. This flag sends no external alert.
        </p>
      )}
      <label htmlFor="case-note">What should be on the record?</label>
      <textarea
        id="case-note"
        rows={3}
        required
        maxLength={2000}
        value={detail}
        onChange={(event) => setDetail(event.target.value)}
      />
      <HumanInputNote />
      <p className="small muted">
        Notes do not count as service evidence or confirmation and cannot bypass
        the workflow.
      </p>
      <button
        className="btn btn-secondary self-start"
        disabled={mutation.isPending || !detail.trim()}
      >
        Add to timeline
      </button>
      <MutationFeedback mutation={mutation} />
    </form>
  );
}
