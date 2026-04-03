'use client';
import { useNavigate } from "react-router-dom";
import "./Landing.css";
import DotGrid from './DotGrid';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <>
      <DotGrid
        dotSize={5}
        gap={15}
        baseColor="#f0fdf4"
        activeColor="#5227FF"
        proximity={120}
        shockRadius={250}
        shockStrength={5}
        resistance={750}
        returnDuration={1.5}
      />

      <div className="landing">
        <div className="landing-bg">
          <div className="landing-orb orb-1" />
          <div className="landing-orb orb-2" />
        </div>

        <div className="landing-content">
          {/* Logo */}
          <div className="landing-logo">
            <div className="logo-pill">
              <span className="logo-icon-img">🌀</span>
              <span className="logo-name">Aethera</span>
            </div>
          </div>

          {/* Hero */}
          <h1 className="landing-title">Welcome to Aethera</h1>
          <p className="landing-sub">
            The decentralized financing platform empowering solar installers and
            investors on Aptos.
          </p>

          {/* Cards */}
          <div className="landing-cards">
            {/* Solar Installer */}
            <div className="landing-card">
              <div className="card-icon blue">
                <span>💼</span>
              </div>
              <h2>Solar Installer</h2>
              <p>
                Submit your solar projects, pass KYC, and get funded by a global
                pool of investors.
              </p>
              <button
                className="card-btn green"
                onClick={() => navigate("/installer")}
              >
                Installer Portal
              </button>
            </div>

            {/* Investor */}
            <div className="landing-card">
              <div className="card-icon green">
                <span>📈</span>
              </div>
              <h2>Investor</h2>
              <p>
                Discover vetted renewable energy projects and earn yields through
                tokenized assets.
              </p>
              <button
                className="card-btn green"
                onClick={() => navigate("/invest")}
              >
                Start Investing
              </button>
            </div>

            {/* Platform Admin */}
            <div className="landing-card">
              <div className="card-icon gray">
                <span>🛡️</span>
              </div>
              <h2>Platform Admin</h2>
              <p>
                Review projects, approve KYC, mint tokens, and manage fund
                disbursement.
              </p>
              <button
                className="card-btn dark"
                onClick={() => navigate("/admin")}
              >
                Admin Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}