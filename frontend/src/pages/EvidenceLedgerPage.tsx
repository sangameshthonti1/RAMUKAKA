import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { keys, useCases } from "../hooks/useApi";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { dateTime, humanize } from "../utils/format";
const sections = ["Evidence", "Decisions", "Connector logs"] as const;
export default function EvidenceLedgerPage() {
  const [section, setSection] = useState<(typeof sections)[number]>("Evidence");
  const [params, setParams] = useSearchParams();
  const caseId = params.get("case") ?? "";
  const cases = useCases();
  const evidence = useQuery({ queryKey: keys.evidence, queryFn: api.evidence });
  const decisions = useQuery({
    queryKey: keys.decisions,
    queryFn: api.decisions,
  });
  const connectors = useQuery({
    queryKey: keys.connectors,
    queryFn: api.connectors,
  });
  const evidenceRows =
    evidence.data?.filter((row) => !caseId || row.case_id === caseId) ?? [];
  const decisionRows =
    decisions.data?.filter((row) => !caseId || row.case_id === caseId) ?? [];
  const connectorRows =
    connectors.data?.filter((row) => !caseId || row.case_id === caseId) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="NOT JUST AN ANSWER. A RECORD."
        title="Evidence Ledger"
        description="Inspect what was observed, why a decision was made, and exactly what each mock connector returned."
      />
      <div className="legend-panel">
        <h2>Know what you are looking at.</h2>
        <div className="truth-legend">
          <span>
            <TruthBadge label="DOCUMENTATION_SIMULATION" />
            Seeded or simulated, not independent proof.
          </span>
          <span>
            <TruthBadge label="REAL_HUMAN_INPUT" />
            Entered locally by a person, not verified.
          </span>
          <span>
            <TruthBadge label="PROPOSED_CAPABILITY" />A design intention, not an
            integration.
          </span>
          <span>
            <TruthBadge label="LIVE_API" />
            Server-reported provenance; not assumed here.
          </span>
        </div>
      </div>
      <div className="ledger-toolbar">
        <div className="segmented-control" aria-label="Ledger section">
          {sections.map((value) => (
            <button
              key={value}
              aria-pressed={section === value}
              onClick={() => setSection(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="filter-control">
          <label htmlFor="ledger-case">Filter by case</label>
          <select
            id="ledger-case"
            value={caseId}
            onChange={(event) =>
              setParams(event.target.value ? { case: event.target.value } : {})
            }
          >
            <option value="">All cases</option>
            {caseId && !cases.data?.some((item) => item.id === caseId) && (
              <option value={caseId}>{caseId}</option>
            )}
            {cases.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </div>
      </div>
      {cases.error && (
        <QueryState
          pending={false}
          error={cases.error}
          retry={() => void cases.refetch()}
        >
          {null}
        </QueryState>
      )}
      {section === "Evidence" && (
        <Panel
          title="Evidence & source records"
          action={
            <span className="tiny-label">{evidenceRows.length} RECORDS</span>
          }
        >
          <QueryState
            pending={evidence.isPending}
            error={evidence.error}
            retry={() => void evidence.refetch()}
          >
            {evidenceRows.length ? (
              <div className="record-list">
                {evidenceRows.map((row) => (
                  <article key={row.id}>
                    <div className="record-heading">
                      <h3>{row.title}</h3>
                      <TruthBadge label={row.truth_label} />
                    </div>
                    <p className="preserve-text">{row.description}</p>
                    <p className="small muted">
                      Source: {row.source} · {dateTime(row.created_at)} ·{" "}
                      {row.id}
                    </p>
                    <RouteLink to={`/cases/${encodeURIComponent(row.case_id)}`}>
                      {row.case_id}
                    </RouteLink>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No evidence for this selection">
                No source or result has been invented to fill the gap.
              </EmptyState>
            )}
          </QueryState>
        </Panel>
      )}
      {section === "Decisions" && (
        <Panel
          title="Decision trail"
          action={
            <span className="tiny-label">{decisionRows.length} RECORDS</span>
          }
        >
          <QueryState
            pending={decisions.isPending}
            error={decisions.error}
            retry={() => void decisions.refetch()}
          >
            {decisionRows.length ? (
              <div className="record-list">
                {decisionRows.map((row) => (
                  <article key={row.id}>
                    <div className="record-heading">
                      <h3>{humanize(row.action)}</h3>
                      <TruthBadge label={row.truth_label} />
                    </div>
                    <p>{row.reason}</p>
                    <div className="rule-box">
                      <span className="tiny-label">RULE APPLIED</span>
                      <p>{row.rule}</p>
                    </div>
                    <p className="small muted">
                      {row.id} · {dateTime(row.created_at)}
                    </p>
                    <RouteLink to={`/cases/${encodeURIComponent(row.case_id)}`}>
                      {row.case_id}
                    </RouteLink>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No decisions for this selection" />
            )}
          </QueryState>
        </Panel>
      )}
      {section === "Connector logs" && (
        <Panel
          title="Connector request / response log"
          action={
            <span className="tiny-label">{connectorRows.length} CALLS</span>
          }
        >
          <p className="small muted mb-5">
            Local mock exchanges only. Payloads are rendered as text, not
            executed. The backend is responsible for keeping secrets and
            arbitrary sensitive input out of these logs.
          </p>
          <QueryState
            pending={connectors.isPending}
            error={connectors.error}
            retry={() => void connectors.refetch()}
          >
            {connectorRows.length ? (
              <div className="record-list">
                {connectorRows.map((row) => (
                  <article key={row.id}>
                    <div className="record-heading">
                      <h3>
                        {row.connector} / {row.operation}
                      </h3>
                      <StatusBadge status={row.status} />
                    </div>
                    <TruthBadge label={row.truth_label} />
                    <p className="small muted">
                      {row.id} · {dateTime(row.created_at)}
                    </p>
                    <details className="disclosure mt-3">
                      <summary>Inspect request and response</summary>
                      <div className="payload-grid mt-4">
                        <div>
                          <h4>Request</h4>
                          <pre>{JSON.stringify(row.request, null, 2)}</pre>
                        </div>
                        <div>
                          <h4>Response</h4>
                          <pre>{JSON.stringify(row.response, null, 2)}</pre>
                        </div>
                      </div>
                    </details>
                    <div className="mt-3">
                      <RouteLink
                        to={`/cases/${encodeURIComponent(row.case_id)}`}
                      >
                        {row.case_id}
                      </RouteLink>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No connector calls for this selection">
                Run a simulation step or a permitted mock action to inspect its
                trace.
              </EmptyState>
            )}
          </QueryState>
        </Panel>
      )}
    </>
  );
}
