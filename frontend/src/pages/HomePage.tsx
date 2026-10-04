import { useQuery } from "@tanstack/react-query";
import { useCoordination } from "../hooks/useCoordination";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  Home,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import homeIllustration from "../assets/home-illustration.svg";
import { useAssets, useCase, useCases, keys } from "../hooks/useApi";
import { api } from "../services/api";
import { ApprovalCard } from "../components/ApprovalCard";
import { CaseList } from "../components/CaseList";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  TruthBadge,
} from "../components/ui";
export default function HomePage() {
  const cases = useCases();
  const assets = useAssets();
  const notifications = useQuery({
    queryKey: keys.notifications,
    queryFn: api.notifications,
    refetchInterval: 5000,
  });
  const attention = cases.data?.find(
    (item) => item.status === "waiting_for_approval",
  );
  const detail = useCase(attention?.id ?? "");
  const coordination = useCoordination(attention?.id ?? "");
  const openCount = cases.data?.filter(
    (item) => !["closed", "cancelled"].includes(item.status),
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="A CLEARER PICTURE"
        title="A home that’s looked after."
        description="The work, the decisions, and the little things that keep your home running."
        action={
          <Link className="btn btn-primary" to="/customer/chat">
            Report an issue
            <ArrowUpRight size={17} />
          </Link>
        }
      />
      <section className="home-hero">
        <div>
          <span className="eyebrow">YOUR HOUSEHOLD, IN ONE PLACE</span>
          <h2>
            Less following up.
            <br />
            <em>More peace of mind.</em>
          </h2>
          <p>
            RamuKaka keeps the next step visible.
            <br />
            You keep the final say.
          </p>
          <Link to="/customer/cases" className="text-link">
            Step into the Case Room <ArrowRight size={17} />
          </Link>
        </div>
        <img
          src={homeIllustration}
          alt="A quiet home with a check-mark and a small plant"
        />
      </section>
      <div className="stat-grid">
        <article className="stat-card">
          <span className="icon-tile">
            <Wrench size={20} />
          </span>
          <div>
            <p>Open cases</p>
            <strong>{openCount ?? "—"}</strong>
            <small>Current local records</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="icon-tile orange-icon">
            <ClipboardCheck size={20} />
          </span>
          <div>
            <p>Waiting for approval</p>
            <strong>
              {cases.data?.filter(
                (item) => item.status === "waiting_for_approval",
              ).length ?? "—"}
            </strong>
            <small>Your decision comes first</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="icon-tile">
            <Home size={20} />
          </span>
          <div>
            <p>Assets on record</p>
            <strong>{assets.data?.length ?? "—"}</strong>
            <small>Local asset inventory</small>
          </div>
        </article>
      </div>
      {assets.error && (
        <QueryState
          pending={false}
          error={assets.error}
          retry={() => void assets.refetch()}
        >
          {null}
        </QueryState>
      )}
      <div className="dashboard-grid">
        <div className="space-y-6">
          <Panel
            title="On your radar"
            kicker="HOUSEHOLD OPERATIONS"
            action={<RouteLink to="/customer/cases">All cases</RouteLink>}
          >
            <QueryState
              pending={cases.isPending}
              error={cases.error}
              retry={() => void cases.refetch()}
            >
              <CaseList cases={cases.data ?? []} />
            </QueryState>
          </Panel>
          <Panel title="The latest updates" kicker="LOCAL NOTIFICATION LOG">
            <QueryState
              pending={notifications.isPending}
              error={notifications.error}
              retry={() => void notifications.refetch()}
            >
              {notifications.data?.length ? (
                <div className="update-list">
                  {notifications.data
                    .slice(-4)
                    .reverse()
                    .map((item) => (
                      <article key={item.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="tiny-label">
                            {item.channel} · {item.status}
                          </span>
                          <TruthBadge label={item.truth_label} />
                        </div>
                        <p>{item.message}</p>
                        <RouteLink
                          to={`/customer/cases/${encodeURIComponent(item.case_id)}`}
                        >
                          {item.case_id}
                        </RouteLink>
                      </article>
                    ))}
                </div>
              ) : (
                <EmptyState title="A quiet inbox">
                  Local notification records will appear here. Nothing is sent
                  externally.
                </EmptyState>
              )}
            </QueryState>
          </Panel>
        </div>
        <div className="space-y-6">
          {attention ? (
            <Panel title="A decision for you" kicker="HUMAN IN THE LOOP">
              <QueryState
                pending={detail.isPending}
                error={detail.error}
                retry={() => void detail.refetch()}
              >
                {coordination.data ? (
                  <p>
                    Review the bot's offer in your case and approve total cost
                    and timing together. Mock assignment follows automatically.
                  </p>
                ) : (
                  detail.data?.approvals
                    .filter((item) => item.status === "pending")
                    .map((approval) => (
                      <ApprovalCard key={approval.id} approval={approval} />
                    ))
                )}
                <RouteLink
                  to={`/customer/cases/${encodeURIComponent(attention.id)}`}
                >
                  See context & evidence
                </RouteLink>
              </QueryState>
            </Panel>
          ) : (
            <Panel title="Approval desk">
              <QueryState
                pending={cases.isPending}
                error={cases.error}
                retry={() => void cases.refetch()}
              >
                <p className="muted small">
                  No case is marked waiting for approval. Review individual
                  cases for any additional scoped requests.
                </p>
                <div className="mt-4">
                  <RouteLink to="/customer/cases">
                    Review case approvals
                  </RouteLink>
                </div>
              </QueryState>
            </Panel>
          )}
          <section className="principle-card">
            <ShieldCheck size={27} />
            <h2>
              Done means
              <br />
              confirmed by both.
            </h2>
            <p>
              A provider saying “complete” is not enough. Service evidence and
              household confirmation are part of the same closure check.
            </p>
          </section>
          <div className="quiet-link-card">
            <span className="eyebrow">NEED A HAND?</span>
            <h3>Start with your household records.</h3>
            <p>The service assistant can help you document a repair request.</p>
            <RouteLink to="/customer/chat">Open service chat</RouteLink>
          </div>
        </div>
      </div>
    </>
  );
}
