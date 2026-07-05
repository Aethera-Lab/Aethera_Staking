import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProjectsByLocation, type ProjectInfo } from "../../services/api";
import "./Projects.css";

const LOCATION_NAMES: Record<number, string> = {
  1: "San Francisco, CA",
  2: "New York City, NY",
  3: "Phoenix, AZ",
};

export default function Projects() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const locId = Number(locationId);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await getProjectsByLocation(locId);
        if (res.success && res.data) setProjects(res.data.projects);
        else setError(res.error || "Failed to load projects");
      } catch {
        setError("Failed to connect to API");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [locId]);

  return (
    <div className="projects-page">
      <header className="projects-header">
        <button className="back-btn" onClick={() => navigate("/invest")}>← Locations</button>
        <div>
          <h1>Projects in {LOCATION_NAMES[locId] || `Location #${locId}`}</h1>
          <p>Vetted solar projects available for investment</p>
        </div>
      </header>

      <div className="projects-content">
        {loading && <div className="state-msg">Loading projects...</div>}
        {error   && <div className="state-msg error">{error}</div>}

        {!loading && !error && projects.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🌞</span>
            <h3>No approved projects yet</h3>
            <p>Projects for this location are pending admin review. Check back soon.</p>
            <button className="back-btn" onClick={() => navigate("/invest")}>← Back to Locations</button>
          </div>
        )}

        <div className="projects-grid">
          {projects.map((p) => (
            <div key={p.project_id} className="project-card">
              <div className="project-card-header">
                <div>
                  <span className="project-id">#{p.project_id}</span>
                  <h2>{p.name}</h2>
                </div>
                <span className="yield-badge">{p.expected_yield_pct} APY</span>
              </div>

              <p className="project-desc">{p.description}</p>

              <div className="project-metrics">
                <div className="pm-item">
                  <span className="pm-label">Capacity</span>
                  <span className="pm-value">{p.capacity_kw} kW</span>
                </div>
                <div className="pm-item">
                  <span className="pm-label">Funding Goal</span>
                  <span className="pm-value">{p.cost_apt_human}</span>
                </div>
                <div className="pm-item">
                  <span className="pm-label">Installer</span>
                  <span className="pm-value mono">{p.installer.slice(0, 8)}...{p.installer.slice(-4)}</span>
                </div>
                <div className="pm-item">
                  <span className="pm-label">Status</span>
                  <span className="pm-value green">✅ {p.status_label}</span>
                </div>
              </div>

              <button
                className="invest-btn"
                onClick={() => navigate(`/invest/project/${p.project_id}`)}
              >
                💰 Stake APT on This Project →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}