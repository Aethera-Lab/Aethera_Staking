/**
 * Persistent registration tracker
 * Stores installer registrations and KYC submissions in a JSON file
 * Data persists across server restarts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrackedInstaller {
  wallet_address: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: number; // 0=pending, 1=submitted, 2=approved, 3=rejected
  location_id: number;
  project_id: number;
  registered_at: number;
  kyc_submitted_at?: number;
}

interface TrackedProject {
  project_id: number;
  name: string;
  installer: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  status: number; // 0=pending, 1=approved, 2=rejected
  submitted_at: number;
}

interface TrackerData {
  installers: Record<string, TrackedInstaller>;
  projects: Record<number, TrackedProject>;
  nextProjectId: number;
}

const DATA_FILE = path.join(__dirname, '../../data/tracker.json');

class RegistrationTracker {
  private installers: Map<string, TrackedInstaller> = new Map();
  private projects: Map<number, TrackedProject> = new Map();
  private nextProjectId: number = 1;

  constructor() {
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data: TrackerData = JSON.parse(raw);
        
        // Load installers
        for (const [key, value] of Object.entries(data.installers || {})) {
          this.installers.set(key, value);
        }
        
        // Load projects
        for (const [key, value] of Object.entries(data.projects || {})) {
          this.projects.set(Number(key), value);
        }
        
        this.nextProjectId = data.nextProjectId || 1;
        
        console.log(`[RegistrationTracker] Loaded ${this.installers.size} installers, ${this.projects.size} projects from disk`);
      } else {
        console.log(`[RegistrationTracker] No existing data file, starting fresh`);
      }
    } catch (error) {
      console.error('[RegistrationTracker] Error loading data:', error);
    }
  }

  private saveToFile(): void {
    try {
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data: TrackerData = {
        installers: Object.fromEntries(this.installers),
        projects: Object.fromEntries(this.projects),
        nextProjectId: this.nextProjectId,
      };
      
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`[RegistrationTracker] Saved to disk`);
    } catch (error) {
      console.error('[RegistrationTracker] Error saving data:', error);
    }
  }

  /**
   * Register a new installer
   */
  registerInstaller(
    walletAddress: string,
    name: string,
    businessReg: string,
  ): boolean {
    const normalized = walletAddress.toLowerCase();
    
    if (this.installers.has(normalized)) {
      console.log(`[RegistrationTracker] Installer already registered: ${normalized}`);
      return false;
    }

    const installer: TrackedInstaller = {
      wallet_address: normalized,
      name,
      business_reg: businessReg,
      documents_hash: "",
      kyc_status: 0, // PENDING
      location_id: 0,
      project_id: 0,
      registered_at: Date.now(),
    };

    this.installers.set(normalized, installer);
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ Registered: ${normalized}`);
    return true;
  }

  /**
   * Mark a wallet as registered (from on-chain E_ALREADY_REGISTERED error)
   * Creates a minimal record so we know they're registered
   */
  markAsRegistered(walletAddress: string): void {
    const normalized = walletAddress.toLowerCase();
    
    if (this.installers.has(normalized)) {
      console.log(`[RegistrationTracker] Already tracking: ${normalized}`);
      return;
    }

    const installer: TrackedInstaller = {
      wallet_address: normalized,
      name: "Unknown (on-chain)",
      business_reg: "Unknown",
      documents_hash: "",
      kyc_status: 0, // PENDING - we don't know real status yet
      location_id: 0,
      project_id: 0,
      registered_at: Date.now(),
    };

    this.installers.set(normalized, installer);
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ Marked as registered (from on-chain): ${normalized}`);
  }

  /**
   * Get installer by wallet address
   */
  getInstaller(walletAddress: string): TrackedInstaller | null {
    return this.installers.get(walletAddress.toLowerCase()) || null;
  }

  /**
   * Submit KYC for an installer
   */
  submitKyc(
    walletAddress: string,
    docsHash: string,
    locationId: number,
  ): boolean {
    const normalized = walletAddress.toLowerCase();
    let installer = this.installers.get(normalized);

    // If installer not found, create a record (they may have registered on-chain)
    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found, creating record: ${normalized}`);
      installer = {
        wallet_address: normalized,
        name: "Unknown (on-chain)",
        business_reg: "Unknown",
        documents_hash: "",
        kyc_status: 0,
        location_id: 0,
        project_id: 0,
        registered_at: Date.now(),
      };
      this.installers.set(normalized, installer);
    }

    installer.documents_hash = docsHash;
    installer.location_id = locationId;
    installer.kyc_status = 1; // SUBMITTED
    installer.kyc_submitted_at = Date.now();
    
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ KYC submitted: ${normalized}`);
    return true;
  }

  /**
   * Approve installer KYC
   */
  approveKyc(walletAddress: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const installer = this.installers.get(normalized);

    if (!installer) return false;

    installer.kyc_status = 2; // APPROVED
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ KYC approved: ${normalized}`);
    return true;
  }

  /**
   * Reject installer KYC
   */
  rejectKyc(walletAddress: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const installer = this.installers.get(normalized);

    if (!installer) return false;

    installer.kyc_status = 3; // REJECTED
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ KYC rejected: ${normalized}`);
    return true;
  }

  /**
   * Submit a project
   */
  submitProject(
    installerAddress: string,
    name: string,
    locationId: number,
    capacityKw: number,
    costApt: string,
    description: string,
    docsHash: string,
    yieldBps: number,
  ): number {
    const normalized = installerAddress.toLowerCase();
    let installer = this.installers.get(normalized);

    // If installer not found, create a record (they may have registered on-chain)
    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found, creating record for project: ${normalized}`);
      installer = {
        wallet_address: normalized,
        name: "Unknown (on-chain)",
        business_reg: "Unknown",
        documents_hash: "",
        kyc_status: 2, // Must be approved if submitting project
        location_id: locationId,
        project_id: 0,
        registered_at: Date.now(),
      };
      this.installers.set(normalized, installer);
    }

    const projectId = this.nextProjectId++;
    const project: TrackedProject = {
      project_id: projectId,
      name,
      installer: normalized,
      location_id: locationId,
      capacity_kw: capacityKw,
      cost_apt: costApt,
      description,
      documents_hash: docsHash,
      expected_yield_bps: yieldBps,
      status: 0, // PENDING
      submitted_at: Date.now(),
    };

    this.projects.set(projectId, project);
    installer.project_id = projectId;
    
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ Project submitted: ID ${projectId} by ${normalized}`);
    return projectId;
  }

  /**
   * Get all pending KYC submissions
   */
  getPendingKycSubmissions(): TrackedInstaller[] {
    const pending: TrackedInstaller[] = [];
    
    for (const installer of this.installers.values()) {
      if (installer.kyc_status === 0 || installer.kyc_status === 1) {
        pending.push(installer);
      }
    }

    return pending;
  }

  /**
   * Get all pending projects
   */
  getPendingProjects(): TrackedProject[] {
    const pending: TrackedProject[] = [];

    for (const project of this.projects.values()) {
      if (project.status === 0) {
        pending.push(project);
      }
    }

    return pending;
  }

  /**
   * Approve a project
   */
  approveProject(projectId: number): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.status = 1; // APPROVED
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ Project approved: ID ${projectId}`);
    return true;
  }

  /**
   * Reject a project
   */
  rejectProject(projectId: number): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.status = 2; // REJECTED
    this.saveToFile();
    console.log(`[RegistrationTracker] ✅ Project rejected: ID ${projectId}`);
    return true;
  }

  /**
   * Get project by ID
   */
  getProject(projectId: number): TrackedProject | null {
    return this.projects.get(projectId) || null;
  }

  /**
   * Debug: Show all registered installers
   */
  getAllInstallers(): TrackedInstaller[] {
    return Array.from(this.installers.values());
  }

  /**
   * Debug: Show all projects
   */
  getAllProjects(): TrackedProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get approved projects by location
   */
  getApprovedProjectsByLocation(locationId: number): TrackedProject[] {
    const approved: TrackedProject[] = [];
    
    for (const project of this.projects.values()) {
      if (project.status === 1 && project.location_id === locationId) {
        approved.push(project);
      }
    }

    return approved;
  }

  /**
   * Get all approved projects
   */
  getAllApprovedProjects(): TrackedProject[] {
    const approved: TrackedProject[] = [];
    
    for (const project of this.projects.values()) {
      if (project.status === 1) {
        approved.push(project);
      }
    }

    return approved;
  }
}

export const registrationTracker = new RegistrationTracker();
