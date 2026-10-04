import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { chatApi } from "../services/chat";
import { keys } from "../hooks/useApi";
import type {
  CustomerSend,
  ConversationDetail,
  ConversationSummary,
} from "../types/chat";
import {
  EmptyState,
  ErrorNotice,
  HumanInputNote,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
} from "../components/ui";
import { dateTime, humanize } from "../utils/format";

const listKey = (householdId: string) => ["chat", "households", householdId];
const detailKey = (conversationId: string) => [
  "chat",
  "conversations",
  conversationId,
];

export default function CustomerChatPage() {
  const client = useQueryClient();
  const [householdSelection, setHouseholdSelection] = useState("");
  const [conversationSelection, setConversationSelection] = useState("");
  const [message, setMessage] = useState("");
  const [assetChoice, setAssetChoice] = useState("");
  const households = useQuery({
    queryKey: keys.households,
    queryFn: api.households,
  });
  const householdId = households.data?.some(
    (item) => item.id === householdSelection,
  )
    ? householdSelection
    : (households.data?.[0]?.id ?? "");
  const conversations = useQuery({
    queryKey: listKey(householdId),
    queryFn: () => chatApi.conversations(householdId),
    enabled: Boolean(householdId),
  });
  const conversationId = conversations.data?.some(
    (item) => item.id === conversationSelection,
  )
    ? conversationSelection
    : (conversations.data?.[0]?.id ?? "");
  const detail = useQuery({
    queryKey: detailKey(conversationId),
    queryFn: () => chatApi.conversation(conversationId),
    enabled: Boolean(conversationId),
    refetchInterval: 5000,
  });
  const assets = useQuery({
    queryKey: keys.assets,
    queryFn: api.assets,
    enabled: Boolean(householdId),
  });
  const activeAssets = (assets.data ?? []).filter(
    (asset) => asset.household_id === householdId && asset.status === "active",
  );

  const create = useMutation({
    mutationFn: chatApi.createConversation,
    onSuccess: (record) => {
      client.setQueryData(detailKey(record.id), record);
      client.setQueryData<ConversationSummary[]>(
        listKey(record.household_id),
        (items) => [
          record,
          ...(items ?? []).filter((item) => item.id !== record.id),
        ],
      );
      setConversationSelection(record.id);
      setMessage("");
      setAssetChoice("");
      void client.invalidateQueries({ queryKey: listKey(record.household_id) });
    },
  });
  const send = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CustomerSend }) =>
      chatApi.send(id, body),
    onSuccess: (record: ConversationDetail) => {
      client.setQueryData(detailKey(record.id), record);
      client.setQueryData<ConversationSummary[]>(
        listKey(record.household_id),
        (items) =>
          items?.map((item) => (item.id === record.id ? record : item)),
      );
      void client.invalidateQueries({ queryKey: listKey(record.household_id) });
      if (record.case_id)
        void client.invalidateQueries({ queryKey: keys.cases });
    },
  });
  const busy = create.isPending || send.isPending;
  const selected = detail.data?.id === conversationId ? detail.data : undefined;
  const draftAsset = activeAssets.find(
    (asset) => asset.id === selected?.asset_id,
  );

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!selected || !text || busy) return;
    send.mutate(
      { id: selected.id, body: { text, action: "message" } },
      {
        onSuccess: () => setMessage(""),
      },
    );
  }

  function sendAction(body: CustomerSend) {
    if (!selected || busy) return;
    send.mutate({ id: selected.id, body });
  }

  return (
    <>
      <PageHeading
        eyebrow="LOCAL SERVICE CONVERSATIONS"
        title="Service chat"
        description="A saved, rules-based conversation about your household records. Not a live technician or emergency channel."
      />
      <QueryState
        pending={households.isPending}
        error={households.error}
        retry={() => void households.refetch()}
      >
        {!households.data?.length ? (
          <EmptyState title="No household on record">
            Add a household in My Home before starting a conversation.
          </EmptyState>
        ) : (
          <div className="space-y-6">
            <Panel title="Choose household" kicker="YOUR RECORDS">
              <div className="form-stack">
                <label htmlFor="chat-household">Household</label>
                <select
                  id="chat-household"
                  value={householdId}
                  disabled={busy}
                  onChange={(event) => {
                    setHouseholdSelection(event.target.value);
                    setConversationSelection("");
                    setMessage("");
                    setAssetChoice("");
                  }}
                >
                  {households.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </Panel>
            <div className="detail-grid">
              <Panel title="Conversations" kicker="SAVED LOCALLY">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => create.mutate(householdId)}
                >
                  {create.isPending ? "Starting…" : "New conversation"}
                </button>
                {create.error && (
                  <div className="mt-4">
                    <ErrorNotice error={create.error} />
                  </div>
                )}
                <div className="mt-5">
                  <QueryState
                    pending={conversations.isPending}
                    error={conversations.error}
                    retry={() => void conversations.refetch()}
                  >
                    {conversations.data?.length ? (
                      <div className="asset-list">
                        {conversations.data.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`asset-card ${conversationId === item.id ? "selected" : ""}`}
                            aria-pressed={conversationId === item.id}
                            disabled={busy}
                            onClick={() => {
                              setConversationSelection(item.id);
                              setMessage("");
                              setAssetChoice("");
                            }}
                          >
                            <span>
                              <strong>
                                {item.case_id || `Conversation ${item.id}`}
                              </strong>
                              <small>
                                {dateTime(item.updated_at)} ·{" "}
                                {humanize(item.stage)}
                              </small>
                            </span>
                            <StatusBadge status={item.status} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No conversations yet">
                        Start one to save messages for this household.
                      </EmptyState>
                    )}
                  </QueryState>
                </div>
              </Panel>
              <Panel title="Conversation" kicker="ON RECORD">
                {!conversationId ? (
                  <EmptyState title="Choose or start a conversation" />
                ) : (
                  <QueryState
                    pending={detail.isPending}
                    error={detail.error}
                    retry={() => void detail.refetch()}
                  >
                    {selected && (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusBadge status={selected.status} />
                          <span className="small muted">
                            {humanize(selected.stage)}
                          </span>
                          {selected.case_id && (
                            <RouteLink
                              to={`/customer/cases/${encodeURIComponent(selected.case_id)}`}
                            >
                              Case {selected.case_id}
                            </RouteLink>
                          )}
                        </div>
                        <div
                          className="record-list"
                          aria-label="Messages"
                          aria-live="polite"
                        >
                          {selected.messages.map((entry) => (
                            <article key={entry.id} className="preserve-text">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{humanize(entry.role)}</strong>
                                <span className="small muted">
                                  {dateTime(entry.created_at)}
                                </span>
                              </div>
                              <p>{entry.content}</p>
                              <TruthBadge label={entry.truth_label} />
                            </article>
                          ))}
                        </div>
                        {(selected.stage === "ready" ||
                          selected.stage === "await_asset") && (
                          <div className="form-stack">
                            <label htmlFor="chat-asset">
                              Choose an appliance for a repair request
                            </label>
                            <select
                              id="chat-asset"
                              disabled={
                                busy ||
                                assets.isPending ||
                                Boolean(assets.error)
                              }
                              value={assetChoice}
                              onChange={(event) =>
                                setAssetChoice(event.target.value)
                              }
                            >
                              <option value="">
                                Select an active appliance
                              </option>
                              {activeAssets.map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.name} · {asset.location}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-secondary self-start"
                              disabled={
                                busy ||
                                !activeAssets.some(
                                  (asset) => asset.id === assetChoice,
                                )
                              }
                              onClick={() =>
                                sendAction({
                                  text: "Select appliance",
                                  asset_id: assetChoice,
                                  action: "message",
                                })
                              }
                            >
                              Choose appliance
                            </button>
                            {!activeAssets.length &&
                              !assets.isPending &&
                              !assets.error && (
                                <p className="small muted">
                                  No active appliances for this household. Add
                                  one in{" "}
                                  <Link
                                    className="text-link"
                                    to="/customer/home"
                                  >
                                    My Home
                                  </Link>
                                  .
                                </p>
                              )}
                            {assets.error && (
                              <ErrorNotice
                                error={assets.error}
                                retry={() => void assets.refetch()}
                              />
                            )}
                          </div>
                        )}
                        {selected.stage === "confirm_report" && (
                          <div className="form-stack">
                            <h3>Review repair request</h3>
                            <p className="preserve-text">
                              {draftAsset?.name ?? selected.asset_id}:{" "}
                              {selected.draft_complaint}
                            </p>
                            <p className="small muted">
                              Only confirmation creates a local case. No
                              provider, quote, booking, or charge is implied.
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={
                                  busy ||
                                  !draftAsset ||
                                  !selected.draft_complaint
                                }
                                onClick={() =>
                                  sendAction({
                                    text: "Confirm repair request",
                                    action: "confirm_report",
                                  })
                                }
                              >
                                Confirm repair request
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={busy}
                                onClick={() =>
                                  sendAction({
                                    text: "Cancel draft",
                                    action: "cancel_report",
                                  })
                                }
                              >
                                Cancel draft
                              </button>
                            </div>
                          </div>
                        )}
                        {selected.stage === "await_problem" && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() =>
                              sendAction({
                                text: "Cancel draft",
                                action: "cancel_report",
                              })
                            }
                          >
                            Cancel draft
                          </button>
                        )}
                        <form className="form-stack" onSubmit={submitMessage}>
                          <label htmlFor="chat-message">
                            {selected.stage === "await_problem"
                              ? "Describe the problem (at least 10 characters)"
                              : "Send a message"}
                          </label>
                          <textarea
                            id="chat-message"
                            rows={3}
                            required
                            maxLength={2000}
                            value={message}
                            disabled={busy}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="Ask about a repair, case status, appliances, or service history"
                          />
                          <HumanInputNote />
                          <button
                            className="btn btn-primary self-start"
                            disabled={busy || !message.trim()}
                          >
                            {send.isPending ? "Sending…" : "Send message"}
                          </button>
                        </form>
                        {send.error && <ErrorNotice error={send.error} />}
                      </div>
                    )}
                  </QueryState>
                )}
              </Panel>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
