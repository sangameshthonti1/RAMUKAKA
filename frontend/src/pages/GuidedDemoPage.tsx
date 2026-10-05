import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  Circle,
  FileCheck2,
  Camera,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "../services/api";
import { workspaceApi } from "../services/workspace";
import { keys, useApiMutation, useCase } from "../hooks/useApi";
import { setDemoRole } from "../store/demo";
import type { AgentRun, CaseDetail } from "../types/api";
import {
  MutationFeedback,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { money } from "../utils/format";
import { fileEvidenceReceipt } from "../utils/evidence";

const CASE_ID = "RK-2048";
const PROVIDER_ID = "provider-kent-care";
const checkpoints = [
  "Approve price",
  "Assign provider",
  "Add work proof",
  "Provider checks",
  "Customer checks",
  "Case complete",
];

const decisionLabels: Record<string, string> = {
  request_household_approval: "Ask the customer to approve the price",
  proceed_with_approved_service: "Assign the approved service provider",
  request_provider_evidence: "Ask the provider for proof of work",
  request_provider_confirmation: "Ask the provider to confirm completion",
  request_household_confirmation: "Ask the customer to check the result",
  close_if_guards_pass: "Close the case after all checks pass",
  escalate_human: "Ask a person to review the case",
};

const ruleExplanations: Record<string, string> = {
  APPROVAL_REQUIRED: "Nothing can be paid or assigned before the customer approves the exact price.",
  APPROVED_SCOPE_ONLY: "Only the service, provider and price that the customer approved may proceed.",
  SERVICE_EVIDENCE_REQUIRED: "The provider must record what was done and what result they observed.",
  PROVIDER_CONFIRMATION_REQUIRED: "The provider must confirm their work separately from the customer.",
  HOUSEHOLD_CONFIRMATION_REQUIRED: "The customer must personally check the result before the case can close.",
  TWO_SIDED_CLOSURE: "The case closes only when both sides confirm and matching work proof exists.",
  HUMAN_REVIEW_BOUNDARY: "RamuKaka has stopped and asked a person to review the case.",
};

type DemoStage = {
  index: number;
  actor: "household" | "provider" | "system";
  title: string;
  explanation: string;
};

function hasCurrentServiceEvidence(item: CaseDetail) {
  return item.evidence.some(
    (record) =>
      record.kind === "service" &&
      record.service_revision === item.service_revision &&
      record.provider_id === item.provider_id,
  );
}

function getStage(item: CaseDetail): DemoStage {
  const spend = item.approvals.find((approval) => approval.kind === "spend");
  if (spend?.status !== "approved")
    return {
      index: 0,
      actor: "household",
      title: `Approve the ${money(item.quote_amount)} service`,
      explanation:
        "The customer must approve the exact price before RamuKaka can assign a service provider.",
    };
  if (!item.assigned)
    return {
      index: 1,
      actor: "system",
      title: "Assign the approved provider",
      explanation:
        "The price is approved. RamuKaka can now assign the selected provider for this service only.",
    };
  if (!hasCurrentServiceEvidence(item))
    return {
      index: 2,
      actor: "provider",
      title: "Add proof of the work performed",
      explanation:
        "The provider records what they did and what they observed after testing the purifier.",
    };
  if (!item.provider_confirmed)
    return {
      index: 3,
      actor: "provider",
      title: "Provider checks and confirms their work",
      explanation:
        "The service report is saved. The provider must now confirm that it accurately describes the completed work.",
    };
  if (!item.household_confirmed)
    return {
      index: 4,
      actor: "household",
      title: "Customer checks the result",
      explanation:
        "The customer tests the purifier for themselves. The provider cannot close the case alone.",
    };
  return {
    index: 5,
    actor: "system",
    title:
      item.status === "closed"
        ? "Service completed and checked by both sides"
        : "Complete the case after all checks pass",
    explanation:
      "The customer and provider both confirmed the result, and the work report matches this service.",
  };
}

function actorLabel(actor: DemoStage["actor"]) {
  if (actor === "household") return "Customer needs to act";
  if (actor === "provider") return "Provider needs to act";
  return "RamuKaka handles this";
}

export default function GuidedDemoPage() {
  const detail = useCase(CASE_ID);
  const connectors = useQuery({
    queryKey: keys.connectors,
    queryFn: api.connectors,
  });
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [workPerformed, setWorkPerformed] = useState(
    "Replaced the purifier filter and checked all inlet and outlet connections.",
  );
  const [observedResult, setObservedResult] = useState(
    "Water flow returned to normal during the technician's on-site test. No remaining issue was observed.",
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [providerNote, setProviderNote] = useState(
    "I checked the replacement and observed normal water flow after service.",
  );
  const [householdNote, setHouseholdNote] = useState(
    "I tested the purifier at home and the water flow is back to normal.",
  );

  const item = detail.data;
  const stage = item ? getStage(item) : null;
  const spend = item?.approvals.find((approval) => approval.kind === "spend");
  const liveCalls = useMemo(
    () => connectors.data?.filter((call) => call.truth_label === "LIVE_API") ?? [],
    [connectors.data],
  );
  const documentedCalls = useMemo(
    () =>
      connectors.data?.filter(
        (call) => call.truth_label === "DOCUMENTATION_SIMULATION",
      ) ?? [],
    [connectors.data],
  );

  const runAgent = useApiMutation(() => api.runAgentDecision(CASE_ID));
  const approve = useApiMutation(() => {
    setDemoRole("household");
    return api.approval(CASE_ID, "spend", "approved");
  });
  const assign = useApiMutation(() => {
    setDemoRole("household");
    return api.action(CASE_ID, "payment");
  });
  const report = useApiMutation(async () => {
    setDemoRole("provider");
    if (!proofFile) throw new Error("Capture or select a photo/video proof first.");
    return workspaceApi.serviceReport(CASE_ID, {
      provider_id: PROVIDER_ID,
      expected_revision: item!.service_revision,
      work_performed: workPerformed.trim(),
      observed_result: observedResult.trim(),
      ...(await fileEvidenceReceipt(proofFile)),
    });
  });
  const providerConfirm = useApiMutation(() => {
    setDemoRole("provider");
    return api.confirmation(CASE_ID, "provider", {
      confirmed: true,
      note: providerNote.trim(),
    });
  });
  const householdConfirm = useApiMutation(() => {
    setDemoRole("household");
    return api.confirmation(CASE_ID, "household", {
      confirmed: true,
      note: householdNote.trim(),
    });
  });
  const reset = useApiMutation(() => api.reset());

  const submit = (event: FormEvent, action: () => void) => {
    event.preventDefault();
    setAgentRun(null);
    action();
  };

  return (
    <>
      <PageHeading
        eyebrow="ROUND 3 · STEP-BY-STEP DEMO"
        title="One repair. One clear next step."
        description="RamuKaka checks what is missing and asks the right person to act. The repair is complete only after the customer and provider both confirm it."
      />
      <QueryState
        pending={detail.isPending}
        error={detail.error}
        retry={() => void detail.refetch()}
      >
        {item && stage && (
          <>
            <section className="guided-overview" aria-label="Demo progress">
              <div className="guided-case-heading">
                <div>
                  <p className="eyebrow">{item.id} · KENT WATER PURIFIER</p>
                  <h2>{item.title}</h2>
                  <p>{item.complaint}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <ol className="guided-steps">
                {checkpoints.map((label, index) => {
                  const done = index < stage.index || item.status === "closed";
                  const current = index === stage.index && item.status !== "closed";
                  return (
                    <li
                      key={label}
                      className={done ? "done" : current ? "current" : ""}
                      aria-current={current ? "step" : undefined}
                    >
                      <span>{done ? <Check size={16} /> : <Circle size={13} />}</span>
                      <small>{label}</small>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="guided-layout">
              <section className="guided-primary panel">
                <div className="guided-action-heading">
                  <div>
                    <p className="eyebrow">WHAT HAPPENS NEXT · {actorLabel(stage.actor).toUpperCase()}</p>
                    <h2>{stage.title}</h2>
                    <p>{stage.explanation}</p>
                  </div>
                  <span className={`actor-pill ${stage.actor}`}>
                    {actorLabel(stage.actor)}
                  </span>
                </div>

                {item.status !== "closed" && (
                  <div className="agent-checkpoint">
                    <div className="flex items-start gap-3">
                      <span className="large-icon"><Bot size={24} /></span>
                      <div>
                        <h3>Ask RamuKaka what should happen next</h3>
                        <p className="small muted">
                          The live AI checks the current case and chooses one safe next step. It cannot skip required approval or proof.
                        </p>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={runAgent.isPending}
                      onClick={() =>
                        runAgent.mutate(undefined, {
                          onSuccess: (result) => setAgentRun(result),
                        })
                      }
                    >
                      <Sparkles size={17} />
                      {runAgent.isPending ? "RamuKaka is checking…" : "Ask RamuKaka"}
                    </button>
                    <MutationFeedback mutation={runAgent} />
                    {agentRun?.decision && (
                      <article className="agent-result">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>
                            {decisionLabels[agentRun.decision.action] ??
                              agentRun.decision.action.replaceAll("_", " ")}
                          </strong>
                          <TruthBadge label="LIVE_API" />
                        </div>
                        <p>{agentRun.notification?.message}</p>
                        <small>
                          Why this step: {ruleExplanations[agentRun.decision.rule] ?? agentRun.decision.reason}
                        </small>
                      </article>
                    )}
                  </div>
                )}

                {stage.index === 0 && (
                  <div className="guided-human-action">
                    <h3>Customer approval</h3>
                    <p>{spend?.reason}</p>
                    <button
                      className="btn btn-approval"
                      disabled={approve.isPending}
                      onClick={() => {
                        setAgentRun(null);
                        approve.mutate();
                      }}
                    >
                      <ShieldCheck size={17} />
                      {approve.isPending ? "Recording approval…" : `Approve ${money(item.quote_amount)}`}
                    </button>
                    <MutationFeedback mutation={approve} success="Approval recorded. The next checkpoint is ready." />
                  </div>
                )}

                {stage.index === 1 && (
                  <div className="guided-human-action">
                    <h3>Assign the selected service provider</h3>
                    <p>The customer approved this exact service and price. This demo records an assignment but makes no real payment or booking.</p>
                    <button
                      className="btn btn-primary"
                      disabled={assign.isPending}
                      onClick={() => {
                        setAgentRun(null);
                        assign.mutate();
                      }}
                    >
                      <ArrowRight size={17} />
                      {assign.isPending ? "Assigning…" : "Assign approved provider (mock)"}
                    </button>
                    <MutationFeedback mutation={assign} success="Provider assigned. Service evidence is now required." />
                  </div>
                )}

                {stage.index === 2 && (
                  <form className="guided-human-action form-stack" onSubmit={(event) => submit(event, () => report.mutate())}>
                    <h3>Provider's work report</h3>
                    <label htmlFor="guided-work">Work performed</label>
                    <textarea id="guided-work" required minLength={10} maxLength={2000} rows={3} value={workPerformed} onChange={(event) => setWorkPerformed(event.target.value)} />
                    <label htmlFor="guided-result">Observed result</label>
                    <textarea id="guided-result" required minLength={10} maxLength={2000} rows={3} value={observedResult} onChange={(event) => setObservedResult(event.target.value)} />
                    <label htmlFor="guided-proof">Photo or video of the completed work</label>
                    <input
                      id="guided-proof"
                      type="file"
                      accept="image/*,video/*"
                      capture="environment"
                      required
                      onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                    />
                    {proofFile && (
                      <p className="small muted"><Camera size={15} /> Ready to record: {proofFile.name} · {(proofFile.size / 1024).toFixed(1)} KB</p>
                    )}
                    <p className="small muted">Provider-supplied evidence · the system records its capture time and SHA-256 fingerprint. This makes later changes detectable; it does not independently prove the physical claim.</p>
                    <button className="btn btn-primary self-start" disabled={report.isPending || !workPerformed.trim() || !observedResult.trim() || !proofFile}>
                      <FileCheck2 size={17} /> {report.isPending ? "Recording evidence…" : "Save report and evidence"}
                    </button>
                    <MutationFeedback mutation={report} success="Service evidence saved. Provider confirmation is now required." />
                  </form>
                )}

                {stage.index === 3 && (
                  <form className="guided-human-action form-stack" onSubmit={(event) => submit(event, () => providerConfirm.mutate())}>
                    <h3>Provider's final check</h3>
                    <label htmlFor="guided-provider-note">What did the provider personally check?</label>
                    <textarea id="guided-provider-note" required maxLength={2000} rows={3} value={providerNote} onChange={(event) => setProviderNote(event.target.value)} />
                    <button className="btn btn-primary self-start" disabled={providerConfirm.isPending || !providerNote.trim()}>
                      <Check size={17} /> {providerConfirm.isPending ? "Confirming…" : "Provider confirms completion"}
                    </button>
                    <MutationFeedback mutation={providerConfirm} success="Provider confirmation recorded. The household must verify independently." />
                  </form>
                )}

                {stage.index === 4 && (
                  <form className="guided-human-action form-stack" onSubmit={(event) => submit(event, () => householdConfirm.mutate())}>
                    <h3>Customer's final check</h3>
                    <label htmlFor="guided-household-note">What did the household personally check?</label>
                    <textarea id="guided-household-note" required maxLength={2000} rows={3} value={householdNote} onChange={(event) => setHouseholdNote(event.target.value)} />
                    <button className="btn btn-approval self-start" disabled={householdConfirm.isPending || !householdNote.trim()}>
                      <Check size={17} /> {householdConfirm.isPending ? "Confirming…" : "Household confirms outcome"}
                    </button>
                    <MutationFeedback mutation={householdConfirm} success="Both sides confirmed. The guarded case is closed." />
                  </form>
                )}

                {item.status === "closed" && (
                  <div className="guided-complete">
                    <span><Check size={28} /></span>
                    <div>
                      <p className="eyebrow">OUTCOME ACHIEVED</p>
                      <h2>The repair is closed with evidence from both sides.</h2>
                      <p>The provider's media receipt and work report, plus both parties' final confirmations, are recorded. Conflicting or suspicious evidence still requires human review.</p>
                    </div>
                  </div>
                )}
              </section>

              <aside className="guided-sidebar space-y-6">
                <Panel title="Evidence collected so far" kicker="SAVED RECORDS">
                  <ul className="guided-facts">
                    <li><Check size={16} /> {item.evidence.length} evidence record{item.evidence.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {item.decisions.length} explained decision{item.decisions.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {liveCalls.length} live API call{liveCalls.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {documentedCalls.length} documented partner response{documentedCalls.length === 1 ? "" : "s"}</li>
                  </ul>
                  <div className="button-stack mt-5">
                    <RouteLink to={`/project/evidence?case=${CASE_ID}`}>See all evidence and history</RouteLink>
                    <RouteLink to="/project/rails">See connected services</RouteLink>
                  </div>
                </Panel>
                <Panel title="Need more detail?" kicker="OPTIONAL">
                  <p className="small muted">The step-by-step demo is the easiest route. These pages show what the customer and provider see separately.</p>
                  <div className="button-stack mt-4">
                    <RouteLink to={`/customer/cases/${CASE_ID}`}>Customer's view</RouteLink>
                    <RouteLink to={`/provider/cases/${PROVIDER_ID}/${CASE_ID}`}>Provider's view</RouteLink>
                  </div>
                </Panel>
                <details className="disclosure">
                  <summary>Start the demo again</summary>
                  <div className="mt-4 space-y-4">
                    <p className="small muted">This clears only this practice case and returns it to the first approval step.</p>
                    <button
                      className="btn btn-secondary"
                      disabled={reset.isPending}
                      onClick={() => {
                        setAgentRun(null);
                        reset.mutate();
                      }}
                    >
                      <RotateCcw size={16} /> {reset.isPending ? "Starting again…" : "Start from the beginning"}
                    </button>
                    <MutationFeedback mutation={reset} success="Demo restarted at household approval." />
                  </div>
                </details>
              </aside>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
