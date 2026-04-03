import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "aethera-admin-2024";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600)); // UX delay
    if (!email || !password) { setError("Email and password are required"); setLoading(false); return; }
    if (password !== ADMIN_PASSWORD) { setError("Invalid credentials"); setLoading(false); return; }
    localStorage.setItem("aethera_admin", "true");
    navigate("/admin/dashboard");
    setLoading(false);
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-logo">🛡️</div>
        <h1>Platform Admin</h1>
        <p>Sign in to manage KYC, projects, and vaults</p>
        <form onSubmit={handleLogin} className="admin-form">
          <div className="admin-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@aethera.io" autoComplete="email" />
          </div>
          <div className="admin-field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <div className="admin-error">⚠️ {error}</div>}
          <button type="submit" className="admin-submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
        <button className="admin-back" onClick={() => navigate("/")}>← Back to Home</button>
      </div>
    </div>
  );
}