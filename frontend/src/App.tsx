import { Link, Navigate, Route, Routes } from "react-router-dom";
import PortalLayout from "./layouts/PortalLayout";
import CustomerChatPage from "./pages/CustomerChatPage";
import CustomerCasePage from "./pages/CustomerCasePage";
import ProviderCasePage from "./pages/ProviderCasePage";
import ConsoleLayout from "./layouts/ConsoleLayout";
import HomePage from "./pages/HomePage";
import CaseRoomPage from "./pages/CaseRoomPage";
import MyHomePage from "./pages/MyHomePage";
import ProviderDeskPage from "./pages/ProviderDeskPage";
import SimulationPage from "./pages/SimulationPage";
import EvidenceLedgerPage from "./pages/EvidenceLedgerPage";
import RailsPage from "./pages/RailsPage";
import SystemPromptPage from "./pages/SystemPromptPage";
import BusinessPlanPage from "./pages/BusinessPlanPage";
import RisksPage from "./pages/RisksPage";
import LandingPage from "./pages/LandingPage";
import GuidedDemoPage from "./pages/GuidedDemoPage";
import { PageHeading, RouteLink } from "./components/ui";
function PortalChoice() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-8">
      <PageHeading
        eyebrow="RAMUKAKA · LOCAL DEMO"
        title="Your home, looked after."
        description="Choose a workspace to explore the saved household service prototype. This selection does not verify identity."
      />
      <div className="detail-grid">
        <div className="panel p-6 space-y-4">
          <h2>See one repair from start to finish</h2>
          <p>
            Follow one repair through price approval, the provider's work and
            final checks by both sides. You will always see the next action.
          </p>
          <Link className="btn btn-primary" to="/project/demo">
            Start step-by-step demo
          </Link>
        </div>
        <div className="panel p-6 space-y-4">
          <h2>For households</h2>
          <p>
            Keep track of household items, ask the service assistant, and review
            repairs.
          </p>
          <Link className="btn btn-primary" to="/customer">
            Open customer portal
          </Link>
        </div>
        <div className="panel p-6 space-y-4">
          <h2>For service providers</h2>
          <p>Review quote requests and document assigned work.</p>
          <Link className="btn btn-secondary" to="/provider">
            Open provider portal
          </Link>
        </div>
      </div>
      <p className="small muted">
        Local mock workflow only. No real provider authentication, bookings,
        messages or payments.
      </p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route index element={<PortalChoice />} />
      <Route path="customer" element={<PortalLayout portal="customer" />}>
        <Route index element={<HomePage />} />
        <Route path="home" element={<MyHomePage />} />
        <Route path="chat" element={<CustomerChatPage />} />
        <Route path="cases" element={<CustomerCasePage />} />
        <Route path="cases/:caseId" element={<CustomerCasePage />} />
      </Route>
      <Route path="provider" element={<PortalLayout portal="provider" />}>
        <Route index element={<ProviderDeskPage />} />
        <Route
          path="cases/:providerId/:caseId"
          element={<ProviderCasePage />}
        />
      </Route>
      <Route path="project" element={<ConsoleLayout />}>
        <Route index element={<Navigate to="/project/demo" replace />} />
        <Route path="demo" element={<GuidedDemoPage />} />
        <Route path="cases" element={<CaseRoomPage />} />
        <Route path="cases/:caseId" element={<CaseRoomPage />} />
        <Route path="my-home" element={<MyHomePage />} />
        <Route path="providers" element={<Navigate to="/provider" replace />} />
        <Route path="simulation" element={<SimulationPage />} />
        <Route path="evidence" element={<EvidenceLedgerPage />} />
        <Route path="rails" element={<RailsPage />} />
        <Route path="system-prompt" element={<SystemPromptPage />} />
        <Route path="business-plan" element={<BusinessPlanPage />} />
        <Route path="risks" element={<RisksPage />} />
        <Route path="landing" element={<LandingPage />} />
      </Route>
      <Route path="cases" element={<Navigate to="/customer/cases" replace />} />
      <Route
        path="cases/:caseId"
        element={<Navigate to="/customer/cases" replace />}
      />
      <Route
        path="my-home"
        element={<Navigate to="/customer/home" replace />}
      />
      <Route path="providers" element={<Navigate to="/provider" replace />} />
      <Route path="demo" element={<Navigate to="/project/demo" replace />} />
      <Route
        path="simulation"
        element={<Navigate to="/project/simulation" replace />}
      />
      <Route
        path="evidence"
        element={<Navigate to="/project/evidence" replace />}
      />
      <Route path="rails" element={<Navigate to="/project/rails" replace />} />
      <Route
        path="system-prompt"
        element={<Navigate to="/project/system-prompt" replace />}
      />
      <Route
        path="business-plan"
        element={<Navigate to="/project/business-plan" replace />}
      />
      <Route path="risks" element={<Navigate to="/project/risks" replace />} />
      <Route
        path="landing"
        element={<Navigate to="/project/landing" replace />}
      />
      <Route
        path="*"
        element={
          <>
            <PageHeading
              eyebrow="404 / NOT FOUND"
              title="This room does not exist."
              description="The page may have moved. Your local records have not changed."
            />
            <RouteLink to="/">Choose a portal</RouteLink>
          </>
        }
      />
    </Routes>
  );
}
