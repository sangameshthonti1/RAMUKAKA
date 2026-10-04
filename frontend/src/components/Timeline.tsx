import { Check, Clock3 } from "lucide-react";
import type { CaseEvent } from "../types/api";
import { dateTime } from "../utils/format";
import { EmptyState, TruthBadge } from "./ui";
export function Timeline({ events }: { events: CaseEvent[] }) {
  if (!events.length) return <EmptyState title="No events recorded" />;
  return (
    <ol className="timeline">
      {events.map((event, index) => (
        <li key={event.id}>
          <span
            className={`timeline-marker ${index === events.length - 1 ? "last" : ""}`}
            aria-hidden="true"
          >
            {index === events.length - 1 ? (
              <Clock3 size={14} />
            ) : (
              <Check size={14} />
            )}
          </span>
          <div className="timeline-title">
            <h3>{event.title}</h3>
            <time dateTime={event.created_at}>
              {dateTime(event.created_at)}
            </time>
          </div>
          <p>{event.detail}</p>
          <TruthBadge label={event.truth_label} />
        </li>
      ))}
    </ol>
  );
}
