import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Wrench } from "lucide-react";
import { useProviders } from "../hooks/useApi";
import { request } from "../services/api";
import type { CaseSummary } from "../types/api";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  StatusBadge,
} from "../components/ui";
import { dateTime } from "../utils/format";
import ProviderCasePage from "./ProviderCasePage";
import { LocationForm } from "../components/LocationForm";
import { ServiceSchedules } from "../components/ServiceSchedules";
import {
  CreateProviderForm,
  EditProviderForm,
} from "../components/ProviderForms";

const providerQueue = (providerId: string) =>
  request<CaseSummary[]>(`/providers/${encodeURIComponent(providerId)}/queue`);

function ProviderQueue({
  providerId,
  caseId,
}: {
  providerId: string;
  caseId: string | null;
}) {
  const queue = useQuery({
    queryKey: ["provider-queue", providerId],
    queryFn: () => providerQueue(providerId),
  });
  return (
    <QueryState
      pending={queue.isPending}
      error={queue.error}
      retry={() => void queue.refetch()}
    >
      {queue.data?.length ? (
        <div className="record-list">
          {queue.data.map((item) => (
            <article key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3>{item.title}</h3>
                <StatusBadge status={item.status} />
              </div>
              <p className="preserve-text">{item.complaint}</p>
              <p className="small muted">
                {item.id} · {item.assigned ? "Assigned work" : "Quote request"}{" "}
                · Updated {dateTime(item.updated_at)}
              </p>
              <Link
                className="text-link"
                to={`/provider?provider=${encodeURIComponent(providerId)}&case=${encodeURIComponent(item.id)}`}
                aria-current={caseId === item.id ? "page" : undefined}
              >
                Open provider case
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No cases in this provider’s queue">
          Only assigned work and unassigned requests matching this provider’s
          trade appear here.
        </EmptyState>
      )}
    </QueryState>
  );
}

export default function ProviderDeskPage() {
  const providers = useProviders();
  const [params, setParams] = useSearchParams();
  const requestedProvider = params.get("provider");
  const providerId = requestedProvider ?? providers.data?.[0]?.id ?? "";
  const selectedProvider = providers.data?.find(
    (provider) => provider.id === providerId,
  );
  const caseId = params.get("case");
  return (
    <>
      <PageHeading
        eyebrow="LOCAL PROVIDER WORKFLOW"
        title="Provider Desk"
        description="Select a provider record to review its own quote requests and assigned work."
      />
      <div className="guard-callout mb-6">
        <Wrench size={22} />
        <div>
          <h3>Local attribution, not provider authentication.</h3>
          <p>
            The selected provider is a local directory record; no identity or
            visit is independently verified.
          </p>
        </div>
      </div>
      <Panel title="Provider records" kicker="LOCAL DIRECTORY">
        <p className="small muted">
          Create a local, unverified provider record for a matching service
          trade. This does not verify an identity or establish a partnership.
        </p>
        <CreateProviderForm />
      </Panel>
      <Panel
        title="Provider queue"
        kicker="SCOPED TO ONE PROVIDER"
        className="mt-6"
      >
        <QueryState
          pending={providers.isPending}
          error={providers.error}
          retry={() => void providers.refetch()}
        >
          {providers.data?.length ? (
            <>
              <label className="field-label" htmlFor="provider-record">
                Provider record
              </label>
              <select
                id="provider-record"
                value={providerId}
                onChange={(event) =>
                  setParams({ provider: event.target.value })
                }
                className="mb-5"
              >
                {!selectedProvider && (
                  <option value={providerId}>Provider not found</option>
                )}
                {providers.data.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.trade} ({provider.id})
                  </option>
                ))}
              </select>
              {selectedProvider ? (
                <>
                  <EditProviderForm provider={selectedProvider} />
                  <details className="disclosure mt-4">
                    <summary>Shop location for nearby matching</summary>
                    <LocationForm
                      key={selectedProvider.id}
                      record={selectedProvider}
                      party="provider"
                    />
                  </details>
                  <ProviderQueue providerId={providerId} caseId={caseId} />
                </>
              ) : (
                <EmptyState title="Provider not found" />
              )}
            </>
          ) : (
            <EmptyState title="No provider records available" />
          )}
        </QueryState>
      </Panel>
      {selectedProvider && (
        <ServiceSchedules
          key={providerId}
          actor={{ audience: "provider", id: providerId }}
        />
      )}
      {caseId && selectedProvider && (
        <Panel
          title="Provider case"
          className="mt-6"
          action={
            <Link
              className="text-link"
              to={`/provider?provider=${encodeURIComponent(providerId)}`}
            >
              Back to queue
            </Link>
          }
        >
          <ProviderCasePage providerId={providerId} caseId={caseId} />
        </Panel>
      )}
    </>
  );
}
