import { useState } from "react";
import { useApiMutation } from "../hooks/useApi";
import { api } from "../services/api";
import type { CaseDetail } from "../types/api";
import { HumanInputNote, MutationFeedback, StatusBadge } from "./ui";
export function ConfirmationForm({
  item,
  party,
}: {
  item: CaseDetail;
  party: "provider" | "household";
}) {
  const [confirmed, setConfirmed] = useState("true");
  const [note, setNote] = useState("");
  const mutation = useApiMutation(
    (body: { confirmed: boolean; note: string }) =>
      api.confirmation(item.id, party, body),
  );
  const value =
    party === "provider" ? item.provider_confirmed : item.household_confirmed;
  return (
    <form
      className="form-stack confirmation-form"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ confirmed: confirmed === "true", note: note.trim() });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3>
          {party === "provider"
            ? "Provider completion"
            : "Household verification"}
        </h3>
        <StatusBadge status={value ? "confirmed" : "not_confirmed"} />
      </div>
      <p className="small muted">
        Requires approved service, provider assignment and service evidence. The
        server checks these prerequisites; a selected provider alone is not
        proof of assignment.
      </p>
      <label htmlFor={`${party}-result`}>Your assessment</label>
      <select
        id={`${party}-result`}
        value={confirmed}
        onChange={(event) => {
          setConfirmed(event.target.value);
          mutation.reset();
        }}
      >
        <option value="true">Confirmed — work is complete</option>
        <option value="false">Unresolved — follow-up required</option>
      </select>
      <label htmlFor={`${party}-note`}>Confirmation note</label>
      <textarea
        id={`${party}-note`}
        required
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Describe what you personally checked."
        rows={3}
      />
      <p className="small muted">
        Unresolved clears this party’s confirmation and reopens a closed case.
        Both parties must confirm for closure.
      </p>
      <p className="small muted">
        Select{" "}
        <strong>{party === "provider" ? "Provider" : "Household"}</strong> in
        the header’s demo attribution control before submitting. This is local
        role attribution, not authentication.
      </p>
      <HumanInputNote />
      <button
        className="btn btn-primary self-start"
        disabled={mutation.isPending || !note.trim()}
      >
        {mutation.isPending
          ? "Submitting…"
          : `Submit ${party} ${confirmed === "true" ? "confirmation" : "unresolved report"}`}
      </button>
      <MutationFeedback
        mutation={mutation}
        success="Assessment recorded. Check the updated case status and timeline."
      />
    </form>
  );
}
