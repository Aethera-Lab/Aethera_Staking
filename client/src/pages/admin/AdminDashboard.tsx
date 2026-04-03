import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminApproveKyc, adminRejectKyc,
  adminApproveProject, adminRejectProject,
  adminCreateVault, adminDepositRewards, adminUpdateConfig,
} from "../../services/api";
import "./Admin.css";

type Tab = "kyc" | "projects" | "vaults";

// For devnet demo — in production, pull these from a DB or chain indexer
const MOCK_KYC_SUBMISSIONS = [
  { wallet: "0xabc123...", name: "SunPower Inc.", business_reg: "REG-001", status: "Submitted", location: "Phoenix, AZ" },
  { wallet: "0xdef456...", name: "GreenRay Solar", business_reg: "REG-002", status: "Pending",   location: "San Francisco, CA" },
];

const MOCK_PROJECTS = [
  { project_id: 1, name: "Phoenix Solar Farm #1", installer: "0xabc123...", capacity_kw: 500, cost_apt: "1000 APT", location: "Phoenix, AZ",       status: "Pending" },
  { project_id: 2, name: "SF Rooftop Array",      installer: "0xabc123...", capacity_kw: 120, cost_apt: "400 APT",  location: "San Francisco, CA", status: "Approved" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab,     setTab]     = useState<Tab>("kyc");
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Vault form
  const [vaultProjectId, setVaultProjectId] = useState("");
  const [vaultApyRate,   setVaultApyRate]   = useState("8");
  const [depositProjectId, setDepositProjectId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [configProjectId, setConfigProjectId] = useState("");
  const [configApy, setConfigApy] = useState("");

  // Guard
  useEffect(() => {
    if (localStorage.getItem("aethera_admin") !== "true") navigate("/admin");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("aethera_admin");
    navigate("/admin");
  };

  const call = async (fn: () => Promise<any>, label: string) => {
    setLoading(label);
    setFeedback(null);
    try {
      const res = await fn();
      setFeedback({ type: "ok", msg: res.message || `${label} successful` });
    } catch (e: any) {
      setFeedback({ type: "err", msg: e.message || `${label} failed` });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="admin-dash">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-brand">🛡️ <span>Aethera Admin</span></div>
        <div className="dash-tabs">
          {(["kyc", "projects", "vaults"] as Tab[]).map((t) => (
            <button key={t} className={`dash-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t === "kyc" ? "🪪 KYC Review" : t === "projects" ? "📋 Projects" : "🏦 Vaults"}
            </button>
          ))}
        </div>
        <button className="logout-btn" onClick={handleLogout}>Logout →</button>
      </header>

      <div className="dash-content">
        {/* Feedback */}
        {feedback && (
          <div className={`dash-feedback ${feedback.type}`}>
            {feedback.type === "ok" ? "✅" : "⚠️"} {feedback.msg}
          </div>
        )}

        {/* ── KYC Tab ── */}
        {tab === "kyc" && (
          <div className="dash-section">
            <h2>KYC Submissions</h2>
            <p className="dash-sub">Review and approve or reject installer KYC documents.</p>
            <div className="admin-table">
              <div className="table-head">
                <span>Installer</span><span>Name</span><span>Business Reg</span><span>Location</span><span>Status</span><span>Actions</span>
              </div>
              {MOCK_KYC_SUBMISSIONS.map((k) => (
                <div className="table-row" key={k.wallet}>
                  <span className="mono">{k.wallet}</span>
                  <span>{k.name}</span>
                  <span>{k.business_reg}</span>
                  <span>{k.location}</span>
                  <span className={`status-chip ${k.status.toLowerCase()}`}>{k.status}</span>
                  <div className="row-actions">
                    <button
                      className="approve-btn"
                      disabled={loading === `kyc-approve-${k.wallet}`}
                      onClick={() => call(() => adminApproveKyc(k.wallet), `kyc-approve-${k.wallet}`)}
                    >
                      {loading === `kyc-approve-${k.wallet}` ? "..." : "✅ Approve"}
                    </button>
                    <button
                      className="reject-btn"
                      disabled={loading === `kyc-reject-${k.wallet}`}
                      onClick={() => call(() => adminRejectKyc(k.wallet), `kyc-reject-${k.wallet}`)}
                    >
                      {loading === `kyc-reject-${k.wallet}` ? "..." : "❌ Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Manual address input for real on-chain data */}
            <div className="manual-action">
              <h3>Manual Action by Address</h3>
              <div className="manual-row">
                <input id="kyc-addr" placeholder="0x installer wallet address..." />
                <button onClick={() => call(() => adminApproveKyc((document.getElementById("kyc-addr") as HTMLInputElement).value), "kyc-approve")}>Approve KYC</button>
                <button className="reject-btn" onClick={() => call(() => adminRejectKyc((document.getElementById("kyc-addr") as HTMLInputElement).value), "kyc-reject")}>Reject KYC</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Projects Tab ── */}
        {tab === "projects" && (
          <div className="dash-section">
            <h2>Project Review</h2>
            <p className="dash-sub">Approve projects to make them visible to investors. Approved projects can have vaults created.</p>
            <div className="admin-table">
              <div className="table-head">
                <span>ID</span><span>Name</span><span>Installer</span><span>Capacity</span><span>Goal</span><span>Location</span><span>Status</span><span>Actions</span>
              </div>
              {MOCK_PROJECTS.map((p) => (
                <div className="table-row" key={p.project_id}>
                  <span className="mono">#{p.project_id}</span>
                  <span>{p.name}</span>
                  <span className="mono">{p.installer}</span>
                  <span>{p.capacity_kw} kW</span>
                  <span>{p.cost_apt}</span>
                  <span>{p.location}</span>
                  <span className={`status-chip ${p.status.toLowerCase()}`}>{p.status}</span>
                  <div className="row-actions">
                    <button className="approve-btn" disabled={!!loading} onClick={() => call(() => adminApproveProject(p.project_id), `proj-${p.project_id}`)}>
                      {loading === `proj-${p.project_id}` ? "..." : "✅ Approve"}
                    </button>
                    <button className="reject-btn" disabled={!!loading} onClick={() => call(() => adminRejectProject(p.project_id), `proj-rej-${p.project_id}`)}>
                      {loading === `proj-rej-${p.project_id}` ? "..." : "❌ Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="manual-action">
              <h3>Manual Action by Project ID</h3>
              <div className="manual-row">
                <input id="proj-id" type="number" placeholder="Project ID..." style={{ width: 120 }} />
                <button onClick={() => call(() => adminApproveProject(Number((document.getElementById("proj-id") as HTMLInputElement).value)), "proj-approve")}>Approve Project</button>
                <button className="reject-btn" onClick={() => call(() => adminRejectProject(Number((document.getElementById("proj-id") as HTMLInputElement).value)), "proj-reject")}>Reject Project</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Vaults Tab ── */}
        {tab === "vaults" && (
          <div className="dash-section">
            <h2>Vault Management</h2>
            <p className="dash-sub">Create and manage per-project staking vaults. Must approve project first.</p>
            <div className="vault-forms">

              {/* Create Vault */}
              <div className="vault-form-card">
                <h3>🏗️ Create Project Vault</h3>
                <p>Creates a staking vault for an already-approved project.</p>
                <div className="vault-form-row">
                  <div className="vf-group"><label>Project ID</label><input type="number" value={vaultProjectId} onChange={(e) => setVaultProjectId(e.target.value)} placeholder="e.g. 1" /></div>
                  <div className="vf-group"><label>APY Rate (%)</label><input type="number" value={vaultApyRate} onChange={(e) => setVaultApyRate(e.target.value)} placeholder="8" /></div>
                </div>
                <button className="vault-btn" disabled={!!loading} onClick={() => call(() => adminCreateVault(Number(vaultProjectId), Number(vaultApyRate)), "vault-create")}>
                  {loading === "vault-create" ? "Creating..." : "Create Vault →"}
                </button>
              </div>

              {/* Deposit Rewards */}
              <div className="vault-form-card">
                <h3>💰 Deposit Reward APT</h3>
                <p>Top up a project vault's reward pool so investors can claim yield.</p>
                <div className="vault-form-row">
                  <div className="vf-group"><label>Project ID</label><input type="number" value={depositProjectId} onChange={(e) => setDepositProjectId(e.target.value)} placeholder="e.g. 1" /></div>
                  <div className="vf-group"><label>Amount (octas)</label><input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g. 100000000 = 1 APT" /></div>
                </div>
                <button className="vault-btn" disabled={!!loading} onClick={() => call(() => adminDepositRewards(Number(depositProjectId), depositAmount), "vault-deposit")}>
                  {loading === "vault-deposit" ? "Depositing..." : "Deposit Rewards →"}
                </button>
              </div>

              {/* Update APY */}
              <div className="vault-form-card">
                <h3>⚙️ Update APY Rate</h3>
                <p>Adjust the APY rate for a project vault after creation.</p>
                <div className="vault-form-row">
                  <div className="vf-group"><label>Project ID</label><input type="number" value={configProjectId} onChange={(e) => setConfigProjectId(e.target.value)} placeholder="e.g. 1" /></div>
                  <div className="vf-group"><label>New APY (%)</label><input type="number" value={configApy} onChange={(e) => setConfigApy(e.target.value)} placeholder="e.g. 10" /></div>
                </div>
                <button className="vault-btn" disabled={!!loading} onClick={() => call(() => adminUpdateConfig(Number(configProjectId), Number(configApy)), "vault-config")}>
                  {loading === "vault-config" ? "Updating..." : "Update APY →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}