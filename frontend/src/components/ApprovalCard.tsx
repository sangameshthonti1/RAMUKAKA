import { Check, ShieldCheck, X } from "lucide-react";
import type { Approval } from "../types/api";
import { api } from "../services/api";
import { useApiMutation } from "../hooks/useApi";
import { humanize, money } from "../utils/format";
import { MutationFeedback, StatusBadge } from "./ui";
export function ApprovalCard({ approval }: { approval: Approval }) {
  const mutation = useApiMutation((decision: "approved" | "rejected") =>
    api.approval(approval.case_id, approval.kind, decision),
  );
  return (
    <article
      className={`approval-card ${approval.status === "pending" ? "pending" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow flex items-center gap-2">
          <ShieldCheck size={16} />
          {humanize(approval.kind)} approval
        </span>
        <StatusBadge status={approval.status} />
      </div>
      <p className="approval-amount">
        {approval.kind === "spend"
          ? money(approval.amount)
          : humanize(approval.kind)}
      </p>
      <p>{approval.reason}</p>
      {approval.status === "pending" && (
        <>
          <p className="small muted mt-3">
            Your decision is recorded locally. Approval grants only the recorded
            scope; it does not itself execute an action.
          </p>
          <div className="button-row mt-4">
            <button
              className="btn btn-approval"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("approved")}
            >
              <Check size={17} />
              {approval.kind === "spend"
                ? `Approve ${money(approval.amount)}`
                : `Approve ${humanize(approval.kind).toLowerCase()}`}
            </button>
            <button
              className="btn btn-secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("rejected")}
            >
              <X size={17} />
              Reject
              {approval.kind === "spend" ? ` ${money(approval.amount)}` : ""}
            </button>
          </div>
        </>
      )}
      <MutationFeedback
        mutation={mutation}
        success="Decision recorded. The backend remains the authority for the next step."
      />
    </article>
  );
}
