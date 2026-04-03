import { Account } from '@aptos-labs/ts-sdk';
import { installerService } from './installer.services';
import { projectService } from './project.services';
import { stakingService } from './staking.services';
import { TransactionResponse } from '../models/types';

// Admin service is a thin orchestrator — it delegates to the
// individual services so there's no duplicated contract logic.

export class AdminService {

  // ── KYC ────────────────────────────────────────────────────────────────────

  async approveKyc(adminAccount: Account, installerAddress: string): Promise<TransactionResponse> {
    return installerService.approveKyc(adminAccount, installerAddress);
  }

  async rejectKyc(adminAccount: Account, installerAddress: string): Promise<TransactionResponse> {
    return installerService.rejectKyc(adminAccount, installerAddress);
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async approveProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    return projectService.approveProject(adminAccount, projectId);
  }

  async rejectProject(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    return projectService.rejectProject(adminAccount, projectId);
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