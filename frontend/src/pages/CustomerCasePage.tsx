import { useState } from "react";
import { CoordinationPanel } from "../components/CoordinationPanel";
import { useCoordination } from "../hooks/useCoordination";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ApprovalCard } from "../components/ApprovalCard";
import { CaseNoteForm } from "../components/CaseNoteForm";
import { ConfirmationForm } from "../components/ConfirmationForm";
import { Timeline } from "../components/Timeline";
import { TextAreaField } from "../components/WorkspaceFields";
import {
  EmptyState,
  MutationFeedback,
  PageHeading,
  Panel,
  QueryState,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { useApiMutation, useCase, useCases } from "../hooks/useApi";
import { api } from "../services/api";
import { workspaceApi } from "../services/workspace";
import type { CaseDetail } from "../types/api";
import { dateTime, humanize, money } from "../utils/format";

function CustomerCancellation({ item }: { item: CaseDetail }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate();
  const mutation = useApiMutation((body: { reason: string }) =>
    workspaceApi.cancelCase(item.id, body),
  );

  if (
    item.id === "RK-2048" ||
    item.assigned ||
    ["closed", "cancelled"].includes(item.status)
  )
    return null;

  return (
    <details className="disclosure mt-5">
      <summary>Cancel this unassigned case</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmed && reason.trim()) {
            mutation.mutate(
              { reason: reason.trim() },
              { onSuccess: () => navigate("/customer/cases") },
            );
          }
        }}
      >
        <TextAreaField
          name="reason"
          label="Reason for cancellation"
          maxLength={2000}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
          />
          I understand that pending approvals will be revoked and this case will
          not count as completed.
        </label>
        <p className="small muted">
          Select Household attribution. Cancellation preserves the record and is
          blocked after assignment.
        </p>
        <button
          className="btn btn-secondary"
          disabled={mutation.isPending || !confirmed || !reason.trim()}
        >
          {mutation.isPending ? "Cancelling…" : "Cancel unassigned case"}
        </button>
        <MutationFeedback mutation={mutation} />
      </form>
    </details>
  );
}

function CustomerCaseDetail({ id }: { id: string }) {
  const query = useCase(id);
  const coordination = useCoordination(id);
  const assignment = useApiMutation(() => api.action(id, "payment"));
  const item = query.data;
  const currentServiceEvidence = item?.evidence.some(
    (evidence) =>
      evidence.kind === "service" &&
      evidence.service_revision === item.service_revision &&
      evidence.provider_id === item.provider_id,
  );

  return (
    <QueryState
      pending={query.isPending}
      error={query.error}
      retry={() => void query.refetch()}
    >
      {item && (
        <>
          <section className="case-summary">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">{item.id}</span>
                <StatusBadge status={item.status} />
              </div>
              <h2>{item.title}</h2>
              <p className="preserve-text">{item.complaint}</p>
              <p className="small muted mt-3">
                {humanize(item.service_category)} ·{" "}
                {item.service_description ??
                  "Awaiting a service plan and quote"}
              </p>
              <p className="small muted mt-3">
                Asset {item.asset_id} · Household {item.household_id} · Updated{" "}
                {dateTime(item.updated_at)}
              </p>
            </div>
            <div className="quote-summary">
              <span className="tiny-label">RECORDED QUOTE</span>
              <strong>{money(item.quote_amount)}</strong>
              <span className="small muted">Mock payment only</span>
            </div>
          </section>
          <CoordinationPanel item={item} />
          {!coordination.data &&
            !coordination.isPending &&
            !coordination.error &&
            !item.assigned &&
            item.status === "approved" &&
            item.approvals.some(
              (approval) =>
                approval.kind === "spend" && approval.status === "approved",
            ) && (
              <Panel
                title="Assign approved service"
                kicker="YOUR DECISION"
                className="mt-6"
              >
                <p className="small muted mb-4">
                  Assign the quoted provider using the approved scope. This
                  creates a local mock receipt; no payment, appointment, or
                  visit occurs.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={assignment.isPending}
                  onClick={() => assignment.mutate()}
                >
                  {assignment.isPending
                    ? "Assigning…"
                    : "Assign approved provider (mock)"}
                </button>
                <MutationFeedback
                  mutation={assignment}
                  success="Local assignment recorded. The provider can now report work."
                />
              </Panel>
            )}
          <CustomerCancellation item={item} />
          <div className="detail-grid mt-6">
            <div className="space-y-6">
              <Panel
                title="The story so far"
                kicker="CASE TIMELINE"
                action={
                  <span className="tiny-label">
                    {item.events.length} EVENTS
                  </span>
                }
              >
                <Timeline events={item.events} />
              </Panel>
              <Panel title="Evidence on record">
                {item.evidence.length ? (
                  <div className="record-list">
                    {item.evidence.map((evidence) => (
                      <article key={evidence.id}>
                        <h3>{evidence.title}</h3>
                        <p className="preserve-text">{evidence.description}</p>
                        <p className="small muted">Source: {evidence.source}</p>
                        <TruthBadge label={evidence.truth_label} />
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No evidence recorded">
                    Assignment and service evidence must exist before either
                    party can confirm.
                  </EmptyState>
                )}
              </Panel>
              {item.status !== "cancelled" && (
                <Panel title="Add context, not assumptions">
                  <CaseNoteForm caseId={id} />
                </Panel>
              )}
            </div>
            <div className="space-y-6">
              <Panel title="Approval desk" kicker="YOU HAVE THE FINAL SAY">
                {coordination.data ? (
                  <p className="small muted">
                    Approve the total cost and timing together in automatic
                    coordination above. Assignment follows automatically;
                    separate spend approval is not enough.
                  </p>
                ) : item.approvals.length ? (
                  <div className="space-y-4">
                    {item.approvals.map((approval) => (
                      <ApprovalCard key={approval.id} approval={approval} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No approval requests">
                    A complaint does not automatically authorize spend.
                  </EmptyState>
                )}
              </Panel>
              <Panel title="Household verification">
                {item.assigned &&
                currentServiceEvidence &&
                item.status !== "cancelled" ? (
                  <ConfirmationForm item={item} party="household" />
                ) : (
                  <EmptyState title="Not ready for household confirmation">
                    An assigned provider must record service evidence for the
                    current service plan first.
                  </EmptyState>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </QueryState>
  );
}

export default function CustomerCasePage() {
  const { caseId } = useParams();
  const cases = useCases();

  return (
    <>
      <PageHeading
        eyebrow="HOUSEHOLD CASES"
        title={caseId ? "Your case" : "Your cases"}
        description="Review your request, make approval decisions, and verify the outcome yourself."
      />
      {caseId ? (
        <>
          <Link className="text-link mb-5" to="/customer/cases">
            <ArrowLeft size={16} /> All cases
          </Link>
          <CustomerCaseDetail key={caseId} id={caseId} />
        </>
      ) : (
        <Panel title="All household cases">
          <QueryState
            pending={cases.isPending}
            error={cases.error}
            retry={() => void cases.refetch()}
          >
            {cases.data?.length ? (
              <div className="case-list">
                {cases.data.map((item) => (
                  <Link
                    className="case-row"
                    key={item.id}
                    to={`/customer/cases/${encodeURIComponent(item.id)}`}
                  >
                    <div className="case-row-main">
                      <span className="tiny-label">{item.id}</span>
                      <h3>{item.title}</h3>
                      <p>{item.complaint}</p>
                    </div>
                    <div className="case-row-meta">
                      <StatusBadge status={item.status} />
                      <span className="case-price">
                        {money(item.quote_amount)}
                      </span>
                    </div>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No cases yet">
                Report an issue from My Home to start a local case.
              </EmptyState>
            )}
          </QueryState>
        </Panel>
      )}
    </>
  );
}
