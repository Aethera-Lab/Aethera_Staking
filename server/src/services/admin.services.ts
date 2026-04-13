import { Account } from '@aptos-labs/ts-sdk';
import { aptos, CONTRACT_CONFIG } from '../config/aptos.config';
import { installerService } from './installer.services';
import { projectService } from './project.services';
import { stakingService } from './staking.services';
import { registrationTracker } from './registration-tracker';
import { TransactionResponse } from '../models/types';

// Admin service is a thin orchestrator — it delegates to the
// individual services so there's no duplicated contract logic.

export class AdminService {

  // ── KYC Submissions ────────────────────────────────────────────────────────

  /**
   * Get all KYC submissions (installers with SUBMITTED or PENDING status)
   * Falls back to in-memory tracker if on-chain registry not initialized
   */
  async getKycSubmissions(): Promise<any[]> {
    const submissions: any[] = [];
    const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::InstallerRegistry` as `${string}::${string}::${string}`;
    
    try {
      console.log(`[getKycSubmissions] Querying resource: ${resourceType}`);
      console.log(`[getKycSubmissions] From address: ${CONTRACT_CONFIG.REGISTRY_AUTHORITY}`);
      
      const resource = await aptos.getAccountResource({
        accountAddress: CONTRACT_CONFIG.REGISTRY_AUTHORITY,
        resourceType,
      });

      console.log(`[getKycSubmissions] Got resource:`, resource);

      const data = (resource as any).data || resource;
      const entries: any[] = data?.installers?.data || [];

      console.log(`[getKycSubmissions] Found ${entries.length} entries`);

      for (const entry of entries) {
        const v = entry.value;
        const kyc_status = Number(v.kyc_status);
        
        // Include submissions that are either PENDING (0) or SUBMITTED (1)
        if (kyc_status === 0 || kyc_status === 1) {
          submissions.push({
            wallet: v.wallet,
            name: v.name,
            business_reg: v.business_reg,
            documents_hash: v.documents_hash,
            kyc_status,
            kyc_status_label: ['Pending', 'Submitted', 'Approved', 'Rejected'][kyc_status] || 'Unknown',
            location_id: Number(v.location_id),
            project_id: Number(v.project_id),
          });
        }
      }
    } catch (error: any) {
      console.error('[getKycSubmissions] Error:', error.message || error);
      console.log('[getKycSubmissions] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const trackedSubmissions = registrationTracker.getPendingKycSubmissions();
      for (const installer of trackedSubmissions) {
        submissions.push({
          wallet: installer.wallet_address,
          name: installer.name,
          business_reg: installer.business_reg,
          documents_hash: installer.documents_hash,
          kyc_status: installer.kyc_status,
          kyc_status_label: ['Pending', 'Submitted', 'Approved', 'Rejected'][installer.kyc_status] || 'Unknown',
          location_id: installer.location_id,
          project_id: installer.project_id,
        });
      }
    }

    return submissions;
  }

  /**
   * Get all projects awaiting approval (status = PENDING = 0)
   * Falls back to in-memory tracker if on-chain registry not initialized
   */
  async getPendingProjects(): Promise<any[]> {
    const pending: any[] = [];
    const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::ProjectRegistry` as `${string}::${string}::${string}`;
    
    try {
      console.log(`[getPendingProjects] Querying resource: ${resourceType}`);
      console.log(`[getPendingProjects] From address: ${CONTRACT_CONFIG.PROJECT_AUTHORITY}`);
      
      const resource = await aptos.getAccountResource({
        accountAddress: CONTRACT_CONFIG.PROJECT_AUTHORITY,
        resourceType,
      });

      console.log(`[getPendingProjects] Got resource:`, resource);

      const data = (resource as any).data || resource;
      const entries: any[] = data?.projects?.data || [];

      console.log(`[getPendingProjects] Found ${entries.length} entries`);

      for (const entry of entries) {
        const v = entry.value;
        const status = Number(v.status);
        
        // Include only PENDING projects (status = 0)
        if (status === 0) {
          pending.push({
            project_id: Number(entry.key),
            name: v.name,
            location_id: Number(v.location_id),
            capacity_kw: Number(v.capacity_kw),
            cost_apt: v.cost_apt.toString(),
            description: v.description,
            documents_hash: v.documents_hash,
            expected_yield_bps: Number(v.expected_yield_bps),
            installer: v.installer,
            status,
            status_label: 'Pending',
          });
        }
      }
    } catch (error: any) {
      console.error('[getPendingProjects] Error:', error.message || error);
      console.log('[getPendingProjects] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const trackedProjects = registrationTracker.getPendingProjects();
      for (const project of trackedProjects) {
        pending.push({
          project_id: project.project_id,
          name: project.name,
          location_id: project.location_id,
          capacity_kw: project.capacity_kw,
          cost_apt: project.cost_apt,
          description: project.description,
          documents_hash: project.documents_hash,
          expected_yield_bps: project.expected_yield_bps,
          installer: project.installer,
          status: project.status,
          status_label: 'Pending',
        });
      }
    }

    return pending;
  }

  // ── KYC Actions ────────────────────────────────────────────────────────────

  async approveKyc(adminAccount: Account, installerAddress: string): Promise<TransactionResponse> {
    try {
      // Try on-chain first
      return await installerService.approveKyc(adminAccount, installerAddress);
    } catch (error: any) {
      console.error('[approveKyc] On-chain failed:', error.message);
      console.log('[approveKyc] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const success = registrationTracker.approveKyc(installerAddress);
      if (success) {
        return {
          success: true,
          message: `KYC approved for ${installerAddress} (via tracker)`,
          transaction_hash: 'tracker_' + Date.now().toString(),
        };
      } else {
        throw new Error(`Installer ${installerAddress} not found in tracker`);
      }
    }
  }

  async rejectKyc(adminAccount: Account, installerAddress: string): Promise<TransactionResponse> {
    try {
      // Try on-chain first
      return await installerService.rejectKyc(adminAccount, installerAddress);
    } catch (error: any) {
      console.error('[rejectKyc] On-chain failed:', error.message);
      console.log('[rejectKyc] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const success = registrationTracker.rejectKyc(installerAddress);
      if (success) {
        return {
          success: true,
          message: `KYC rejected for ${installerAddress} (via tracker)`,
          transaction_hash: 'tracker_' + Date.now().toString(),
        };
      } else {
        throw new Error(`Installer ${installerAddress} not found in tracker`);
      }
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async approveProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      // Try on-chain first
      return await projectService.approveProject(adminAccount, projectId);
    } catch (error: any) {
      console.error('[approveProject] On-chain failed:', error.message);
      console.log('[approveProject] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const success = registrationTracker.approveProject(projectId);
      if (success) {
        return {
          success: true,
          message: `Project ${projectId} approved (via tracker)`,
          transaction_hash: 'tracker_' + Date.now().toString(),
        };
      } else {
        throw new Error(`Project ${projectId} not found in tracker`);
      }
    }
  }

  async rejectProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      // Try on-chain first
      return await projectService.rejectProject(adminAccount, projectId);
    } catch (error: any) {
      console.error('[rejectProject] On-chain failed:', error.message);
      console.log('[rejectProject] Falling back to in-memory tracker...');
      
      // Use in-memory tracker as fallback
      const success = registrationTracker.rejectProject(projectId);
      if (success) {
        return {
          success: true,
          message: `Project ${projectId} rejected (via tracker)`,
          transaction_hash: 'tracker_' + Date.now().toString(),
        };
      } else {
        throw new Error(`Project ${projectId} not found in tracker`);
      }
    }
  }

  // ── Vaults ─────────────────────────────────────────────────────────────────

  async createVault(adminAccount: Account, projectId: number, apyRate: number): Promise<TransactionResponse> {
    return stakingService.createProjectVault(adminAccount, projectId, apyRate);
  }

  async depositRewards(adminAccount: Account, projectId: number, amount: string): Promise<TransactionResponse> {
    return stakingService.depositRewards(adminAccount, projectId, amount);
  }

  async withdraw(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    return stakingService.withdraw(adminAccount, projectId);
  }

  async updateConfig(adminAccount: Account, projectId: number, newApyRate: number): Promise<TransactionResponse> {
    return stakingService.updateApyRate(adminAccount, projectId, newApyRate);
  }
}

export const adminService = new AdminService();