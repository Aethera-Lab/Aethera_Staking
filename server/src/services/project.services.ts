import { aptos, PROJECT_FUNCTIONS, CONTRACT_CONFIG, formatApt, bpsToPercent } from '../config/aptos.config';
import { Account } from '@aptos-labs/ts-sdk';
import { ProjectInfo, ProjectStatus, TransactionResponse } from '../models/types';

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
   */
  async getProjectsByLocation(locationId: number, onlyApproved = true): Promise<ProjectInfo[]> {
    try {
      const all = await fetchAllProjects();
      return all.filter(
        (p) => p.location_id === locationId && (!onlyApproved || p.status === ProjectStatus.APPROVED)
      );
    } catch (error: any) {
      console.error('Error fetching projects by location:', error.message || error);
      return [];
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: number): Promise<ProjectInfo | null> {
    try {
      const all = await fetchAllProjects();
      return all.find((p) => p.project_id === projectId) || null;
    } catch (error: any) {
      console.error('Error fetching project:', error.message || error);
      return null;
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
}

export const projectService = new ProjectService();