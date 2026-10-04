import { LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHeading, Panel, RouteLink, TruthBadge } from "../components/ui";
const risks = [
  [
    "Unauthorized spend",
    "Resolve an existing spend request before a mock payment action. Amounts are not accepted from the approval form.",
    "Real payment integration, reconciliation and fraud controls are not implemented.",
  ],
  [
    "Silent provider changes",
    "A provider-change approval is tied to the requested target, then checked again on execution.",
    "Provider vetting, identity and dispute handling remain production requirements.",
  ],
  [
    "Premature closure",
    "Approved service, assignment, evidence and both confirmations are prerequisites. Unresolved reports reopen the case.",
    "A demo confirmation is not independently verified proof of quality.",
  ],
  [
    "Private data exposure",
    "Sharing uses an approved fixed minimal payload. UI warns against sensitive free text; logs are backend-controlled.",
    "Production needs access control, redaction review, retention, deletion and consent governance.",
  ],
  [
    "Misleading automation",
    "Every page identifies MOCK mode; events, evidence, decisions and connector calls display supplied truth labels.",
    "A label is provenance metadata, not proof that a claim is true.",
  ],
  [
    "Emergency misuse",
    "Safety flags are local notes, not dispatch. The interface directs users to immediate qualified help.",
    "No emergency response, guaranteed monitoring or live escalation exists.",
  ],
];
export default function RisksPage() {
  return (
    <>
      <PageHeading
        eyebrow="TRUST HAS TO BE EARNED"
        title="Risks & Safeguards"
        description="A useful assistant should know where its authority ends. These boundaries are part of the product."
      />
      <section className="risk-hero">
        <ShieldCheck size={38} />
        <div>
          <h2>
            Permission is specific.
            <br />
            Completion is shared.
          </h2>
          <p>
            Neither a role dropdown nor an AI instruction is a security
            boundary. This local demo relies on backend state guards, not
            production authentication.
          </p>
        </div>
      </section>
      <div className="risk-grid">
        {risks.map(([title, guard, limitation], index) => (
          <Panel key={title}>
            <p className="eyebrow">RISK {String(index + 1).padStart(2, "0")}</p>
            <h2 className="mt-3">{title}</h2>
            <p className="risk-label">
              <LockKeyhole size={14} />
              DEMO SAFEGUARD
            </p>
            <p>{guard}</p>
            <p className="risk-label limitation">WHAT IT DOES NOT SOLVE</p>
            <p className="muted">{limitation}</p>
          </Panel>
        ))}
      </div>
      <Panel
        title="Before this could be trusted with a real home"
        className="mt-6"
      >
        <TruthBadge label="PROPOSED_CAPABILITY" />
        <div className="three-column mt-5">
          <div>
            <h3>Identity & accountability</h3>
            <p className="muted mt-2">
              Real authentication, household isolation, least-privilege
              permissions and an accountable escalation owner.
            </p>
          </div>
          <div>
            <h3>Operations & recovery</h3>
            <p className="muted mt-2">
              Provider onboarding, service guarantees, disputes, safe retries,
              incident response and payment reconciliation.
            </p>
          </div>
          <div>
            <h3>Privacy & verification</h3>
            <p className="muted mt-2">
              Evidence validation, consent tracking, access audits, secure
              storage and appropriate data retention.
            </p>
          </div>
        </div>
      </Panel>
      <div className="button-row mt-6">
        <RouteLink to="/cases/RK-2048">Try the guarded case actions</RouteLink>
        <RouteLink to="/evidence">Inspect the audit trail</RouteLink>
      </div>
    </>
  );
}
