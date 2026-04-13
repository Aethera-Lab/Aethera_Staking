/**
 * Temporary in-memory registration tracker
 * Stores installer registrations and KYC submissions until on-chain registry is initialized
 * Once ADMIN_PRIVATE_KEY is provided, this data can be migrated to blockchain
 */

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

class RegistrationTracker {
  private installers: Map<string, TrackedInstaller> = new Map();
  private projects: Map<number, TrackedProject> = new Map();
  private nextProjectId: number = 1;

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
    console.log(`[RegistrationTracker] ✅ Registered: ${normalized}`);
    return true;
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
    const installer = this.installers.get(normalized);

    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found: ${normalized}`);
      return false;
    }

    if (installer.kyc_status !== 0) {
      console.log(`[RegistrationTracker] KYC already submitted for: ${normalized}`);
      return false;
    }

    installer.documents_hash = docsHash;
    installer.location_id = locationId;
    installer.kyc_status = 1; // SUBMITTED
    installer.kyc_submitted_at = Date.now();
    
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
    const installer = this.installers.get(normalized);

    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found: ${normalized}`);
      return 0;
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
}

export const registrationTracker = new RegistrationTracker();
