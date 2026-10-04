import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useCase, useCases } from "../hooks/useApi";
import { ApprovalCard } from "../components/ApprovalCard";
import { CaseActions } from "../components/CaseActions";
import { CaseWorkflow } from "../components/CaseWorkflow";
import { CancelCaseForm } from "../components/CancelCaseForm";
import { CaseList } from "../components/CaseList";
import { CaseNoteForm } from "../components/CaseNoteForm";
import { ConfirmationForm } from "../components/ConfirmationForm";
import { Timeline } from "../components/Timeline";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { dateTime, humanize, money } from "../utils/format";
function CaseDetailView({ id }: { id: string }) {
  const query = useCase(id);
  const item = query.data;
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
              <p className="small muted mt-3" role="status">
                Agent status: {humanize(item.status)}. Deterministic rules only;
                no background execution or live model inference.
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
          <CaseWorkflow item={item} />
          <CancelCaseForm item={item} />
          <div className="detail-grid">
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
              <Panel
                title="Evidence on record"
                action={
                  <RouteLink to={`/evidence?case=${encodeURIComponent(id)}`}>
                    Full ledger
                  </RouteLink>
                }
              >
                {item.evidence.length ? (
                  <div className="record-list">
                    {item.evidence.map((evidence) => (
                      <article key={evidence.id}>
                        <h3>{evidence.title}</h3>
                        <p>{evidence.description}</p>
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
              <Panel title="Add context, not assumptions">
                <CaseNoteForm caseId={id} />
              </Panel>
            </div>
            <div className="space-y-6">
              <Panel title="Approval desk" kicker="YOU HAVE THE FINAL SAY">
                {item.approvals.length ? (
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
              <Panel title="Close the loop">
                <p className="small muted mb-5">
                  For new cases, approve and assign the quote, then record a
                  service report in the Provider Desk. Both parties must confirm
                  separately. RK-2048 also supports the documentary simulation.
                </p>
                <div className="space-y-6">
                  <ConfirmationForm item={item} party="provider" />
                  <ConfirmationForm item={item} party="household" />
                </div>
                <div className="mt-5">
                  <RouteLink to="/simulation">
                    Open simulation controls
                  </RouteLink>
                </div>
              </Panel>
            </div>
          </div>
          <Panel title="Scoped actions & server guards" className="mt-6">
            <CaseActions caseId={id} />
          </Panel>
        </>
      )}
    </QueryState>
  );
}
export default function CaseRoomPage() {
  const { caseId } = useParams();
  const cases = useCases();
  return (
    <>
      <PageHeading
        eyebrow="FROM COMPLAINT TO CONFIRMATION"
        title="Case Room"
        description="One shared record. Clear ownership. No silent decisions."
        action={
          <Link className="btn btn-secondary" to="/my-home?report=1">
            New complaint
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      {caseId ? (
        <>
          <Link className="text-link mb-5" to="/cases">
            <ArrowLeft size={16} />
            All cases
          </Link>
          <CaseDetailView key={caseId} id={caseId} />
        </>
      ) : (
        <>
          <Panel title="All household cases">
            <QueryState
              pending={cases.isPending}
              error={cases.error}
              retry={() => void cases.refetch()}
            >
              <CaseList cases={cases.data ?? []} />
            </QueryState>
          </Panel>
          <p className="small muted mt-4">
            Select a case to review its quote, approvals, evidence, decisions
            and two-party confirmation.
          </p>
        </>
      )}
    </>
  );
}
