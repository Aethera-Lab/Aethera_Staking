import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import type { InputTransactionData } from "@aptos-labs/wallet-adapter-react";
import { useNavigate } from "react-router-dom";
import { getInstaller, getBalance, type InstallerInfo } from "../../services/api";
import "./InstallerPortal.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x3894481b4dab10b691e954de7836b39fab6ea587861a613792aabd2f21008747";

const REGISTRY_AUTHORITY = import.meta.env.VITE_REGISTRY_AUTHORITY || CONTRACT_ADDRESS;
const PROJECT_AUTHORITY  = import.meta.env.VITE_PROJECT_AUTHORITY  || CONTRACT_ADDRESS;

// Oracle locations pulled from your existing solar oracle
const ORACLE_LOCATIONS = [
  { id: 1, name: "San Francisco, CA" },
  { id: 2, name: "New York City, NY" },
  { id: 3, name: "Phoenix, AZ" },
];

const STEPS = ["Connect Wallet", "Register", "KYC", "Submit Project", "Status"];

export default function InstallerPortal() {
  const { connect, disconnect, account, connected, wallets, signAndSubmitTransaction, network } = useWallet();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [balance, setBalance] = useState("0");

  // Register form
  const [name, setName] = useState("");
  const [businessReg, setBusinessReg] = useState("");

  // KYC form
  const [docsHash, setDocsHash] = useState("");
  const [locationId, setLocationId] = useState(1);

  // Project form
  const [projectName, setProjectName]       = useState("");
  const [capacityKw, setCapacityKw]         = useState("");
  const [costApt, setCostApt]               = useState("");
  const [description, setDescription]       = useState("");
  const [projectDocsHash, setProjectDocsHash] = useState("");
  const [yieldBps, setYieldBps]             = useState("800");

  const walletAddress = account?.address?.toString() || null;
  const petra = wallets?.find((w) => w.name.toLowerCase().includes("petra"));

  // Auto-advance step when wallet connects
  useEffect(() => {
    if (connected && walletAddress) {
      fetchInstallerData();
      if (step === 0) setStep(1);
    }
  }, [connected, walletAddress]);

  const fetchInstallerData = async () => {
    if (!walletAddress) return;
    try {
      const [balRes, infoRes] = await Promise.all([
        getBalance(walletAddress),
        getInstaller(walletAddress),
      ]);
      if (balRes.success && balRes.data) setBalance(balRes.data.balance_apt);
      if (infoRes.success && infoRes.data) {
        setInstallerInfo(infoRes.data);
        // Auto-advance based on on-chain state
        const info = infoRes.data;
        if (info.project_id > 0) setStep(4);
        else if (info.kyc_status === 2) setStep(3); // approved → can submit project
        else if (info.kyc_status >= 1) setStep(4);  // submitted → wait
        else setStep(2);                              // registered → do KYC
      } else {
        setStep(1); // not registered yet
      }
    } catch { /* not registered */ }
  };

  const handleConnect = async () => {
    const w = petra || wallets?.[0];
    if (!w) { window.open("https://petra.app/", "_blank"); return; }
    setLoading(true);
    try { await connect(w.name); } finally { setLoading(false); }
  };

  const submitTx = async (fn: string, args: any[]): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const tx: InputTransactionData = {
        data: { function: fn as any, functionArguments: args },
      };
      const res = await signAndSubmitTransaction(tx);
      setTxHash(res.hash);
      await new Promise((r) => setTimeout(r, 2000));
      await fetchInstallerData();
      return true;
    } catch (e: any) {
      setError(e.message || "Transaction failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Step 1 — Register
  const handleRegister = async () => {
    if (!name || !businessReg) { setError("Name and business reg are required"); return; }
    const ok = await submitTx(`${CONTRACT_ADDRESS}::installer_registry::register_installer`, [
      REGISTRY_AUTHORITY, name, businessReg,
    ]);
    if (ok) setStep(2);
  };

  // Step 2 — Submit KYC
  const handleSubmitKyc = async () => {
    if (!docsHash) { setError("IPFS documents hash is required"); return; }
    const ok = await submitTx(`${CONTRACT_ADDRESS}::installer_registry::submit_kyc`, [
      REGISTRY_AUTHORITY, docsHash, locationId,
    ]);
    if (ok) setStep(4); // waiting for admin approval
  };

  // Step 3 — Submit Project
  const handleSubmitProject = async () => {
    if (!projectName || !capacityKw || !costApt || !description) {
      setError("All project fields are required");
      return;
    }
    const costOctas = Math.floor(Number(costApt) * 100_000_000).toString();
    const ok = await submitTx(`${CONTRACT_ADDRESS}::project_listing::submit_project`, [
      PROJECT_AUTHORITY,
      projectName,
      locationId,
      Number(capacityKw),
      costOctas,
      description,
      projectDocsHash || "ipfs://",
      Number(yieldBps),
    ]);
    if (ok) setStep(4);
  };

  const kycStatusColor = (s: number) =>
    s === 2 ? "#16a34a" : s === 3 ? "#dc2626" : s === 1 ? "#d97706" : "#64748b";

  return (
    <div className="installer-portal">
      <div className="portal-bg">
        <div className="portal-orb orb-1" />
        <div className="portal-orb orb-2" />
      </div>

      <div className="portal-container">
        {/* Header */}
        <div className="portal-header">
          <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
          <h1>Solar Installer Portal</h1>
          {connected && walletAddress && (
            <div className="wallet-chip">
              <span className="chip-balance">{Number(balance).toFixed(2)} APT</span>
              <span className="chip-addr">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              <button onClick={() => { disconnect(); setStep(0); }}>✕</button>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="step-progress">
          {STEPS.map((s, i) => (
            <div key={i} className={`step-item ${i <= step ? "done" : ""} ${i === step ? "active" : ""}`}>
              <div className="step-dot">{i < step ? "✓" : i + 1}</div>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {/* Error / TX feedback */}
        {error && <div className="feedback error">⚠️ {error}</div>}
        {txHash && (
          <div className="feedback success">
            ✅ Transaction submitted!{" "}
            <a href={`https://explorer.aptoslabs.com/txn/${txHash}?network=devnet`} target="_blank" rel="noreferrer">
              View on Explorer ↗
            </a>
          </div>
        )}

        {/* ── STEP 0: Connect Wallet ── */}
        {step === 0 && (
          <div className="portal-card">
            <div className="card-icon-lg">💼</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your Petra wallet to start the installer onboarding process.</p>
            <button className="primary-btn" onClick={handleConnect} disabled={loading}>
              {loading ? "Connecting..." : "🔗 Connect Petra Wallet"}
            </button>
          </div>
        )}

        {/* ── STEP 1: Register ── */}
        {step === 1 && (
          <div className="portal-card">
            <h2>Register as Installer</h2>
            <p className="card-sub">Provide your basic business information to get started.</p>
            <div className="form-group">
              <label>Full Name / Business Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SunPower Installers Inc." />
            </div>
            <div className="form-group">
              <label>Business Registration Number</label>
              <input value={businessReg} onChange={(e) => setBusinessReg(e.target.value)} placeholder="e.g. REG-2024-001" />
            </div>
            <button className="primary-btn" onClick={handleRegister} disabled={loading}>
              {loading ? "Submitting..." : "Register on Chain →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Submit KYC ── */}
        {step === 2 && (
          <div className="portal-card">
            <h2>Submit KYC Documents</h2>
            <p className="card-sub">Upload your documents to IPFS and paste the hash below. Also select your operating region.</p>
            <div className="form-group">
              <label>IPFS Documents Hash</label>
              <input value={docsHash} onChange={(e) => setDocsHash(e.target.value)} placeholder="ipfs://Qm..." />
              <span className="hint">Upload to <a href="https://web3.storage" target="_blank" rel="noreferrer">web3.storage</a> or Pinata, paste CID here</span>
            </div>
            <div className="form-group">
              <label>Select Your Region (Oracle Location)</label>
              <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {ORACLE_LOCATIONS.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <button className="primary-btn" onClick={handleSubmitKyc} disabled={loading}>
              {loading ? "Submitting..." : "Submit KYC →"}
            </button>
          </div>
        )}

        {/* ── STEP 3: Submit Project (only after KYC approved) ── */}
        {step === 3 && (
          <div className="portal-card">
            <div className="kyc-approved-badge">✅ KYC Approved</div>
            <h2>List Your Solar Project</h2>
            <p className="card-sub">Submit your project details for admin review. Once approved, investors can fund it.</p>
            <div className="form-row">
              <div className="form-group">
                <label>Project Name</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Phoenix Solar Farm #1" />
              </div>
              <div className="form-group">
                <label>Capacity (kW)</label>
                <input type="number" value={capacityKw} onChange={(e) => setCapacityKw(e.target.value)} placeholder="e.g. 500" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Funding Goal (APT)</label>
                <input type="number" value={costApt} onChange={(e) => setCostApt(e.target.value)} placeholder="e.g. 1000" />
              </div>
              <div className="form-group">
                <label>Expected Yield (basis points, 800 = 8%)</label>
                <input type="number" value={yieldBps} onChange={(e) => setYieldBps(e.target.value)} placeholder="800" />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your project, location, timeline..." rows={4} />
            </div>
            <div className="form-group">
              <label>Project Documents IPFS Hash (optional)</label>
              <input value={projectDocsHash} onChange={(e) => setProjectDocsHash(e.target.value)} placeholder="ipfs://..." />
            </div>
            <div className="form-group">
              <label>Operating Region</label>
              <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {ORACLE_LOCATIONS.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <button className="primary-btn" onClick={handleSubmitProject} disabled={loading}>
              {loading ? "Submitting..." : "Submit Project →"}
            </button>
          </div>
        )}

        {/* ── STEP 4: Status Dashboard ── */}
        {step === 4 && installerInfo && (
          <div className="portal-card status-card">
            <h2>Your Status Dashboard</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Wallet</span>
                <span className="status-value mono">{walletAddress?.slice(0, 10)}...{walletAddress?.slice(-6)}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Name</span>
                <span className="status-value">{installerInfo.name}</span>
              </div>
              <div className="status-item">
                <span className="status-label">KYC Status</span>
                <span className="status-value" style={{ color: kycStatusColor(installerInfo.kyc_status), fontWeight: 700 }}>
                  {installerInfo.kyc_status_label}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Region</span>
                <span className="status-value">{ORACLE_LOCATIONS.find(l => l.id === installerInfo.location_id)?.name || `Location #${installerInfo.location_id}`}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Project ID</span>
                <span className="status-value">{installerInfo.project_id > 0 ? `#${installerInfo.project_id}` : "Not submitted yet"}</span>
              </div>
            </div>

            {/* Actions based on KYC status */}
            {installerInfo.kyc_status === 0 && (
              <div className="status-action pending">⏳ Registration submitted. Admin will review your KYC soon.</div>
            )}
            {installerInfo.kyc_status === 1 && (
              <div className="status-action pending">⏳ KYC documents submitted. Awaiting admin approval.</div>
            )}
            {installerInfo.kyc_status === 2 && installerInfo.project_id === 0 && (
              <button className="primary-btn" onClick={() => setStep(3)}>
                🌞 Submit Your Project →
              </button>
            )}
            {installerInfo.kyc_status === 2 && installerInfo.project_id > 0 && (
              <div className="status-action success">
                ✅ Project #{installerInfo.project_id} submitted and under admin review.
                <br />Once approved, investors can stake APT on your project.
              </div>
            )}
            {installerInfo.kyc_status === 3 && (
              <div className="status-action error">
                ❌ KYC rejected. Please contact support.
              </div>
            )}

            <button className="secondary-btn" onClick={fetchInstallerData}>🔄 Refresh Status</button>
          </div>
        )}
      </div>
    </div>
  );
}