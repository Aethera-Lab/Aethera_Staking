import { aptos, MODULE_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG, formatApt, CONSTANTS } from '../config/aptos.config';
import { Account } from '@aptos-labs/ts-sdk';
import { VaultInfo, PlayerInfo, TransactionResponse, StakingStats, ProjectVaultInfo, ProjectPlayerStake } from '../models/types';

export class StakingService {

  // ── Per-Project Vault (new) ─────────────────────────────────────────────────

  /**
   * Get vault info for a specific project from StakingHub SimpleMap
   */
  async getProjectVaultInfo(projectId: number): Promise<ProjectVaultInfo | null> {
    try {
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::StakingHub` as `${string}::${string}::${string}`;

      console.log('[getProjectVaultInfo] Fetching StakingHub from:', CONTRACT_CONFIG.HUB_AUTHORITY);
      console.log('[getProjectVaultInfo] Resource type:', resourceType);

      const resource = await aptos.getAccountResource({
        accountAddress: CONTRACT_CONFIG.HUB_AUTHORITY,
        resourceType,
      });

      console.log('[getProjectVaultInfo] Resource fetched:', JSON.stringify(resource, null, 2).slice(0, 500));

      const data    = (resource as any).data || resource;
      const entries: any[] = data?.vaults?.data || [];
      console.log('[getProjectVaultInfo] Vault entries:', entries.length);
      
      const entry   = entries.find((e: any) => Number(e.key) === projectId);

      if (!entry) {
        console.log('[getProjectVaultInfo] No vault found for project:', projectId);
        return null;
      }

      const v = entry.value;
      console.log('[getProjectVaultInfo] Found vault:', v);
      return {
        project_id:       projectId,
        authority:        v.authority,
        total_staked:     v.staked_amount?.toString() || '0',
        total_staked_apt: formatApt(v.staked_amount || 0),
        apy_rate:         Number(v.apy_rate),
      };
    } catch (error: any) {
      console.error('[getProjectVaultInfo] Error:', error.message || error);
      if (error.status === 404) return null;
      return null;
    }
  }
 
  /**
   * Get a player's stake in a specific project from PlayerHub SimpleMap
   */
  async getProjectPlayerStake(playerAddress: string, projectId: number): Promise<ProjectPlayerStake | null> {
    try {
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::PlayerHub` as `${string}::${string}::${string}`;

      const resource = await aptos.getAccountResource({
        accountAddress: playerAddress,
        resourceType,
      });

      const data    = (resource as any).data || resource;
      const entries: any[] = data?.stakes?.data || [];
      const entry   = entries.find((e: any) => Number(e.key) === projectId);

      if (!entry) return null;

      const v           = entry.value;
      const currentTime = Math.floor(Date.now() / 1000);
      const stakedTime  = Number(v.staked_time);
      const duration    = Number(v.duration_time);
      const unlockTime  = stakedTime + duration;
      const timeRemaining = Math.max(0, unlockTime - currentTime);

      // Get APY to calculate pending rewards
      const vault = await this.getProjectVaultInfo(projectId);
      const elapsed = currentTime - Number(v.reward_time);
      const stakedAmount = v.staked_amount?.toString() || '0';
      const pendingRewards = vault
        ? Math.floor(Number(stakedAmount) * vault.apy_rate * elapsed / (CONSTANTS.SECONDS_PER_YEAR * 100)).toString()
        : '0';

      return {
        player_address:     playerAddress,
        project_id:         projectId,
        staked_amount:      stakedAmount,
        staked_amount_apt:  formatApt(stakedAmount),
        staked_time:        stakedTime,
        lock_duration:      duration,
        unlock_time:        unlockTime,
        is_locked:          currentTime < unlockTime,
        time_remaining:     timeRemaining,
        pending_rewards:    pendingRewards,
        pending_rewards_apt: formatApt(pendingRewards),
      };
    } catch (error: any) {
      if (error.status === 404) return null;
      console.error('Error fetching player stake:', error.message || error);
      return null;
    }
  }

  /**
   * Admin — create staking vault for an approved project
   */
  async createProjectVault(adminAccount: Account, projectId: number, apyRate: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.CREATE_PROJECT_VAULT as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, apyRate],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Project vault created — investors can now stake',
      };
    } catch (error: any) {
      console.error('Error creating vault:', error);
      return { success: false, error: error.message || 'Vault creation failed' };
    }
  }

  /**
   * Investor — stake APT on a specific project
   */
  async stake(userAccount: Account, projectId: number, amount: string, durationSeconds: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.SOL_STAKE as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, amount, durationSeconds],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: userAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Staking successful',
      };
    } catch (error: any) {
      console.error('Error staking:', error);
      return { success: false, error: error.message || 'Staking failed' };
    }
  }

  /**
   * Investor — unstake from a specific project
   */
  async unstake(userAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.SOL_UNSTAKE as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: userAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Unstaking successful',
      };
    } catch (error: any) {
      console.error('Error unstaking:', error);
      return { success: false, error: error.message || 'Unstaking failed' };
    }
  }

  /**
   * Investor — claim rewards from a specific project
   */
  async claimRewards(userAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.CLAIM_REWARDS as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: userAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Rewards claimed successfully',
      };
    } catch (error: any) {
      console.error('Error claiming rewards:', error);
      return { success: false, error: error.message || 'Claim failed' };
    }
  }

  /**
   * Admin — deposit reward APT into a project vault
   */
  async depositRewards(adminAccount: Account, projectId: number, amount: string): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.DEPOSIT_REWARDS as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, amount],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Rewards deposited',
      };
    } catch (error: any) {
      console.error('Error depositing rewards:', error);
      return { success: false, error: error.message || 'Deposit failed' };
    }
  }

  /**
   * Admin — withdraw from a project vault
   */
  async withdraw(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.WITHDRAW as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Withdrawal successful',
      };
    } catch (error: any) {
      console.error('Error withdrawing:', error);
      return { success: false, error: error.message || 'Withdrawal failed' };
    }
  }

  /**
   * Admin — update APY rate for a project vault
   */
  async updateApyRate(adminAccount: Account, projectId: number, apyRate: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.CONFIG as `${string}::${string}::${string}`,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, apyRate],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'APY rate updated',
      };
    } catch (error: any) {
      console.error('Error updating APY:', error);
      return { success: false, error: error.message || 'APY update failed' };
    }
  }

  // ── Legacy methods — kept for backward compat with old routes ───────────────

  async getVaultInfo(vaultAuthority: string): Promise<VaultInfo | null> {
    // Reads the first vault in the hub (legacy single-vault behaviour)
    try {
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::StakingHub` as `${string}::${string}::${string}`;
      const resource = await aptos.getAccountResource({ accountAddress: vaultAuthority, resourceType });
      const data     = (resource as any).data || resource;
      const entries: any[] = data?.vaults?.data || [];
      if (!entries.length) return null;
      const v = entries[0].value;
      return {
        authority:        v.authority,
        total_staked:     v.staked_amount?.toString() || '0',
        total_staked_apt: formatApt(v.staked_amount || 0),
        apy_rate:         Number(v.apy_rate),
        vault_balance:    v.vault_coins?.value?.toString() || '0',
        vault_balance_apt: formatApt(v.vault_coins?.value || 0),
      };
    } catch { return null; }
  }

  async getPlayerInfo(playerAddress: string): Promise<PlayerInfo | null> {
    return null; // Legacy — use getProjectPlayerStake for per-project data
  }

  async getStakingStats(): Promise<StakingStats | null> {
    try {
      const vaultInfo = await this.getVaultInfo(CONTRACT_CONFIG.HUB_AUTHORITY);
      if (!vaultInfo) return null;
      return {
        total_staked:  vaultInfo.total_staked,
        total_stakers: 0,
        apy_rate:      String(vaultInfo.apy_rate),
        vault_balance: vaultInfo.vault_balance,
      };
    } catch { return null; }
  }

  async getAccountBalance(address: string): Promise<string> {
    try {
      const balance = await aptos.getAccountAPTAmount({ accountAddress: address });
      return balance.toString();
    } catch {
      return '0';
    }
  }

  // ── Simulate ────────────────────────────────────────────────────────────────

  simulateRewards(amount: string, apyRate: number, durationSeconds: number): string {
    return Math.floor(
      Number(amount) * apyRate * durationSeconds / (CONSTANTS.SECONDS_PER_YEAR * 100)
    ).toString();
  }
}

export const stakingService = new StakingService();