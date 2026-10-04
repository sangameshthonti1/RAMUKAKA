import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { schedulesApi } from "../services/schedules";
import { keys } from "../hooks/useApi";
import type { Asset, CaseSummary, Household, Provider } from "../types/api";
import type {
  ContactCreate,
  ScheduleActor,
  ScheduleCreate,
  ServiceSchedule,
} from "../types/schedules";
import { dateOnly, dateTime, humanize } from "../utils/format";
import { SelectField, TextAreaField, TextField } from "./WorkspaceFields";
import {
  EmptyState,
  HumanInputNote,
  MutationFeedback,
  Panel,
  QueryState,
  StatusBadge,
} from "./ui";

const pollInterval = 15_000;
const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();

function useScheduleMutation<T, V>(mutationFn: (variables: V) => Promise<T>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    retry: false,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["service-schedules"] }),
        client.invalidateQueries({ queryKey: keys.assets }),
      ]);
    },
  });
}

function CreateSchedule({
  actor,
  assets,
  providers,
  cases,
  households,
  schedules,
}: {
  actor: ScheduleActor;
  assets: Asset[];
  providers: Provider[];
  cases: CaseSummary[];
  households: Household[];
  schedules: ServiceSchedule[];
}) {
  const [assetId, setAssetId] = useState("");
  const [providerId, setProviderId] = useState("");
  const selectedProvider = providers.find((item) => item.id === actor.id);
  const eligibleAssets = assets.filter(
    (asset) =>
      asset.status === "active" &&
      !schedules.some((schedule) => schedule.asset_id === asset.id) &&
      (actor.audience === "household"
        ? asset.household_id === actor.id
        : asset.category === selectedProvider?.trade),
  );
  const asset = eligibleAssets.find((item) => item.id === assetId);
  const matchingProviders = providers.filter(
    (provider) =>
      provider.status === "available" && provider.trade === asset?.category,
  );
  const effectiveProvider =
    actor.audience === "provider"
      ? actor.id
      : (matchingProviders.find((provider) => provider.id === providerId)?.id ??
        "");
  const relevantCases = cases.filter(
    (item) =>
      item.asset_id === asset?.id &&
      item.household_id === asset.household_id &&
      item.assigned &&
      item.status !== "cancelled" &&
      item.provider_id === effectiveProvider,
  );
  const mutation = useScheduleMutation((body: ScheduleCreate) =>
    schedulesApi.create(actor, body),
  );
  const providerAvailable =
    actor.audience !== "provider" || selectedProvider?.status === "available";
  if (!eligibleAssets.length || !providerAvailable)
    return (
      <EmptyState title="No assets available for a new schedule">
        Choose an active asset with a matching available provider. Assets with
        an existing schedule must be updated or reactivated below.
      </EmptyState>
    );
  return (
    <details className="disclosure">
      <summary>Create a service schedule</summary>
      <form
        className="form-stack mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!asset || !effectiveProvider) return;
          const form = event.currentTarget;
          const data = new FormData(form);
          mutation.mutate(
            {
              household_id: asset.household_id,
              asset_id: asset.id,
              provider_id: effectiveProvider,
              case_id: text(data, "case_id") || null,
              next_service_on: text(data, "next_service_on"),
              note: text(data, "note"),
            },
            {
              onSuccess: () => {
                form.reset();
                setAssetId("");
                setProviderId("");
              },
            },
          );
        }}
      >
        <fieldset disabled={mutation.isPending} className="form-stack">
          <SelectField
            label="Schedule asset"
            required
            value={asset?.id ?? ""}
            onChange={(event) => {
              setAssetId(event.target.value);
              setProviderId("");
              mutation.reset();
            }}
          >
            <option value="">Choose an active asset</option>
            {eligibleAssets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ·{" "}
                {households.find((home) => home.id === item.household_id)
                  ?.name ?? item.household_id}
              </option>
            ))}
          </SelectField>
          {actor.audience === "household" ? (
            <SelectField
              label="Matching service provider"
              required
              value={effectiveProvider}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">Choose an available matching provider</option>
              {matchingProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {humanize(provider.trade)}
                </option>
              ))}
            </SelectField>
          ) : (
            <p>Provider attribution: {selectedProvider?.name ?? actor.id}</p>
          )}
          {asset &&
            actor.audience === "household" &&
            !matchingProviders.length && (
              <p role="status">
                No available provider matches this asset’s category.
              </p>
            )}
          <SelectField
            key={`${assetId}:${effectiveProvider}`}
            label="Linked assigned case (optional)"
            name="case_id"
            defaultValue=""
          >
            <option value="">No linked case</option>
            {relevantCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.id})
              </option>
            ))}
          </SelectField>
          <TextField
            label="Next service date"
            name="next_service_on"
            type="date"
            required
          />
          <TextAreaField
            label="Schedule note (optional)"
            name="note"
            maxLength={2000}
          />
          <HumanInputNote />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!asset || !effectiveProvider}
          >
            Save local schedule
          </button>
        </fieldset>
        <MutationFeedback
          mutation={mutation}
          success="Service schedule saved locally. No booking or external contact was made."
        />
      </form>
    </details>
  );
}

function ScheduleCard({
  schedule,
  actor,
  assets,
  providers,
  households,
}: {
  schedule: ServiceSchedule;
  actor: ScheduleActor;
  assets: Asset[];
  providers: Provider[];
  households: Household[];
}) {
  const contacts = useQuery({
    queryKey: ["service-schedules", "contacts", schedule.id],
    queryFn: () => schedulesApi.contacts(schedule.id),
    refetchInterval: pollInterval,
  });
  const mutation = useScheduleMutation((action: () => Promise<unknown>) =>
    action(),
  );
  const contactMutation = useScheduleMutation((body: ContactCreate) =>
    schedulesApi.contact(actor, schedule.id, body),
  );
  const asset = assets.find((item) => item.id === schedule.asset_id);
  const editable = asset?.status === "active";
  return (
    <article>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>{asset?.name ?? schedule.asset_id}</h3>
        <StatusBadge status={schedule.status} />
      </div>
      <p>
        Linked provider:{" "}
        <strong>
          {providers.find((item) => item.id === schedule.provider_id)?.name ??
            schedule.provider_id}
        </strong>{" "}
        · Next service: {dateOnly(schedule.next_service_on)}
      </p>
      <p className="small muted">
        Household:{" "}
        {households.find((item) => item.id === schedule.household_id)?.name ??
          schedule.household_id}{" "}
        · Revision {schedule.revision} · Created by {schedule.created_by}, last
        updated by {schedule.updated_by} (local attribution)
      </p>
      {schedule.case_id && (
        <Link
          className="text-link"
          to={
            actor.audience === "provider"
              ? `/provider?provider=${encodeURIComponent(actor.id)}&case=${encodeURIComponent(schedule.case_id)}`
              : `/customer/cases/${encodeURIComponent(schedule.case_id)}`
          }
        >
          Open linked case
        </Link>
      )}
      <p className="preserve-text">
        {schedule.note || "No schedule note recorded."}
      </p>
      <details className="disclosure mt-4">
        <summary>
          {schedule.status === "cancelled"
            ? "Reactivate schedule"
            : "Reschedule or update note"}
        </summary>
        <form
          key={`${schedule.revision}:${schedule.updated_at}`}
          className="form-stack mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(() =>
              schedulesApi.edit(actor, schedule.id, {
                expected_revision: schedule.revision,
                next_service_on: text(data, "next_service_on"),
                note: text(data, "note"),
                status: "active",
              }),
            );
          }}
        >
          <fieldset
            className="form-stack"
            disabled={mutation.isPending || !editable}
          >
            <TextField
              label="Revised service date"
              name="next_service_on"
              type="date"
              required
              defaultValue={schedule.next_service_on}
            />
            <TextAreaField
              label="Schedule note"
              name="note"
              maxLength={2000}
              defaultValue={schedule.note}
            />
            <button className="btn btn-primary" type="submit">
              {schedule.status === "cancelled"
                ? "Reactivate local schedule"
                : "Save schedule changes"}
            </button>
          </fieldset>
          {!editable && <p>Only active assets can be scheduled.</p>}
        </form>
      </details>
      {schedule.status === "active" && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          disabled={mutation.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Cancel this local schedule and its current reminders?",
              )
            )
              mutation.mutate(() =>
                schedulesApi.edit(actor, schedule.id, {
                  expected_revision: schedule.revision,
                  status: "cancelled",
                }),
              );
          }}
        >
          Cancel schedule
        </button>
      )}
      <MutationFeedback
        mutation={mutation}
        success="Schedule updated locally. Current reminders refresh automatically."
      />
      <h4 className="mt-5">Provider messages and contact notes</h4>
      <QueryState
        pending={contacts.isPending}
        error={contacts.error}
        retry={() => void contacts.refetch()}
      >
        {contacts.data?.length ? (
          <ul className="record-list">
            {contacts.data.map((contact) => (
              <li key={contact.id}>
                <strong>
                  {humanize(contact.kind)} · locally recorded by{" "}
                  {providers.find((item) => item.id === contact.provider_id)
                    ?.name ?? contact.provider_id}
                </strong>
                <p className="preserve-text">{contact.content}</p>
                <p className="small muted">
                  {dateTime(contact.created_at)} · Revision {contact.revision} ·
                  No SMS or call was sent by this app.
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No provider contact records yet" />
        )}
      </QueryState>
      {actor.audience === "provider" && schedule.status === "active" && (
        <form
          className="form-stack mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            contactMutation.mutate(
              {
                expected_revision: schedule.revision,
                kind: text(data, "kind") as ContactCreate["kind"],
                content: text(data, "content"),
              },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <fieldset
            className="form-stack"
            disabled={contactMutation.isPending || mutation.isPending}
          >
            <SelectField
              label="Local contact record type"
              name="kind"
              defaultValue="local_message"
            >
              <option value="local_message">
                Local message visible to customer
              </option>
              <option value="contact_note">
                Contact note visible to customer
              </option>
            </SelectField>
            <TextAreaField
              label="Message or contact note"
              name="content"
              required
              maxLength={2000}
            />
            <p className="small muted">
              This saves a local record visible to the household and
              acknowledges current provider reminders. It does not send SMS,
              place a call, or verify contact occurred.
            </p>
            <HumanInputNote />
            <button className="btn btn-primary" type="submit">
              Save local contact record
            </button>
          </fieldset>
          <MutationFeedback
            mutation={contactMutation}
            success="Local contact record saved for the customer to view. No SMS or call was sent."
          />
        </form>
      )}
    </article>
  );
}

export function ServiceSchedules({ actor }: { actor: ScheduleActor }) {
  const assets = useQuery({ queryKey: keys.assets, queryFn: api.assets });
  const providers = useQuery({
    queryKey: keys.providers,
    queryFn: api.providers,
  });
  const households = useQuery({
    queryKey: keys.households,
    queryFn: api.households,
  });
  const cases = useQuery({ queryKey: keys.cases, queryFn: api.cases });
  const schedules = useQuery({
    queryKey: ["service-schedules", "list", actor.audience, actor.id],
    queryFn: () => schedulesApi.list(actor),
    refetchInterval: pollInterval,
  });
  const reminders = useQuery({
    queryKey: ["service-schedules", "reminders", actor.audience, actor.id],
    queryFn: () => schedulesApi.reminders(actor),
    refetchInterval: pollInterval,
  });
  const acknowledge = useScheduleMutation((id: string) =>
    schedulesApi.acknowledge(actor, id),
  );
  const check = useScheduleMutation(() => schedulesApi.check());
  const error =
    assets.error ?? providers.error ?? households.error ?? cases.error;
  return (
    <Panel
      title="Service schedules"
      kicker="LOCAL IN-APP FOLLOW-UP"
      className="mt-6"
    >
      <p className="small muted mb-4">
        Actions use the selected {actor.audience} record as local attribution,
        not authentication. Schedules are not confirmed bookings. Reminders and
        provider contact records refresh every 15 seconds while this page is
        visible; no SMS or calls are sent.
      </p>
      <QueryState
        pending={
          assets.isPending ||
          providers.isPending ||
          households.isPending ||
          cases.isPending
        }
        error={error}
        retry={() => {
          void assets.refetch();
          void providers.refetch();
          void households.refetch();
          void cases.refetch();
        }}
      >
        <QueryState
          pending={schedules.isPending}
          error={schedules.error}
          retry={() => void schedules.refetch()}
        >
          <CreateSchedule
            key={`${actor.audience}:${actor.id}`}
            actor={actor}
            assets={assets.data ?? []}
            providers={providers.data ?? []}
            cases={cases.data ?? []}
            households={households.data ?? []}
            schedules={schedules.data ?? []}
          />
          <h3 className="mt-6">Saved schedules</h3>
          {schedules.data?.length ? (
            <div className="record-list">
              {schedules.data.map((schedule) => (
                <ScheduleCard
                  key={`${actor.audience}:${actor.id}:${schedule.id}`}
                  schedule={schedule}
                  actor={actor}
                  assets={assets.data ?? []}
                  providers={providers.data ?? []}
                  households={households.data ?? []}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No service schedules for this record" />
          )}
        </QueryState>
      </QueryState>
      <h3 className="mt-6">In-app service reminders</h3>
      <button
        type="button"
        className="btn btn-secondary mb-4"
        disabled={check.isPending}
        onClick={() => check.mutate()}
      >
        Check due reminders now
      </button>
      <MutationFeedback
        mutation={check}
        success="Local reminder check complete. No external messages were sent."
      />
      <QueryState
        pending={reminders.isPending}
        error={reminders.error}
        retry={() => void reminders.refetch()}
      >
        {reminders.data?.length ? (
          <ul className="record-list">
            {reminders.data.map((reminder) => (
              <li key={reminder.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>
                    {humanize(reminder.stage)} ·{" "}
                    {dateOnly(reminder.next_service_on)}
                  </strong>
                  <StatusBadge status={reminder.status} />
                </div>
                <p className="preserve-text">{reminder.message}</p>
                <p className="small muted">
                  For selected {reminder.audience} · Revision{" "}
                  {reminder.revision}
                  {reminder.acknowledged_at
                    ? ` · Acknowledged ${dateTime(reminder.acknowledged_at)}`
                    : ""}
                </p>
                {reminder.status === "available" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(reminder.id)}
                  >
                    Acknowledge reminder
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No current reminders">
            Upcoming reminders appear within seven days of service; due
            reminders appear on or after the service date. Cancelled and
            superseded reminders are excluded.
          </EmptyState>
        )}
      </QueryState>
      <MutationFeedback
        mutation={acknowledge}
        success="Reminder acknowledged locally."
      />
    </Panel>
  );
}
