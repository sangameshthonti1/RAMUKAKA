import { useApiMutation } from "../hooks/useApi";
import { api } from "../services/api";
import type { CaseDetail } from "../types/api";
import { humanize } from "../utils/format";
import { MutationFeedback, Panel, RouteLink } from "./ui";

export function CaseWorkflow({ item }: { item: CaseDetail }) {
  const assignment = useApiMutation(() => api.action(item.id, "payment"));
  const quoteApproved =
    item.approvals.filter((approval) => approval.kind === "spend").at(-1)
      ?.status === "approved";
  const currentEvidence = item.evidence.some(
    (evidence) =>
      evidence.kind === "service" &&
      evidence.service_revision === item.service_revision &&
      evidence.provider_id === item.provider_id,
  );
  const steps = [
    { label: "Quote recorded", complete: item.quote_amount !== null },
    { label: "Household approval", complete: quoteApproved },
    { label: "Assigned", complete: item.assigned },
    { label: "Service report", complete: currentEvidence },
    { label: "Provider confirms", complete: item.provider_confirmed },
    { label: "Household confirms", complete: item.household_confirmed },
  ];
  return (
    <Panel
      title="Next steps for this case"
      className="mb-6"
      kicker="PERSISTENT WORKFLOW"
    >
      <p className="muted mb-4">
        {humanize(item.service_category)} ·{" "}
        {item.service_description ??
          "Waiting for an explicit provider service plan and quote."}
      </p>
      <ol className="step-grid">
        {steps.map((step, index) => (
          <li key={step.label} className={step.complete ? "done" : ""}>
            <span>{step.complete ? "✓" : index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.complete ? "Recorded" : "Pending"}</small>
          </li>
        ))}
      </ol>
      <div className="button-row mt-4">
        <RouteLink to={`/providers?case=${encodeURIComponent(item.id)}`}>
          Provider quote & service report
        </RouteLink>
        {!item.assigned && !["closed", "cancelled"].includes(item.status) && (
          <button
            className="btn btn-primary"
            disabled={assignment.isPending || !quoteApproved}
            onClick={() => assignment.mutate()}
          >
            {assignment.isPending
              ? "Assigning…"
              : "Assign approved service (mock payment)"}
          </button>
        )}
      </div>
      <p className="small muted mt-3">
        Household approves below, then assigns. Provider records work and
        confirms; household checks and confirms separately. Assignment uses
        local mocks and moves no money.
      </p>
      <MutationFeedback
        mutation={assignment}
        success="Assignment recorded. The Provider Desk can now accept a service report."
      />
    </Panel>
  );
}
