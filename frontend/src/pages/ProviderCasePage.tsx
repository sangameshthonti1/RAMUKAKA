import { useQuery } from "@tanstack/react-query";
import { CoordinationPanel } from "../components/CoordinationPanel";
import { useCoordination } from "../hooks/useCoordination";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCase, useApiMutation } from "../hooks/useApi";
import { request } from "../services/api";
import { workspaceApi } from "../services/workspace";
import type { CaseSummary, Provider } from "../types/api";
import { formText } from "../utils/forms";
import { dateTime, money } from "../utils/format";
import { ConfirmationForm } from "../components/ConfirmationForm";
import { ServiceReportForm } from "../components/ServiceReportForm";
import { TextAreaField, TextField } from "../components/WorkspaceFields";
import {
  EmptyState,
  HumanInputNote,
  MutationFeedback,
  PageHeading,
  Panel,
  QueryState,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { ProviderThread } from "../components/ProviderThread";

const providerQueue = (providerId: string) =>
  request<CaseSummary[]>(`/providers/${encodeURIComponent(providerId)}/queue`);

function ProviderQuote({
  item,
  provider,
}: {
  item: CaseSummary;
  provider: Provider;
}) {
  const mutation = useApiMutation(
    (body: Parameters<typeof workspaceApi.quote>[1]) =>
      workspaceApi.quote(item.id, body),
  );
  if (item.id === "RK-2048")
    return <p className="small muted">The documentary quote is fixed.</p>;
  if (item.assigned || ["closed", "cancelled"].includes(item.status))
    return null;
  if (
    provider.trade !== item.service_category ||
    provider.status !== "available" ||
    (item.provider_id && item.provider_id !== provider.id)
  ) {
    return <p className="small muted">This provider cannot quote this case.</p>;
  }
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        mutation.mutate({
          provider_id: provider.id,
          amount: Number(formText(data, "amount")),
          service_description: formText(data, "service_description"),
          expected_revision: item.service_revision,
        });
      }}
    >
      <h3>Submit a quote as {provider.name}</h3>
      <TextField
        name="amount"
        label="Quote amount (whole INR)"
        type="number"
        min={0}
        max={1000000}
        step={1}
        required
        defaultValue={item.quote_amount ?? ""}
      />
      <TextAreaField
        name="service_description"
        label="Proposed service"
        minLength={5}
        maxLength={500}
        required
        defaultValue={item.service_description ?? ""}
      />
      <HumanInputNote />
      <p className="small muted">
        A revised quote requires fresh household approval. No payment or
        assignment happens here.
      </p>
      <button className="btn btn-primary" disabled={mutation.isPending}>
        {mutation.isPending ? "Submitting…" : "Submit quote for approval"}
      </button>
      <MutationFeedback
        mutation={mutation}
        success="Quote recorded. Household approval is required before assignment."
      />
    </form>
  );
}

function ProviderCaseDetail({
  caseId,
  provider,
}: {
  caseId: string;
  provider: Provider;
}) {
  const detail = useCase(caseId);
  const coordination = useCoordination(caseId);
  return (
    <QueryState
      pending={detail.isPending}
      error={detail.error}
      retry={() => void detail.refetch()}
    >
      {detail.data &&
      (detail.data.provider_id === provider.id ||
        (!detail.data.provider_id &&
          detail.data.status === "awaiting_quote" &&
          detail.data.service_category === provider.trade)) ? (
        <div className="space-y-6">
          <section className="case-summary">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">{detail.data.id}</span>
                <StatusBadge status={detail.data.status} />
              </div>
              <h2>{detail.data.title}</h2>
              <p className="preserve-text">{detail.data.complaint}</p>
              <p className="small muted mt-3">
                Service: {detail.data.service_description ?? "Awaiting quote"} ·
                Updated {dateTime(detail.data.updated_at)}
              </p>
            </div>
            <div className="quote-summary">
              <span className="tiny-label">RECORDED QUOTE</span>
              <strong>{money(detail.data.quote_amount)}</strong>
            </div>
          </section>
          <CoordinationPanel item={detail.data} party="provider" />
          {detail.data.assigned && detail.data.provider_id === provider.id ? (
            <>
              <Panel title="Case conversation" kicker="ASSIGNED PROVIDER ONLY">
                <ProviderThread
                  caseId={caseId}
                  providerId={provider.id}
                  caseStatus={detail.data.status}
                />
              </Panel>
              <Panel title="Service report">
                <ServiceReportForm item={detail.data} />
              </Panel>
              <Panel title="Provider completion">
                <ConfirmationForm item={detail.data} party="provider" />
              </Panel>
              <Panel title="Service evidence">
                {detail.data.evidence.filter(
                  (record) =>
                    record.kind === "service" &&
                    record.provider_id === provider.id,
                ).length ? (
                  <div className="record-list">
                    {detail.data.evidence
                      .filter(
                        (record) =>
                          record.kind === "service" &&
                          record.provider_id === provider.id,
                      )
                      .map((record) => (
                        <article key={record.id}>
                          <h3>{record.title}</h3>
                          <p className="preserve-text">{record.description}</p>
                          <TruthBadge label={record.truth_label} />
                        </article>
                      ))}
                  </div>
                ) : (
                  <EmptyState title="No service report recorded" />
                )}
              </Panel>
            </>
          ) : coordination.data ? (
            <p className="small muted">
              The mock coordinator is maintaining this offer; household cost and
              timing approval is required before assignment.
            </p>
          ) : (
            <Panel title="Provider quote" kicker="UNASSIGNED REQUEST">
              <ProviderQuote
                key={detail.data.service_revision}
                item={detail.data}
                provider={provider}
              />
            </Panel>
          )}
        </div>
      ) : (
        <EmptyState title="This case is not in this provider’s queue" />
      )}
    </QueryState>
  );
}

/** May be mounted under a route with :providerId/:caseId, or within the desk's query-link view. */
export default function ProviderCasePage({
  providerId: selectedProviderId,
  caseId: selectedCaseId,
}: {
  providerId?: string;
  caseId?: string;
}) {
  const params = useParams();
  const providerId = selectedProviderId ?? params.providerId ?? "";
  const caseId = selectedCaseId ?? params.caseId ?? "";
  const queue = useQuery({
    queryKey: ["provider-queue", providerId],
    queryFn: () => providerQueue(providerId),
    enabled: Boolean(providerId),
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => request<Provider[]>("/providers"),
    enabled: Boolean(providerId),
  });
  const provider = providers.data?.find((record) => record.id === providerId);
  return (
    <>
      {!selectedCaseId && (
        <PageHeading
          eyebrow="PROVIDER PORTAL"
          title="Provider case"
          description="Quote an eligible request, or report, confirm and message on assigned work."
          action={
            <Link
              className="btn btn-secondary"
              to={`/provider?provider=${encodeURIComponent(providerId)}`}
            >
              <ArrowLeft size={16} /> Provider queue
            </Link>
          }
        />
      )}
      {!providerId || !caseId ? (
        <EmptyState title="Select a provider and case from the desk" />
      ) : (
        <QueryState
          pending={queue.isPending || providers.isPending}
          error={queue.error ?? providers.error}
          retry={() => {
            void queue.refetch();
            void providers.refetch();
          }}
        >
          {!provider ? (
            <EmptyState title="Provider not found" />
          ) : !queue.data?.some((record) => record.id === caseId) ? (
            <EmptyState title="This case is not in this provider’s queue">
              Refresh the queue or choose another case.
            </EmptyState>
          ) : (
            <ProviderCaseDetail
              key={`${providerId}:${caseId}`}
              caseId={caseId}
              provider={provider}
            />
          )}
        </QueryState>
      )}
    </>
  );
}
