import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { TruthLabel } from "../types/api";
import { ApiError } from "../services/api";
import { humanize } from "../utils/format";
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Panel({
  title,
  kicker,
  children,
  className = "",
  action,
}: {
  title?: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || kicker) && (
        <header className="panel-heading">
          <div>
            {kicker && <p className="eyebrow">{kicker}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
export function TruthBadge({ label }: { label: TruthLabel }) {
  const labels: Record<TruthLabel, string> = {
    LIVE_API: "Live API · reported by server",
    REAL_HUMAN_INPUT: "Human input · local",
    DOCUMENTATION_SIMULATION: "Documentary simulation",
    PROPOSED_CAPABILITY: "Proposed capability",
  };
  return (
    <span className={`truth-badge truth-${label}`} title={label}>
      {labels[label] ?? label}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const mood = /reject|unresolved|blocked|emergency|failed/.test(status)
    ? "danger"
    : /pending|waiting|approval/.test(status)
      ? "orange"
      : /closed|approved|complete|active|success/.test(status)
        ? "green"
        : "neutral";
  return (
    <span className={`status-badge ${mood}`}>
      <span aria-hidden="true" className="status-dot" />
      {humanize(status)}
    </span>
  );
}
export function Loading({
  label = "Loading local records…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="animate-spin" size={21} />
      {label}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>
          {error instanceof ApiError && error.status
            ? `Request blocked or failed · ${error.status}`
            : "Unable to complete request"}
        </strong>
        <p>{error.message}</p>
        {retry && (
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => void;
  children: ReactNode;
}) {
  if (pending) return <Loading />;
  if (error) return <ErrorNotice error={error} retry={retry} />;
  return <>{children}</>;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function MutationFeedback({
  mutation,
  success = "Saved to the local demo.",
}: {
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  success?: string;
}) {
  if (mutation.isPending)
    return (
      <p className="inline-feedback" role="status">
        <LoaderCircle size={16} className="animate-spin" />
        Saving and refreshing records…
      </p>
    );
  if (mutation.error) return <ErrorNotice error={mutation.error} />;
  if (mutation.isSuccess)
    return (
      <p className="inline-feedback success" role="status">
        <CheckCircle2 size={16} />
        {success}
      </p>
    );
  return null;
}
export function RouteLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
}
export function HumanInputNote() {
  return (
    <p className="form-note">
      <TruthBadge label="REAL_HUMAN_INPUT" /> Local submission, not
      independently verified. Do not enter sensitive information.
    </p>
  );
}
