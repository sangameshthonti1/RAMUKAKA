import { ArrowUpRight, Check, CircleDashed } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeading, Panel, TruthBadge } from "../components/ui";
const hypotheses = [
  [
    "01",
    "The problem",
    "Household maintenance is coordination work.",
    "Hypothesis: people managing a home lose time repeating context, chasing providers and verifying completion. Validate through interviews and observed service journeys, not assumptions about every household.",
  ],
  [
    "02",
    "The first customer",
    "Start with one household, one repair.",
    "Hypothesis: busy households with recurring appliance maintenance may value a shared case history and explicit approvals. Test a narrowly scoped, consented pilot before broadening the audience.",
  ],
  [
    "03",
    "The value proposition",
    "Sell clarity, not invisible autonomy.",
    "Hypothesis: transparent quotes, a visible next step and two-party closure improve trust. Compare these with the household’s current approach; measure usefulness, not just interaction counts.",
  ],
  [
    "04",
    "The business model",
    "Subscription or per-case assistance?",
    "Both are unvalidated options. Test willingness to pay, support effort and provider incentives. The ₹749 in this demo is a supplied service quote, not product pricing, revenue or margin.",
  ],
];
export default function BusinessPlanPage() {
  return (
    <>
      <PageHeading
        eyebrow="A THESIS TO TEST, NOT A SUCCESS STORY"
        title="The business behind the care."
        description="A focused household operations concept. Honest about what exists, and what still needs to be learned."
      />
      <section className="editorial-hero">
        <TruthBadge label="PROPOSED_CAPABILITY" />
        <h2>
          Trust may be the product.
          <br />
          <em>Coordination is the work.</em>
        </h2>
        <p>
          RamuKaka explores whether accountable follow-through can be more
          useful than another list of service providers.
        </p>
      </section>
      <div className="hypothesis-grid">
        {hypotheses.map(([number, label, title, description]) => (
          <Panel key={number}>
            <p className="eyebrow">
              <span className="section-number">{number}</span>
              {label} / HYPOTHESIS
            </p>
            <h2 className="mt-4">{title}</h2>
            <p className="muted mt-3">{description}</p>
          </Panel>
        ))}
      </div>
      <div className="detail-grid mt-6">
        <Panel title="What is actually here" kicker="DEMO SCOPE">
          <ul className="feature-list">
            <li>
              <Check size={18} />
              <span>
                A local case record with timelines and provenance labels.
              </span>
            </li>
            <li>
              <Check size={18} />
              <span>
                Scoped approval requests and backend-guarded mock actions.
              </span>
            </li>
            <li>
              <Check size={18} />
              <span>
                A six-step documentary story and manual confirmation forms.
              </span>
            </li>
            <li>
              <CircleDashed size={18} />
              <span>
                No live service network, verified traction, market-size claim or
                proven unit economics.
              </span>
            </li>
          </ul>
        </Panel>
        <Panel title="How we would learn" kicker="PROPOSED VALIDATION">
          <ol className="numbered-list">
            <li>Interview households and providers about a recent repair.</li>
            <li>Test whether the case record reduces repeated explanations.</li>
            <li>
              Measure approval understanding, unresolved cases and coordination
              effort.
            </li>
            <li>
              Estimate contribution only after provider costs, support, refunds
              and acquisition are observed.
            </li>
          </ol>
        </Panel>
      </div>
      <Panel
        title="Round 3: thematic mapping, not verbatim answers"
        className="mt-6"
      >
        <p className="muted">
          The exact user-supplied Round 3 questions are unavailable. This
          prototype maps the themes of problem, customer, workflow, feasibility,
          economics and safeguards to the relevant views. It does not claim to
          reproduce the original questions; the parent documentation owns the
          fuller mapping.
        </p>
        <div className="button-row mt-5">
          <Link className="btn btn-secondary" to="/simulation">
            Workflow & feasibility
            <ArrowUpRight size={16} />
          </Link>
          <Link className="btn btn-secondary" to="/risks">
            Risk & responsibility
            <ArrowUpRight size={16} />
          </Link>
          <Link className="btn btn-primary" to="/landing">
            See the public proposition
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </Panel>
    </>
  );
}
