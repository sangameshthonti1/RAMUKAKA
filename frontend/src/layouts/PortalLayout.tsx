import { useEffect, useState } from "react";
import { Home, Menu, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { setDemoRole } from "../store/demo";

type Portal = "customer" | "provider";
const links = {
  customer: [
    { to: "/customer", label: "Dashboard" },
    { to: "/customer/home", label: "My Home" },
    { to: "/customer/chat", label: "Service chat" },
    { to: "/customer/cases", label: "My cases" },
  ],
  provider: [{ to: "/provider", label: "My queue" }],
};

export default function PortalLayout({ portal }: { portal: Portal }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Local demo attribution only. Neither this switch nor its header authenticates a person.
  setDemoRole(portal === "customer" ? "household" : "provider");
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
    document.title = `${portal === "customer" ? "Customer" : "Provider"} · RamuKaka`;
  }, [location.pathname, portal]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} id="main-navigation">
        <Link className="brand" to={`/${portal}`} aria-label="RamuKaka home">
          <span className="brand-mark"><Home size={23} /></span>
          <span>ramukaka<span className="brand-dot">.</span><small>A little less to manage.</small></span>
        </Link>
        <div className="workspace-label"><span className="workspace-dot" />{portal === "customer" ? "CUSTOMER" : "PROVIDER"} PORTAL</div>
        <nav aria-label={`${portal} navigation`}>
          <div className="nav-group"><p>GUIDED EXPERIENCE</p>
            <NavLink to="/project/demo" className="nav-link">Step-by-step Demo</NavLink>
          </div>
          <div className="nav-group"><p>YOUR WORKSPACE</p>
            {links[portal].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === `/${portal}`} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>{item.label}</NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-bottom"><p className="sidebar-version">LOCAL PROTOTYPE <span>MOCK / DEMO</span></p></div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button className="icon-button mobile-toggle" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="main-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
            <span className="breadcrumb"><strong>{portal === "customer" ? "Customer workspace" : "Provider workspace"}</strong></span>
          </div>
          <span className="small muted">Local demo · No verified sign-in</span>
        </header>
        <div className="demo-banner"><span className="demo-chip">MOCK / DEMO</span><p>Saved local records. <strong>No real payments, bookings or outbound messages.</strong> Portal selection is not authentication.</p></div>
        <main id="main-content" tabIndex={-1}><Outlet /></main>
        <footer className="app-footer">RamuKaka · Local household service prototype.</footer>
      </div>
    </div>
  );
}
