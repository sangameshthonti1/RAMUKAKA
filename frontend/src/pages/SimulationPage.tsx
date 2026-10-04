import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, FlaskConical, Play, RotateCcw } from "lucide-react";
import { api } from "../services/api";
import { keys, useApiMutation, useCase } from "../hooks/useApi";
import { Timeline } from "../components/Timeline";
import {
  MutationFeedback,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { humanize } from "../utils/format";
const steps = [
  "Customer approval",
  "Provider assignment",
  "Service evidence",
  "Provider completion",
  "Household confirmation",
  "Final closure",
];
export default function SimulationPage() {
  const state = useQuery({
    queryKey: keys.simulation,
    queryFn: api.simulation,
  });
  const detail = useCase(state.data?.case_id ?? "");
  const next = useApiMutation(() => api.next());
  const reset = useApiMutation(() => api.reset());
  const [acknowledged, setAcknowledged] = useState(false);
  const busy = next.isPending || reset.isPending;
  return (
    <>
      <PageHeading
        eyebrow="SIX STEPS. EVERY DECISION VISIBLE."
        title="The simulation lab"
        description="Walk through the supplied RK-2048 story, one backend-controlled event at a time."
      />
      <div className="simulation-intro">
        <span className="large-icon">
          <FlaskConical size={28} />
        </span>
        <div>
          <h2>A rehearsal, not a real service.</h2>
          <p>
            Initial state: Sangamesh · Kent water purifier · Low water flow ·
            ₹749 quote awaiting approval. The live local record below is never
            replaced with made-up progress.
          </p>
          <TruthBadge label="DOCUMENTATION_SIMULATION" />
        </div>
      </div>
      <QueryState
        pending={state.isPending}
        error={state.error}
        retry={() => void state.refetch()}
      >
        {state.data && (
          <>
            <div className="simulation-control">
              <div>
                <p className="eyebrow">
                  {state.data.case_id} / DOCUMENTARY WORKFLOW
                </p>
                <h2>
                  {state.data.complete
                    ? "Walkthrough complete."
                    : `Next: ${humanize(state.data.next_event ?? "Awaiting next event")}`}
                </h2>
                <p>
                  {state.data.step} of {state.data.total_steps} steps completed
                </p>
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || state.data.complete}
                onClick={() => {
                  reset.reset();
                  next.mutate();
                }}
              >
                <Play size={17} />
                {next.isPending
                  ? "Advancing…"
                  : state.data.complete
                    ? "All steps complete"
                    : "Run one step"}
              </button>
            </div>
            <progress
              className="simulation-progress"
              aria-label="Simulation progress"
              value={state.data.step}
              max={state.data.total_steps || 6}
            />
            <ol className="step-grid">
              {steps.map((label, index) => (
                <li
                  key={label}
                  className={
                    index < state.data!.step
                      ? "done"
                      : index === state.data!.step
                        ? "current"
                        : ""
                  }
                  aria-current={index === state.data!.step ? "step" : undefined}
                >
                  <span>
                    {index < state.data!.step ? (
                      <Check size={16} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <strong>{label}</strong>
                  <small>
                    {index < state.data!.step
                      ? "Recorded"
                      : index === state.data!.step
                        ? "Next step"
                        : "Not yet run"}
                  </small>
                </li>
              ))}
            </ol>
            <MutationFeedback
              mutation={next}
              success="One step recorded. Case, ledger and connector queries refreshed."
            />
            <div className="detail-grid mt-6">
              <Panel
                title="Case state & timeline"
                action={
                  <RouteLink
                    to={`/cases/${encodeURIComponent(state.data.case_id)}`}
                  >
                    Open Case Room
                  </RouteLink>
                }
              >
                <QueryState
                  pending={detail.isPending}
                  error={detail.error}
                  retry={() => void detail.refetch()}
                >
                  {detail.data && (
                    <>
                      <div className="mb-5">
                        <StatusBadge status={detail.data.status} />
                      </div>
                      <Timeline events={detail.data.events} />
                    </>
                  )}
                </QueryState>
              </Panel>
              <div className="space-y-6">
                <Panel title="What the guard checks">
                  <ul className="check-list">
                    <li>
                      A rejected approval blocks progress with 409; it is never
                      silently reapproved.
                    </li>
                    <li>
                      Assignment and service evidence must exist before provider
                      or household confirmation.
                    </li>
                    <li>
                      Provider and household must both confirm. Simulation
                      closure is a separate final event.
                    </li>
                    <li>
                      An unresolved manual report clears that party’s flag and
                      reopens a closed case.
                    </li>
                  </ul>
                  <RouteLink to="/evidence?case=RK-2048">
                    Inspect decisions & connector logs
                  </RouteLink>
                </Panel>
                <Panel title="Start this story again" kicker="SCOPED RESET">
                  <p className="muted">
                    Reset replaces only demo-scoped RK-2048 records. Local
                    signups and unrelated cases are preserved. Changes to this
                    demo case will be lost.
                  </p>
                  <label className="checkbox-row mt-5">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                      disabled={busy}
                    />
                    I understand that this demo case will be reset.
                  </label>
                  <button
                    className="btn btn-secondary mt-4"
                    disabled={busy || !acknowledged}
                    onClick={() => {
                      next.reset();
                      reset.mutate(undefined, {
                        onSuccess: () => setAcknowledged(false),
                      });
                    }}
                  >
                    <RotateCcw size={16} />
                    {reset.isPending ? "Resetting…" : "Reset demo case"}
                  </button>
                  <MutationFeedback
                    mutation={reset}
                    success="Demo reset. Unrelated cases and signup records are preserved."
                  />
                </Panel>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
