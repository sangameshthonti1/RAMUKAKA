import { ArrowUpRight, Droplets } from "lucide-react";
import { Link } from "react-router-dom";
import type { CaseSummary } from "../types/api";
import { money } from "../utils/format";
import { EmptyState, StatusBadge } from "./ui";
export function CaseList({ cases }: { cases: CaseSummary[] }) {
  if (!cases.length)
    return (
      <EmptyState title="No cases yet">
        Report an issue from My Home to start a local case.
      </EmptyState>
    );
  return (
    <div className="case-list">
      {cases.map((item) => (
        <Link
          className="case-row"
          to={`/cases/${encodeURIComponent(item.id)}`}
          key={item.id}
        >
          <span className="icon-tile">
            <Droplets size={21} />
          </span>
          <div className="case-row-main">
            <span className="tiny-label">{item.id}</span>
            <h3>{item.title}</h3>
            <p>{item.complaint}</p>
          </div>
          <div className="case-row-meta">
            <StatusBadge status={item.status} />
            <span className="case-price">{money(item.quote_amount)}</span>
          </div>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
