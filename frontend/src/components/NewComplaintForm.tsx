import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Asset } from "../types/api";
import { api } from "../services/api";
import { useApiMutation } from "../hooks/useApi";
import { HumanInputNote, MutationFeedback } from "./ui";
export function NewComplaintForm({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState("");
  const [complaint, setComplaint] = useState("");
  const navigate = useNavigate();
  const mutation = useApiMutation(api.createCase);
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          { asset_id: assetId, complaint: complaint.trim() },
          {
            onSuccess: (item) =>
              navigate(`/customer/cases/${encodeURIComponent(item.id)}`),
          },
        );
      }}
    >
      <label htmlFor="complaint-asset">Which asset needs attention?</label>
      <select
        id="complaint-asset"
        required
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
      >
        <option value="">Select an asset</option>
        {assets
          .filter((asset) => asset.status === "active")
          .map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {asset.location}
            </option>
          ))}
      </select>
      <label htmlFor="complaint-text">
        Describe the problem in your own words
      </label>
      <textarea
        id="complaint-text"
        rows={4}
        required
        maxLength={2000}
        value={complaint}
        onChange={(event) => setComplaint(event.target.value)}
        placeholder="What happened? When did you first notice it?"
      />
      <HumanInputNote />
      <p className="small muted">
        Creates a local case only. No provider is booked and no quote or
        resolution is invented. Record the provider quote and service report
        through the provider portal; a case alone does not authorize service.
      </p>
      <button
        className="btn btn-primary self-start"
        disabled={mutation.isPending || !assetId || !complaint.trim()}
      >
        {mutation.isPending ? "Creating case…" : "Create local case"}
      </button>
      <MutationFeedback mutation={mutation} />
    </form>
  );
}
