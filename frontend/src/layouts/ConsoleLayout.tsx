import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Home,
  House,
  LayoutDashboard,
  Menu,
  Network,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DEMO_ROLES, getDemoRole, setDemoRole } from "../store/demo";
import type { DemoRole } from "../store/demo";
const mainLinks = [
  { to: "/project/demo", label: "Live Demo", icon: LayoutDashboard },
  { to: "/customer/cases/RK-2048", label: "Household View", icon: House },
  {
    to: "/provider/cases/provider-kent-care/RK-2048",
    label: "Provider View",
    icon: Wrench,
  },
];
const labLinks = [
  { to: "/project/evidence", label: "Proof Ledger", icon: BookOpen },
  { to: "/project/rails", label: "API Evidence", icon: Network },
  { to: "/project/system-prompt", label: "Agent Rules", icon: Sparkles },
];
const ideaLinks = [
  { to: "/project/business-plan", label: "Business Plan", icon: CircleHelp },
  { to: "/project/risks", label: "Risks & Safeguards", icon: ShieldCheck },
];
export default function ConsoleLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<DemoRole>(getDemoRole());
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname]);
  const current =
    [...mainLinks, ...labLinks, ...ideaLinks].find(
      (link) => link.to === location.pathname,
    )?.label ??
    (location.pathname.startsWith("/customer/")
      ? "Household View"
      : location.pathname.startsWith("/provider/")
        ? "Provider View"
        : location.pathname.startsWith("/cases/")
          ? "Case Room"
          : location.pathname === "/project/landing"
            ? "Public Landing"
            : "Console");
  useEffect(() => {
    document.title = `${current} · RamuKaka`;
  }, [current]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        id="main-navigation"
      >
        <Link className="brand" to="/" aria-label="RamuKaka home">
          <span className="brand-mark">
            <Home size={23} />
          </span>
          <span>
            ramukaka<span className="brand-dot">.</span>
            <small>A little less to manage.</small>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-dot" />
          HOUSEHOLD CONSOLE<span className="tiny-label">01</span>
        </div>
        <nav aria-label="Main navigation">
          {[
            { label: "WORKSPACE", items: mainLinks },
            { label: "BEHIND THE SCENES", items: labLinks },
            { label: "THE BIGGER PICTURE", items: ideaLinks },
          ].map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Human permission first.</strong>
              <p>
                Nothing paid. Nothing shared.
                <br />
                Not without your say.
              </p>
            </div>
          </div>
          <NavLink to="/project/landing" className="nav-link">
            Public Landing
            <ArrowUpRight size={17} />
          </NavLink>
          <p className="sidebar-version">
            LOCAL PROTOTYPE <span>v0.1 / MOCK</span>
          </p>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-button mobile-toggle"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls="main-navigation"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span className="breadcrumb">
              <span className="breadcrumb-parent">Workspace / </span>
              <strong>{current}</strong>
            </span>
          </div>
          {location.pathname === "/project/demo" ? (
            <span className="small muted">
              Roles switch automatically in this guided demo
            </span>
          ) : (
            <div className="role-control">
              <label htmlFor="demo-role">
                Demo attribution <small>not authentication</small>
              </label>
              <select
                id="demo-role"
                aria-label="Demo attribution — not authentication"
                value={role}
                onChange={(event) => {
                  const next = event.target.value as DemoRole;
                  setRole(next);
                  setDemoRole(next);
                }}
              >
                {DEMO_ROLES.map((value) => (
                  <option value={value} key={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
              <span className="avatar" aria-hidden="true">
                RK
              </span>
            </div>
          )}
        </header>
        <div className="demo-banner">
          <span className="demo-chip">MOCK / DEMO</span>
          <p>
            Local records. Simulated connectors.{" "}
            <strong>No real payments, bookings or outbound messages.</strong>
          </p>
          <Link to="/project/rails">
            See boundaries <ArrowUpRight size={14} />
          </Link>
        </div>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            RamuKaka · Household operations, with a human in the loop.
          </span>
          <Link to="/project/risks">
            Trust is a process, not a promise <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
