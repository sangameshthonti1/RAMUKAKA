import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "../hooks/useApi";
import { request } from "../services/api";
import { dateTime } from "../utils/format";
import {
  EmptyState,
  HumanInputNote,
  MutationFeedback,
  QueryState,
  StatusBadge,
  TruthBadge,
} from "./ui";

type Message = {
  id: string;
  role: "customer" | "provider" | "assistant";
  content: string;
  truth_label:
    | "LIVE_API"
    | "REAL_HUMAN_INPUT"
    | "DOCUMENTATION_SIMULATION"
    | "PROPOSED_CAPABILITY";
  created_at: string;
};
type Conversation = { id: string; status: string; messages: Message[] };

function Thread({
  conversation,
  providerId,
  caseStatus,
}: {
  conversation: Conversation;
  providerId: string;
  caseStatus: string;
}) {
  const [text, setText] = useState("");
  const mutation = useApiMutation((message: string) =>
    request<Conversation>(
      `/chat/conversations/${encodeURIComponent(conversation.id)}/provider-messages`,
      { provider_id: providerId, text: message },
    ),
  );
  const messages = conversation.messages;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3>Conversation {conversation.id}</h3>
        <StatusBadge status={conversation.status} />
      </div>
      <div className="record-list" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>
                {message.role === "customer"
                  ? "Household"
                  : message.role === "provider"
                    ? "Provider"
                    : "Local assistant"}
              </strong>
              <span className="small muted">
                {dateTime(message.created_at)}
              </span>
            </div>
            <p className="preserve-text">{message.content}</p>
            <TruthBadge label={message.truth_label} />
          </article>
        ))}
      </div>
      {!["closed", "cancelled"].includes(caseStatus) ? (
        <form
          className="form-stack mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const message = text.trim();
            if (message)
              mutation.mutate(message, { onSuccess: () => setText("") });
          }}
        >
          <label htmlFor={`reply-${conversation.id}`}>
            Message the household
          </label>
          <textarea
            id={`reply-${conversation.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
            maxLength={2000}
            rows={3}
            placeholder="Share a factual update about assigned work."
          />
          <HumanInputNote />
          <button
            className="btn btn-primary self-start"
            disabled={mutation.isPending || !text.trim()}
          >
            {mutation.isPending ? "Sending…" : "Send update"}
          </button>
          <MutationFeedback
            mutation={mutation}
            success="Update sent to the local case conversation."
          />
        </form>
      ) : (
        <p className="small muted">
          This case is closed to new provider messages.
        </p>
      )}
    </section>
  );
}

export function ProviderThread({
  caseId,
  providerId,
  caseStatus,
}: {
  caseId: string;
  providerId: string;
  caseStatus: string;
}) {
  const conversations = useQuery({
    queryKey: ["provider-conversations", providerId, caseId],
    queryFn: () =>
      request<Conversation[]>(
        `/chat/cases/${encodeURIComponent(caseId)}/conversations?provider_id=${encodeURIComponent(providerId)}`,
      ),
  });
  return (
    <QueryState
      pending={conversations.isPending}
      error={conversations.error}
      retry={() => void conversations.refetch()}
    >
      {conversations.data?.length ? (
        <div className="space-y-6">
          {conversations.data.map((conversation) => (
            <Thread
              key={conversation.id}
              conversation={conversation}
              providerId={providerId}
              caseStatus={caseStatus}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No case conversation yet">
          Messages appear here when the household’s conversation is linked to
          this case.
        </EmptyState>
      )}
    </QueryState>
  );
}
