import { aptos, PROJECT_FUNCTIONS, CONTRACT_CONFIG, formatApt, bpsToPercent } from '../config/aptos.config';
import { Account } from '@aptos-labs/ts-sdk';
import { ProjectInfo, ProjectStatus, TransactionResponse } from '../models/types';
import { registrationTracker } from './registration-tracker';

const statusLabel = (status: number): string => {
  switch (status) {
    case ProjectStatus.PENDING:  return 'Pending';
    case ProjectStatus.APPROVED: return 'Approved';
    case ProjectStatus.REJECTED: return 'Rejected';
    default:                     return 'Unknown';
  }
};

// Reads all projects from the on-chain ProjectRegistry SimpleMap
const fetchAllProjects = async (): Promise<ProjectInfo[]> => {
  const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::ProjectRegistry` as `${string}::${string}::${string}`;

  const resource = await aptos.getAccountResource({
    accountAddress: CONTRACT_CONFIG.PROJECT_AUTHORITY,
    resourceType,
  });

  const data = (resource as any).data || resource;
  const entries: any[] = data?.projects?.data || [];

  return entries.map((e: any) => {
    const v = e.value;
    return {
      project_id:          Number(e.key),
      name:                v.name,
      location_id:         Number(v.location_id),
      capacity_kw:         Number(v.capacity_kw),
      cost_apt:            v.cost_apt.toString(),
      cost_apt_human:      `${formatApt(v.cost_apt)} APT`,
      description:         v.description,
      documents_hash:      v.documents_hash,
      expected_yield_bps:  Number(v.expected_yield_bps),
      expected_yield_pct:  bpsToPercent(Number(v.expected_yield_bps)),
      installer:           v.installer,
      status:              Number(v.status) as ProjectStatus,
      status_label:        statusLabel(Number(v.status)),
    };
  });
};

export class ProjectService {

  /**
   * Get all projects for a specific oracle location (only APPROVED ones for investors)
   * Falls back to tracker if on-chain registry not accessible
   */
  async getProjectsByLocation(locationId: number, onlyApproved = true): Promise<ProjectInfo[]> {
    try {
      const all = await fetchAllProjects();
      return all.filter(
        (p) => p.location_id === locationId && (!onlyApproved || p.status === ProjectStatus.APPROVED)
      );
    } catch (error: any) {
      console.error('[getProjectsByLocation] On-chain fetch failed, using tracker:', error.message);
      
      // Fallback to tracker
      const allProjects = registrationTracker.getAllProjects();
      const filtered = allProjects.filter(p => {
        const matchLocation = p.location_id === locationId;
        const matchStatus = !onlyApproved || p.status === 1; // 1 = APPROVED in tracker
        return matchLocation && matchStatus;
      });
      
      console.log(`[getProjectsByLocation] Tracker has ${filtered.length} projects for location ${locationId}`);
      
      return filtered.map(p => ({
        project_id:          p.project_id,
        name:                p.name,
        location_id:         p.location_id,
        capacity_kw:         p.capacity_kw,
        cost_apt:            p.cost_apt,
        cost_apt_human:      `${formatApt(p.cost_apt)} APT`,
        description:         p.description,
        documents_hash:      p.documents_hash,
        expected_yield_bps:  p.expected_yield_bps,
        expected_yield_pct:  bpsToPercent(p.expected_yield_bps),
        installer:           p.installer,
        status:              p.status as ProjectStatus,
        status_label:        statusLabel(p.status),
      }));
    }
  }

  /**
   * Get a single project by ID
   * Falls back to tracker if on-chain registry not accessible
   */
  async getProject(projectId: number): Promise<ProjectInfo | null> {
    try {
      const all = await fetchAllProjects();
      return all.find((p) => p.project_id === projectId) || null;
    } catch (error: any) {
      console.error('[getProject] On-chain fetch failed, using tracker:', error.message);
      
      // Fallback to tracker
      const project = registrationTracker.getProject(projectId);
      if (!project) return null;
      
      return {
        project_id:          project.project_id,
        name:                project.name,
        location_id:         project.location_id,
        capacity_kw:         project.capacity_kw,
        cost_apt:            project.cost_apt,
        cost_apt_human:      `${formatApt(project.cost_apt)} APT`,
        description:         project.description,
        documents_hash:      project.documents_hash,
        expected_yield_bps:  project.expected_yield_bps,
        expected_yield_pct:  bpsToPercent(project.expected_yield_bps),
        installer:           project.installer,
        status:              project.status as ProjectStatus,
        status_label:        statusLabel(project.status),
      };
    }
  }

  /**
   * Installer submits a project — must be KYC approved on-chain
   * POST /api/project/submit
   */
  async submitProject(
    installerAccount: Account,
    name: string,
    locationId: number,
    capacityKw: number,
    costApt: string,
    description: string,
    documentsHash: string,
    expectedYieldBps: number,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: installerAccount.accountAddress,
        data: {
          function: PROJECT_FUNCTIONS.SUBMIT_PROJECT as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.PROJECT_AUTHORITY,
            name,
            locationId,
            capacityKw,
            costApt,
            description,
            documentsHash,
            expectedYieldBps,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: installerAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Project submitted — awaiting admin review',
      };
    } catch (error: any) {
      console.error('Error submitting project:', error);
      return { success: false, error: error.message || 'Project submission failed' };
    }
  }

  /**
   * Admin — approve project
   */
  async approveProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: PROJECT_FUNCTIONS.APPROVE_PROJECT as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.PROJECT_AUTHORITY, projectId],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Project approved — now visible to investors',
      };
    } catch (error: any) {
      console.error('Error approving project:', error);
      return { success: false, error: error.message || 'Project approval failed' };
    }
  }

  /**
   * Admin — reject project
   */
  async rejectProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: PROJECT_FUNCTIONS.REJECT_PROJECT as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.PROJECT_AUTHORITY, projectId],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Project rejected',
      };
    } catch (error: any) {
      console.error('Error rejecting project:', error);
      return { success: false, error: error.message || 'Project rejection failed' };
    }
  }

  /**
   * Initialize the ProjectRegistry on-chain (if not already initialized)
   * This must be called once before any projects can be submitted
   */
  async initializeRegistry(): Promise<boolean> {
    try {
      console.log('[ProjectService.initializeRegistry] Checking if registry is already initialized...');
      
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::ProjectRegistry` as `${string}::${string}::${string}`;

      try {
        const resource = await aptos.getAccountResource({
          accountAddress: CONTRACT_CONFIG.PROJECT_AUTHORITY,
          resourceType,
        });
        
        if (resource) {
          console.log('[ProjectService.initializeRegistry] Registry already initialized');
          return true;
        }
      } catch (e: any) {
        if (e.status !== 404) throw e;
        // 404 means registry doesn't exist, so we need to initialize
      }

      console.log('[ProjectService.initializeRegistry] Registry not found, initializing...');
      
      // Get the admin account from ADMIN_PRIVATE_KEY
      const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        console.error('[ProjectService.initializeRegistry] ADMIN_PRIVATE_KEY not set');
        return false;
      }

      const { Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
      const adminAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(adminPrivateKey),
      });

      // Call initialize function
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: PROJECT_FUNCTIONS.INITIALIZE as `${string}::${string}::${string}`,
          functionArguments: [],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      
      // Wait for transaction to complete
      const executed = await aptos.waitForTransaction({ transactionHash: committed.hash });
      console.log('[ProjectService.initializeRegistry] Transaction executed:', executed.success);

      console.log('[ProjectService.initializeRegistry] ✅ Registry initialized! TX:', committed.hash);
      return true;
    } catch (error: any) {
      console.error('[ProjectService.initializeRegistry] Error:', error);
      return false;
    }
  }
}

export const projectService = new ProjectService();