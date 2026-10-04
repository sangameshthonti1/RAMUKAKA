import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { CaseAction } from "../types/api";
import { useApiMutation, useProviders } from "../hooks/useApi";
import { api } from "../services/api";
import { HumanInputNote, MutationFeedback, QueryState, TruthBadge } from "./ui";
export function CaseActions({ caseId }: { caseId: string }) {
  const [kind, setKind] = useState<"change_provider" | "share_sensitive">(
    "change_provider",
  );
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const providers = useProviders();
  const request = useApiMutation(
    (body: {
      kind: "change_provider" | "share_sensitive";
      reason: string;
      target_provider_id?: string;
    }) => api.approvalRequest(caseId, body),
  );
  const action = useApiMutation((value: CaseAction) =>
    api.action(caseId, value),
  );
  return (
    <div className="space-y-6">
      <div className="guard-callout">
        <LockKeyhole size={20} />
        <div>
          <h3>Permission before action. Always.</h3>
          <p>
            Payment, provider changes and sharing are checked by the server.
            Trying a guarded action without valid approval returns 403 or 409,
            shown below. All connector effects are MOCK; no real money moves.
          </p>
        </div>
      </div>
      <div>
        <h3 className="mb-3">Exercise the server guard</h3>
        <TruthBadge label="DOCUMENTATION_SIMULATION" />
        <div className="button-row mt-3">
          <button
            className="btn btn-secondary"
            disabled={action.isPending}
            onClick={() => action.mutate("payment")}
          >
            Try mock payment
          </button>
          <button
            className="btn btn-secondary"
            disabled={action.isPending}
            onClick={() => action.mutate("change_provider")}
          >
            Apply approved provider change
          </button>
          <button
            className="btn btn-secondary"
            disabled={action.isPending}
            onClick={() => action.mutate("share_sensitive")}
          >
            Run approved mock share
          </button>
        </div>
        <p className="small muted mt-3">
          These buttons call the backend, not a client-side permission check.
          Successful actions consume a scoped authorization; repeats remain
          server-controlled.
        </p>
        <MutationFeedback
          mutation={action}
          success="Mock action accepted by the server. Inspect the connector ledger for its result."
        />
      </div>
      <details className="disclosure">
        <summary>Request a provider change or limited data share</summary>
        <form
          className="form-stack mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate({
              kind,
              reason: reason.trim(),
              ...(kind === "change_provider"
                ? { target_provider_id: target }
                : {}),
            });
          }}
        >
          <label htmlFor="request-kind">Approval scope</label>
          <select
            id="request-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="change_provider">Change provider</option>
            <option value="share_sensitive">
              Share a fixed minimal payload (mock)
            </option>
          </select>
          {kind === "change_provider" && (
            <QueryState
              pending={providers.isPending}
              error={providers.error}
              retry={() => void providers.refetch()}
            >
              <label htmlFor="target-provider">Requested provider</label>
              <select
                id="target-provider"
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Choose a provider</option>
                {providers.data?.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.trade}
                  </option>
                ))}
              </select>
            </QueryState>
          )}
          <label htmlFor="request-reason">Reason for this request</label>
          <textarea
            id="request-reason"
            required
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="small muted">
            Only the requested provider or the server’s fixed minimal payload
            can be used. Never paste private data into the reason.
          </p>
          <HumanInputNote />
          <button
            className="btn btn-primary self-start"
            disabled={
              request.isPending ||
              !reason.trim() ||
              (kind === "change_provider" && !target)
            }
          >
            Create approval request
          </button>
          <MutationFeedback
            mutation={request}
            success="Request created. Review its scope in the approvals section before executing."
          />
        </form>
      </details>
    </div>
  );
}
