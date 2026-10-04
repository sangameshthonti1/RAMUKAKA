import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiMutation } from "../hooks/useApi";
import { workspaceApi } from "../services/workspace";
import type { CaseDetail } from "../types/api";
import { MutationFeedback } from "./ui";
import { TextAreaField } from "./WorkspaceFields";
import { formText } from "../utils/forms";

export function CancelCaseForm({ item }: { item: CaseDetail }) {
  const [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate();
  const mutation = useApiMutation((body: { reason: string }) => workspaceApi.cancelCase(item.id, body));
  if (item.id === "RK-2048" || item.assigned || ["closed", "cancelled"].includes(item.status)) return null;
  return <details className="disclosure mt-5"><summary>Cancel this unassigned case</summary>
    <form className="form-stack mt-4" onSubmit={(event) => {
      event.preventDefault();
      const reason = formText(new FormData(event.currentTarget), "reason");
      if (confirmed && reason) mutation.mutate({ reason }, { onSuccess: () => navigate("/cases") });
    }}>
      <TextAreaField name="reason" label="Reason for cancellation" maxLength={2000} required />
      <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />I understand that pending approvals will be revoked and this case will not count as completed.</label>
      <p className="small muted">Select Household attribution. Cancellation preserves the record, and is blocked after assignment.</p>
      <button className="btn btn-secondary" disabled={mutation.isPending || !confirmed}>Cancel unassigned case</button>
      <MutationFeedback mutation={mutation} />
    </form>
  </details>;
}
