import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Box, MapPin, Users } from "lucide-react";
import { api } from "../services/api";
import { keys, useAssets } from "../hooks/useApi";
import { CaseList } from "../components/CaseList";
import { ServiceSchedules } from "../components/ServiceSchedules";
import { SelectField } from "../components/WorkspaceFields";
import { NewComplaintForm } from "../components/NewComplaintForm";
import { AssetForm, EditAssetForm } from "../components/AssetForm";
import {
  CreateHouseholdForm,
  AddParticipantForm,
} from "../components/HouseholdForms";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { dateOnly, humanize } from "../utils/format";
function AssetHistory({ id }: { id: string }) {
  const query = useQuery({
    queryKey: keys.asset(id),
    queryFn: () => api.asset(id),
  });
  return (
    <QueryState
      pending={query.isPending}
      error={query.error}
      retry={() => void query.refetch()}
    >
      {query.data && (
        <div className="space-y-5">
          <dl className="detail-list">
            <div>
              <dt>Category</dt>
              <dd>{humanize(query.data.asset.category)}</dd>
            </div>
            <div>
              <dt>Brand / model</dt>
              <dd>
                {query.data.asset.brand} /{" "}
                {query.data.asset.model || "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Installed (household-recorded)</dt>
              <dd>
                {query.data.asset.installed_on
                  ? dateOnly(query.data.asset.installed_on)
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Purchased (household-recorded)</dt>
              <dd>
                {query.data.asset.purchased_on
                  ? dateOnly(query.data.asset.purchased_on)
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Warranty expiry (household-recorded)</dt>
              <dd>
                {query.data.asset.warranty_until
                  ? dateOnly(query.data.asset.warranty_until)
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Next service (household-recorded)</dt>
              <dd>
                {query.data.asset.next_service_on
                  ? dateOnly(query.data.asset.next_service_on)
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Serial number</dt>
              <dd>{query.data.asset.serial_number || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{query.data.asset.location}</dd>
            </div>
          </dl>
          <p className="small muted">
            Dates are household-recorded and unverified; they do not confirm a
            purchase, warranty coverage, or a service booking.
          </p>
          <p className="preserve-text muted">
            {query.data.asset.notes || "No asset notes recorded."}
          </p>
          <TruthBadge label={query.data.asset.truth_label} />
          <EditAssetForm
            key={query.data.asset.updated_at}
            asset={query.data.asset}
          />
          <h3>Service history</h3>
          <CaseList cases={query.data.cases} />
        </div>
      )}
    </QueryState>
  );
}
export default function MyHomePage() {
  const assets = useAssets();
  const households = useQuery({
    queryKey: keys.households,
    queryFn: api.households,
  });
  const [selected, setSelected] = useState("");
  const [scheduleHousehold, setScheduleHousehold] = useState("");
  const scheduleHouseholdId =
    households.data?.find((home) => home.id === scheduleHousehold)?.id ??
    households.data?.[0]?.id;
  const [params] = useSearchParams();
  const selectedId = selected || assets.data?.[0]?.id;
  return (
    <>
      <PageHeading
        eyebrow="THE PEOPLE & THINGS YOU LOOK AFTER"
        title="My Home"
        description="An inventory with a memory. Keep the original details, and build a service history over time."
      />
      <QueryState
        pending={households.isPending}
        error={households.error}
        retry={() => void households.refetch()}
      >
        <div className="household-grid">
          {households.data?.map((household) => (
            <Panel key={household.id}>
              <div className="flex items-start gap-3">
                <span className="icon-tile">
                  <Users size={21} />
                </span>
                <div>
                  <p className="eyebrow">HOUSEHOLD RECORD</p>
                  <h2>{household.name}</h2>
                  <TruthBadge label={household.truth_label} />
                  <div className="participant-list">
                    {household.participants.map((person) => (
                      <span key={person.id}>
                        {person.name}
                        <small>{person.role}</small>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <AddParticipantForm householdId={household.id} />
            </Panel>
          ))}
          {households.data?.length === 0 && (
            <EmptyState title="No households recorded" />
          )}
        </div>
      </QueryState>
      <Panel title="Manage your household" className="mt-6">
        <CreateHouseholdForm />
        <div className="mt-4">
          <AssetForm
            households={households.data ?? []}
            onCreated={setSelected}
          />
        </div>
      </Panel>
      <Panel title="Household service follow-up" className="mt-6">
        <QueryState
          pending={households.isPending}
          error={households.error}
          retry={() => void households.refetch()}
        >
          {scheduleHouseholdId ? (
            <>
              <SelectField
                label="Household for service schedules"
                value={scheduleHouseholdId}
                onChange={(event) => setScheduleHousehold(event.target.value)}
              >
                {households.data?.map((home) => (
                  <option key={home.id} value={home.id}>
                    {home.name}
                  </option>
                ))}
              </SelectField>
              <ServiceSchedules
                key={scheduleHouseholdId}
                actor={{ audience: "household", id: scheduleHouseholdId }}
              />
            </>
          ) : (
            <EmptyState title="Create a household to manage service schedules" />
          )}
        </QueryState>
      </Panel>
      <div className="detail-grid mt-6">
        <Panel title="Your assets" kicker="LOCAL INVENTORY">
          <QueryState
            pending={assets.isPending}
            error={assets.error}
            retry={() => void assets.refetch()}
          >
            <div className="asset-list">
              {assets.data?.map((asset) => (
                <button
                  className={`asset-card ${selectedId === asset.id ? "selected" : ""}`}
                  onClick={() => setSelected(asset.id)}
                  aria-pressed={selectedId === asset.id}
                  key={asset.id}
                >
                  <span className="icon-tile">
                    <Box size={22} />
                  </span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.brand} · {asset.model}
                    </small>
                    <span className="small flex items-center gap-1 mt-2">
                      <MapPin size={13} />
                      {asset.location}
                    </span>
                  </span>
                  <StatusBadge status={asset.status} />
                </button>
              ))}
            </div>
            {assets.data?.length === 0 && (
              <EmptyState title="No assets on record">
                Add an appliance using the form above. Its history will be
                stored in the database.
              </EmptyState>
            )}
          </QueryState>
          {selectedId && (
            <div className="mt-6">
              <AssetHistory key={selectedId} id={selectedId} />
            </div>
          )}
        </Panel>
        <Panel title="Something needs attention?" kicker="NEW COMPLAINT">
          <details
            className="disclosure"
            open={params.has("report") || undefined}
          >
            <summary>Report an issue</summary>
            <div className="mt-4">
              <NewComplaintForm assets={assets.data ?? []} />
            </div>
          </details>
          <p className="muted small mt-5">
            This is a local prototype, not an emergency response channel.
          </p>
        </Panel>
      </div>
    </>
  );
}
