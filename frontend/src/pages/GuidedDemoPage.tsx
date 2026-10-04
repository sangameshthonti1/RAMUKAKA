import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  Circle,
  FileCheck2,
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

const CASE_ID = "RK-2048";
const PROVIDER_ID = "provider-kent-care";
const checkpoints = [
  "Approve service",
  "Assign provider",
  "Record service",
  "Provider confirms",
  "Household confirms",
  "Case closes",
];

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
        "The agent cannot spend or assign anyone until the household approves the exact quote.",
    };
  if (!item.assigned)
    return {
      index: 1,
      actor: "system",
      title: "Assign the approved provider",
      explanation:
        "The approved scope can now be consumed once. This remains a local mock assignment.",
    };
  if (!hasCurrentServiceEvidence(item))
    return {
      index: 2,
      actor: "provider",
      title: "Record what the technician actually did",
      explanation:
        "Completion cannot be claimed until the provider records work performed and an observed result.",
    };
  if (!item.provider_confirmed)
    return {
      index: 3,
      actor: "provider",
      title: "Provider confirms the recorded work",
      explanation:
        "The provider must separately confirm that the current service report is complete.",
    };
  if (!item.household_confirmed)
    return {
      index: 4,
      actor: "household",
      title: "Household verifies the outcome",
      explanation:
        "The recipient gets the final say. A provider confirmation alone cannot close the case.",
    };
  return {
    index: 5,
    actor: "system",
    title:
      item.status === "closed"
        ? "Case completed by both sides"
        : "Close the guarded case",
    explanation:
      "Both confirmations and matching service evidence are present, so the closure guard can pass.",
  };
}

function actorLabel(actor: DemoStage["actor"]) {
  if (actor === "household") return "Household action";
  if (actor === "provider") return "Provider action";
  return "RamuKaka action";
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
  const report = useApiMutation(() => {
    setDemoRole("provider");
    return workspaceApi.serviceReport(CASE_ID, {
      provider_id: PROVIDER_ID,
      expected_revision: item!.service_revision,
      work_performed: workPerformed.trim(),
      observed_result: observedResult.trim(),
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
        eyebrow="ROUND 3 · GUIDED LIVE DEMO"
        title="One case. One clear next step."
        description="RamuKaka decides what is missing; the right person supplies it. The case closes only after evidence and confirmation from both sides."
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
                    <p className="eyebrow">NEXT · {actorLabel(stage.actor).toUpperCase()}</p>
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
                        <h3>Let the live agent decide first</h3>
                        <p className="small muted">
                          Gemini receives the current case state and may choose only a server-allowed action.
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
                      {runAgent.isPending ? "Agent is deciding…" : "Run live agent decision"}
                    </button>
                    <MutationFeedback mutation={runAgent} />
                    {agentRun?.decision && (
                      <article className="agent-result">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{agentRun.decision.action.replaceAll("_", " ")}</strong>
                          <TruthBadge label="LIVE_API" />
                        </div>
                        <p>{agentRun.notification?.message}</p>
                        <small>Rule: {agentRun.decision.rule}</small>
                      </article>
                    )}
                  </div>
                )}

                {stage.index === 0 && (
                  <div className="guided-human-action">
                    <h3>Household decision</h3>
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
                    <h3>Use the approved scope once</h3>
                    <p>No real payment or booking occurs in this competition demo.</p>
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
                    <h3>Technician service report</h3>
                    <label htmlFor="guided-work">Work performed</label>
                    <textarea id="guided-work" required minLength={10} maxLength={2000} rows={3} value={workPerformed} onChange={(event) => setWorkPerformed(event.target.value)} />
                    <label htmlFor="guided-result">Observed result</label>
                    <textarea id="guided-result" required minLength={10} maxLength={2000} rows={3} value={observedResult} onChange={(event) => setObservedResult(event.target.value)} />
                    <p className="small muted">Human input · local demo. Enter only what the provider actually observed.</p>
                    <button className="btn btn-primary self-start" disabled={report.isPending || !workPerformed.trim() || !observedResult.trim()}>
                      <FileCheck2 size={17} /> {report.isPending ? "Saving…" : "Save service evidence"}
                    </button>
                    <MutationFeedback mutation={report} success="Service evidence saved. Provider confirmation is now required." />
                  </form>
                )}

                {stage.index === 3 && (
                  <form className="guided-human-action form-stack" onSubmit={(event) => submit(event, () => providerConfirm.mutate())}>
                    <h3>Provider confirmation</h3>
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
                    <h3>Household verification</h3>
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
                      <h2>The case is closed—with proof from both sides.</h2>
                      <p>Approval, assignment, service evidence, provider confirmation and household confirmation are all recorded.</p>
                    </div>
                  </div>
                )}
              </section>

              <aside className="guided-sidebar space-y-6">
                <Panel title="What is already proven" kicker="LIVE RECORD">
                  <ul className="guided-facts">
                    <li><Check size={16} /> {item.evidence.length} evidence record{item.evidence.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {item.decisions.length} recorded decision{item.decisions.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {liveCalls.length} live API call{liveCalls.length === 1 ? "" : "s"}</li>
                    <li><Check size={16} /> {documentedCalls.length} documented partner response{documentedCalls.length === 1 ? "" : "s"}</li>
                  </ul>
                  <div className="button-stack mt-5">
                    <RouteLink to={`/project/evidence?case=${CASE_ID}`}>Open proof ledger</RouteLink>
                    <RouteLink to="/project/rails">Inspect API calls</RouteLink>
                  </div>
                </Panel>
                <Panel title="Need the detailed views?" kicker="OPTIONAL">
                  <p className="small muted">The guided flow is the main journey. These views expose each party’s original workspace.</p>
                  <div className="button-stack mt-4">
                    <RouteLink to={`/customer/cases/${CASE_ID}`}>Household case</RouteLink>
                    <RouteLink to={`/provider/cases/${PROVIDER_ID}/${CASE_ID}`}>Provider case</RouteLink>
                  </div>
                </Panel>
                <details className="disclosure">
                  <summary>Restart the rehearsal</summary>
                  <div className="mt-4 space-y-4">
                    <p className="small muted">This deletes only the documentary RK-2048 progress and restores its starting state.</p>
                    <button
                      className="btn btn-secondary"
                      disabled={reset.isPending}
                      onClick={() => {
                        setAgentRun(null);
                        reset.mutate();
                      }}
                    >
                      <RotateCcw size={16} /> {reset.isPending ? "Restarting…" : "Restart demo case"}
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
