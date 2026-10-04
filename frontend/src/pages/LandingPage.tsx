import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  HandHeart,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import homeIllustration from "../assets/home-illustration.svg";
import { api } from "../services/api";
import { useApiMutation } from "../hooks/useApi";
import {
  HumanInputNote,
  MutationFeedback,
  Panel,
  TruthBadge,
} from "../components/ui";
export default function LandingPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const signup = useApiMutation(api.signup);
  return (
    <>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">A LITTLE LESS TO MANAGE.</p>
          <h1>
            Your home has a lot
            <br />
            of moving parts.
            <br />
            <em>You don’t have to.</em>
          </h1>
          <p className="landing-description">
            Meet RamuKaka. A proposed household assistant that keeps repairs
            moving, decisions clear, and you in control.
          </p>
          <div className="button-row">
            <a className="btn btn-primary" href="#local-signup">
              Express local interest
              <ArrowRight size={17} />
            </a>
            <Link className="btn btn-secondary" to="/simulation">
              Explore the demo
            </Link>
          </div>
          <p className="small muted mt-4">
            Prototype only. Not a live booking or household service.
          </p>
        </div>
        <img
          src={homeIllustration}
          alt="An illustrated home, quietly looked after"
        />
      </section>
      <div className="three-column landing-features">
        {[
          {
            icon: ClipboardList,
            title: "One story, not ten follow-ups.",
            text: "A shared case record carries the complaint, context and next step.",
          },
          {
            icon: ShieldCheck,
            title: "Your home. Your permission.",
            text: "Spending, changing providers and sharing require specific approval.",
          },
          {
            icon: HandHeart,
            title: "Done is a shared decision.",
            text: "Provider completion and household verification belong together.",
          },
        ].map((item) => (
          <div key={item.title}>
            <item.icon size={25} />
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
      <div className="landing-bottom">
        <div>
          <TruthBadge label="PROPOSED_CAPABILITY" />
          <h2>
            Built around a simple idea:
            <br />
            <em>care should be accountable.</em>
          </h2>
          <p className="muted">
            We are exploring this idea, not claiming proven demand or results.
            This demonstration uses local records and mock connectors. There are
            no live providers, real charges or outbound notifications.
          </p>
          <div className="mt-5">
            <Link className="text-link" to="/business-plan">
              Read the assumptions
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <Panel title="Curious about the idea?" kicker="LOCAL INTEREST FORM">
          <div id="local-signup" className="anchor-target" />
          {signup.isSuccess ? (
            <div className="signup-success" role="status">
              <CheckCircle2 size={32} />
              <h3>Interest recorded locally.</h3>
              <p>{signup.data.message}</p>
              <p className="small muted">
                Reference: {signup.data.id}. No email or external signup was
                sent.
              </p>
              <button
                className="btn btn-secondary mt-4"
                onClick={() => {
                  signup.reset();
                  setName("");
                  setEmail("");
                  setConsent(false);
                }}
              >
                Record another local signup
              </button>
            </div>
          ) : (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (consent)
                  signup.mutate({
                    name: name.trim(),
                    email: email.trim(),
                    consent: true,
                  });
              }}
            >
              <label htmlFor="signup-name">Your name</label>
              <input
                id="signup-name"
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <label htmlFor="signup-email">Email address</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I consent to storing this name and email in this local demo. No
                email will be sent.
              </label>
              <HumanInputNote />
              <p className="small muted">
                Use a demo name and address if you prefer. This is not a
                subscription, service booking or real mailing list.
              </p>
              <button
                className="btn btn-primary"
                disabled={
                  signup.isPending || !consent || !name.trim() || !email.trim()
                }
              >
                {signup.isPending ? "Saving locally…" : "Save local signup"}
                <ArrowRight size={16} />
              </button>
              <MutationFeedback mutation={signup} />
            </form>
          )}
        </Panel>
      </div>
    </>
  );
}
