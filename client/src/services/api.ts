import axios from "axios";

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  throw new Error("[api.ts] VITE_API_URL is not set.");
}

const API_BASE_URL = import.meta.env.VITE_API_URL ;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
});

// ── Shared ───
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Existing types (unchanged) ────────────────────────────────────────────────
export interface VaultInfo {
  authority: string;
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
  vault_balance: string;
  vault_balance_apt: string;
}

export interface PlayerInfo {
  address: string;
  staked_amount: string;
  staked_amount_apt: string;
  stake_timestamp: number;
  lock_duration: number;
  unlock_timestamp: number;
  is_locked: boolean;
  time_remaining: number;
  pending_rewards: string;
  pending_rewards_apt: string;
}

export interface SimulationResult {
  principal_apt: string;
  estimated_reward_apt: string;
  total_return_apt: string;
  apy_rate: number;
  duration_days: number;
}

export interface BalanceInfo {
  address: string;
  balance: string;
  balance_apt: string;
}

// ── New types 
export interface InstallerInfo {
  wallet: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: number;     // 0=Pending 1=Submitted 2=Approved 3=Rejected
  kyc_status_label: string;
  location_id: number;
  project_id: number;
}

export interface ProjectInfo {
  project_id: number;
  name: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  cost_apt_human: string;
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  expected_yield_pct: string;
  installer: string;
  status: number;
  status_label: string;
}

export interface ProjectVaultInfo {
  project_id: number;
  authority: string;
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
}

export interface ProjectPlayerStake {
  player_address: string;
  project_id: number;
  staked_amount: string;
  staked_amount_apt: string;
  staked_time: number;
  lock_duration: number;
  unlock_time: number;
  is_locked: boolean;
  time_remaining: number;
  pending_rewards: string;
  pending_rewards_apt: string;
}

// ── Existing API calls (unchanged) ───────────────────────────────────────────
export const getVaultInfo = async (): Promise<ApiResponse<VaultInfo>> => {
  const r = await api.get(`/vault/info?_t=${Date.now()}`);
  return r.data;
};

export const getPlayerInfo = async (address: string): Promise<ApiResponse<PlayerInfo>> => {
  const r = await api.get(`/player/${address}?_t=${Date.now()}`);
  return r.data;
};

export const getBalance = async (address: string): Promise<ApiResponse<BalanceInfo>> => {
  const r = await api.get(`/balance/${address}?_t=${Date.now()}`);
  return r.data;
};

export const simulateStake = async (
  amount: string,
  apyRate: number,
  durationDays: number,
): Promise<ApiResponse<SimulationResult>> => {
  const r = await api.post("/staking/simulate", { amount, apy_rate: apyRate, duration_days: durationDays });
  return r.data;
};

// ── Installer API ─────────────────────────────────────────────────────────────
export const getInstaller = async (address: string): Promise<ApiResponse<InstallerInfo>> => {
  const r = await api.get(`/installer/${address}?_t=${Date.now()}`);
  return r.data;
};

// ── Project API ───────────────────────────────────────────────────────────────
export const getProjectsByLocation = async (locationId: number): Promise<ApiResponse<{ location_id: number; projects: ProjectInfo[]; total: number }>> => {
  const r = await api.get(`/project/location/${locationId}?_t=${Date.now()}`);
  return r.data;
};

export const getProject = async (projectId: number): Promise<ApiResponse<ProjectInfo>> => {
  const r = await api.get(`/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Staking API ───────────────────────────────────────────────────────────────
export const getProjectVault = async (projectId: number): Promise<ApiResponse<ProjectVaultInfo>> => {
  const r = await api.get(`/staking/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

export const getPlayerProjectStake = async (address: string, projectId: number): Promise<ApiResponse<ProjectPlayerStake>> => {
  const r = await api.get(`/staking/player/${address}/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Admin API 
export const adminApproveKyc = async (installerAddress: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/kyc/approve", { installer_address: installerAddress });
  return r.data;
};

export const adminRejectKyc = async (installerAddress: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/kyc/reject", { installer_address: installerAddress });
  return r.data;
};

export const adminApproveProject = async (projectId: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/project/approve", { project_id: projectId });
  return r.data;
};

export const adminRejectProject = async (projectId: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/project/reject", { project_id: projectId });
  return r.data;
};

export const adminCreateVault = async (projectId: number, apyRate: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/create", { project_id: projectId, apy_rate: apyRate });
  return r.data;
};

export const adminDepositRewards = async (projectId: number, amount: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/deposit", { project_id: projectId, amount });
  return r.data;
};

export const adminUpdateConfig = async (projectId: number, newApyRate: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/config", { project_id: projectId, new_apy_rate: newApyRate });
  return r.data;
};

// ── Helpers ──
export const formatApt = (octas: string | number): string => {
  return (Number(octas) / 100_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

export const aptToOctas = (apt: number): string =>
  Math.floor(apt * 100_000_000).toString();

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return "Unlocked";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp * 1000).toLocaleString();

export default api;