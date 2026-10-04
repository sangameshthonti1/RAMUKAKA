import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { api } from "../services/api";
import { keys } from "../hooks/useApi";
import { PageHeading, Panel, QueryState, RouteLink } from "../components/ui";
export default function SystemPromptPage() {
  const query = useQuery({ queryKey: keys.prompt, queryFn: api.prompt });
  const [copyMessage, setCopyMessage] = useState("");
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(query.data?.prompt ?? "");
      setCopyMessage("Backend prompt copied.");
    } catch {
      setCopyMessage(
        "Clipboard unavailable. Select the prompt text below to copy it manually.",
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BEHAVIOUR, MADE INSPECTABLE"
        title="System Prompt"
        description="The backend’s current prompt, verbatim. No hidden frontend replacement and no invented response."
        action={
          <button
            className="btn btn-secondary"
            disabled={query.isFetching}
            onClick={() => {
              setCopyMessage("");
              void query.refetch();
            }}
          >
            <RefreshCw
              size={16}
              className={query.isFetching ? "animate-spin" : ""}
            />
            Refresh from backend
          </button>
        }
      />
      <div className="guard-callout mb-6">
        <div>
          <h2>Instructions are not enforcement.</h2>
          <p>
            The prompt describes intended behaviour. Approval, scope and closure
            checks must still be enforced by the backend. Displaying this prompt
            does not imply a live LLM is connected.
          </p>
          <span className="tiny-label">
            SOURCE: GET /api/system-prompt · LOCAL BACKEND TEXT
          </span>
        </div>
      </div>
      <Panel
        title="Current system instructions"
        action={
          <button
            className="btn btn-secondary btn-small"
            disabled={!query.data?.prompt}
            onClick={() => void copyPrompt()}
          >
            <Copy size={15} />
            Copy prompt
          </button>
        }
      >
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          <pre
            className="system-prompt"
            tabIndex={0}
            aria-label="Backend system prompt"
          >
            {query.data?.prompt}
          </pre>
        </QueryState>
        {copyMessage && (
          <p className="inline-feedback" role="status">
            {copyMessage}
          </p>
        )}
      </Panel>
      <div className="mt-5">
        <RouteLink to="/risks">See the safeguards beyond the prompt</RouteLink>
      </div>
    </>
  );
}
