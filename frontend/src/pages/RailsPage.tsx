import { useQuery } from "@tanstack/react-query";
import { Network, ShieldCheck, Unplug } from "lucide-react";
import { api } from "../services/api";
import { keys } from "../hooks/useApi";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
export default function RailsPage() {
  const query = useQuery({ queryKey: keys.rails, queryFn: api.rails });
  return (
    <>
      <PageHeading
        eyebrow="THE BOUNDARY BETWEEN INTENT & ACTION"
        title="Rails & APIs"
        description="A working local API is not a live external integration. Here is where the boundary sits."
      />
      <div className="rail-boundary">
        <div>
          <span className="icon-tile">
            <Network size={22} />
          </span>
          <h2>Browser → local backend</h2>
          <p>Relative /api requests. Real local reads and writes.</p>
          <span className="tiny-label">IMPLEMENTED LOCAL INTERFACE</span>
        </div>
        <span className="boundary-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <span className="icon-tile orange-icon">
            <Unplug size={22} />
          </span>
          <h2>Backend → mock connector</h2>
          <p>No payment network, booking service or outbound delivery.</p>
          <TruthBadge label="DOCUMENTATION_SIMULATION" />
        </div>
      </div>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        <div className="rail-grid">
          {query.data?.map((rail) => (
            <Panel key={rail.name}>
              <div className="record-heading">
                <h2>{rail.name}</h2>
                <StatusBadge status={rail.mode} />
              </div>
              <p className="muted my-4">{rail.description}</p>
              <TruthBadge label={rail.truth_label} />
              <div className="operation-list">
                {rail.operations.map((operation) => (
                  <code key={operation}>{operation}</code>
                ))}
              </div>
            </Panel>
          ))}
        </div>
        {query.data?.length === 0 && (
          <EmptyState title="No rails declared by the backend" />
        )}
      </QueryState>
      <div className="detail-grid mt-6">
        <Panel title="Local API surface">
          <dl className="endpoint-list">
            <div>
              <dt>GET /api/cases/:id</dt>
              <dd>Case, timeline, approvals, evidence and decisions.</dd>
            </div>
            <div>
              <dt>POST /api/cases/:id/approvals</dt>
              <dd>
                Resolve an existing pending request. Never invent an amount.
              </dd>
            </div>
            <div>
              <dt>POST /api/cases/:id/actions</dt>
              <dd>
                Execute only an approved scope. The server guards every action.
              </dd>
            </div>
            <div>
              <dt>GET /api/connectors</dt>
              <dd>Inspect sanitized mock request / response traces.</dd>
            </div>
            <div>
              <dt>GET /api/system-prompt</dt>
              <dd>
                Read the prompt supplied by the backend, not a frontend copy.
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="What production would require">
          <ShieldCheck className="text-teal mb-4" size={28} />
          <TruthBadge label="PROPOSED_CAPABILITY" />
          <ul className="check-list mt-4">
            <li>
              Verified identities, authentication and household-level
              authorization.
            </li>
            <li>
              Contracted providers, explicit consent, operational support and
              dispute handling.
            </li>
            <li>
              Payment reconciliation, signed callbacks, retention policies and
              security review.
            </li>
          </ul>
          <RouteLink to="/evidence">
            Inspect actual local connector logs
          </RouteLink>
        </Panel>
      </div>
    </>
  );
}
