import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "../hooks/useApi";
import { useCoordination } from "../hooks/useCoordination";
import { api } from "../services/api";
import { coordinationApi } from "../services/coordination";
import type { CaseDetail } from "../types/api";
import type { Coordination } from "../types/coordination";
import { humanize, money } from "../utils/format";
import { LocationForm } from "./LocationForm";
import {
  EmptyState,
  MutationFeedback,
  Panel,
  QueryState,
  TruthBadge,
} from "./ui";

function Offer({
  item,
  record,
  party,
}: {
  item: CaseDetail;
  record: Coordination;
  party: "household" | "provider";
}) {
  const [cost, setCost] = useState(false);
  const [timing, setTiming] = useState(false);
  const client = useQueryClient();
  const state = record.state;
  const consent = useApiMutation(() =>
    coordinationApi.consent(item.id, {
      offer_id: state.offer_id,
      approve_cost: cost,
      approve_timing: timing,
    }),
  );
  const complete = useApiMutation(() =>
    coordinationApi.complete(item.id, state.offer_id),
  );
  const saved = (data: Coordination) =>
    client.setQueryData(["coordination", item.id], data);
  const current =
    state.service_revision === item.service_revision &&
    state.provider_id === item.provider_id &&
    state.total_cost_inr === item.quote_amount &&
    !["closed", "cancelled"].includes(item.status);
  return (
    <div className="space-y-4 mt-4">
      <p>
        <strong>{humanize(state.status)}</strong> · {state.selected_shop.name} ·{" "}
        {state.selected_shop.distance_km.toFixed(2)} km straight-line
      </p>
      <p className="small muted">
        {state.selected_shop.shop_address ?? "No shop address recorded"}
      </p>
      <p>
        <strong>Fixture total: {money(state.total_cost_inr)}</strong> —
        all-inclusive simulation, not a real quote.
      </p>
      <p className="preserve-text">{state.timing}</p>
      <p className="small muted">
        Saved consent: cost {state.cost_approved ? "approved" : "not approved"};
        timing {state.timing_approved ? "approved" : "not approved"}. Provider
        response: {state.provider_response} (mock).
      </p>
      <h3>Persisted mock conversation</h3>
      <div className="record-list">
        {state.messages.map((message, index) => (
          <article key={index}>
            <strong>{humanize(message.speaker)}</strong>
            <p className="preserve-text">{message.text}</p>
            <TruthBadge label={message.truth_label} />
          </article>
        ))}
      </div>
      {!current && (
        <p role="status">
          This saved offer is stale or the case is closed/cancelled. No further
          coordination action is available. Refresh the case before proceeding.
        </p>
      )}
      {party === "household" &&
        current &&
        state.status === "awaiting_household_consent" && (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (cost && timing)
                consent.mutate(undefined, { onSuccess: saved });
            }}
          >
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={cost}
                onChange={(event) => setCost(event.target.checked)}
              />
              I explicitly approve the fixture total of{" "}
              {money(state.total_cost_inr)}.
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={timing}
                onChange={(event) => setTiming(event.target.checked)}
              />
              I explicitly approve the displayed simulated timing.
            </label>
            <p className="small muted">
              Both decisions must be given together. Approval automatically
              records a mock assignment; no real payment or booking occurs.
            </p>
            <button
              className="btn btn-primary"
              disabled={
                !cost ||
                !timing ||
                consent.isPending ||
                state.provider_response !== "accepted"
              }
            >
              {consent.isPending
                ? "Recording consent…"
                : "Approve cost and timing & auto-assign (mock)"}
            </button>
            <MutationFeedback
              mutation={consent}
              success="Both consents saved; automated mock assignment recorded."
            />
          </form>
        )}
      {state.status === "assigned" && (
        <p role="status">
          Mock assignment recorded. This does not mean a real visit has
          occurred.
        </p>
      )}
      {state.status === "provider_reported_completion" && (
        <p role="status">
          <strong>
            Mock provider-reported completion — not household confirmation.
          </strong>{" "}
          No real visit or independent verification occurred.{" "}
          {item.household_confirmed
            ? "Household confirmation is separately recorded on the case."
            : "Household confirmation is still required; confirm your own observation or report unresolved service below."}
        </p>
      )}
      {party === "provider" &&
        current &&
        item.assigned &&
        state.status === "assigned" && (
          <div>
            <p className="small muted mb-4">
              This action records simulated completion evidence and notifies the
              customer locally. It does not confirm on behalf of the household.
            </p>
            <button
              className="btn btn-secondary"
              disabled={complete.isPending}
              onClick={() => complete.mutate(undefined, { onSuccess: saved })}
            >
              {complete.isPending
                ? "Recording mock completion…"
                : "Report simulated completion (mock)"}
            </button>
            <MutationFeedback
              mutation={complete}
              success="Mock provider completion reported; household verification remains separate."
            />
          </div>
        )}
    </div>
  );
}

export function CoordinationPanel({
  item,
  party = "household",
}: {
  item: CaseDetail;
  party?: "household" | "provider";
}) {
  const query = useCoordination(item.id);
  const client = useQueryClient();
  const households = useQuery({
    queryKey: ["households"],
    queryFn: api.households,
    enabled: party === "household" && item.id !== "RK-2048",
  });
  const household = households.data?.find(
    (record) => record.id === item.household_id,
  );
  const hasCoordinates =
    household?.latitude != null && household?.longitude != null;
  const nearby = useQuery({
    queryKey: [
      "nearby-providers",
      item.id,
      household?.latitude,
      household?.longitude,
    ],
    queryFn: () => coordinationApi.nearby(item.id),
    enabled: party === "household" && hasCoordinates && !query.data,
    retry: false,
  });
  const start = useApiMutation(() =>
    coordinationApi.start(item.id, item.service_revision),
  );
  const attempted = useRef<string | null>(null);
  const eligible =
    item.id !== "RK-2048" &&
    !item.assigned &&
    !item.provider_id &&
    !["closed", "cancelled"].includes(item.status);
  useEffect(() => {
    const attemptKey = `${item.id}:${item.service_revision}`;
    if (
      party !== "household" ||
      !eligible ||
      query.isPending ||
      query.error ||
      query.data ||
      !nearby.data?.providers.length ||
      nearby.isFetching ||
      start.isPending ||
      attempted.current === attemptKey
    )
      return;
    attempted.current = attemptKey;
    start.mutate(undefined, {
      onSuccess: (data) => client.setQueryData(["coordination", item.id], data),
    });
  }, [
    client,
    eligible,
    item.id,
    item.service_revision,
    nearby.data,
    nearby.isFetching,
    party,
    query.data,
    query.error,
    query.isPending,
    start,
  ]);
  if (item.id === "RK-2048") return null;
  return (
    <Panel
      title="Local automatic coordination"
      kicker="MOCK ONLY · PERSISTED STATE"
      className="mt-6"
    >
      <p className="small muted">
        The bot automatically prepares a mock offer when this case is opened and
        matching shop coordinates are available. Recorded providers only; no
        live search, external outreach, real call, payment, booking or visit.
        State is refreshed every 3 seconds while this page is open.
      </p>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data ? (
          <Offer
            key={`${query.data.state.offer_id}:${item.service_revision}`}
            item={item}
            record={query.data}
            party={party}
          />
        ) : party === "household" ? (
          <>
            <QueryState
              pending={households.isPending}
              error={households.error}
              retry={() => void households.refetch()}
            >
              {household ? (
                <LocationForm
                  key={household.id}
                  record={household}
                  party="household"
                />
              ) : (
                <EmptyState title="Household record unavailable" />
              )}
            </QueryState>
            {hasCoordinates ? (
              <QueryState
                pending={nearby.isPending}
                error={nearby.error}
                retry={() => void nearby.refetch()}
              >
                <h3 className="mt-4">Nearby recorded providers</h3>
                <p className="small muted">
                  Straight-line Haversine distance from saved coordinates, not
                  travel distance or live availability. Eligible recorded
                  providers with unknown coordinates are excluded.
                </p>
                {nearby.data?.providers.length ? (
                  <div className="record-list">
                    {nearby.data.providers.map((shop) => (
                      <article key={shop.provider_id}>
                        <strong>{shop.name}</strong>
                        <p>
                          {shop.shop_address ?? "No shop address recorded"} ·{" "}
                          {shop.distance_km.toFixed(2)} km straight-line
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No eligible recorded providers with coordinates" />
                )}
              </QueryState>
            ) : (
              <p className="small muted mt-4">
                Save household coordinates to calculate nearby recorded provider
                distances.
              </p>
            )}
            {eligible ? (
              <button
                className="btn btn-primary mt-4"
                disabled={
                  start.isPending ||
                  !nearby.data?.providers.length ||
                  nearby.isError ||
                  nearby.isFetching
                }
                onClick={() =>
                  start.mutate(undefined, {
                    onSuccess: (data) =>
                      client.setQueryData(["coordination", item.id], data),
                  })
                }
              >
                {start.isPending
                  ? "Starting…"
                  : "Start automatic coordination (local mock)"}
              </button>
            ) : (
              <p className="small muted mt-4">
                Automatic coordination requires a new unassigned case with no
                selected provider. The manual workflow remains available.
              </p>
            )}
            <MutationFeedback
              mutation={start}
              success="Mock offer saved. Review cost and timing before consenting."
            />
          </>
        ) : (
          <p className="small muted mt-4">
            No automatic coordination saved; use the manual provider workflow.
          </p>
        )}
      </QueryState>
    </Panel>
  );
}
