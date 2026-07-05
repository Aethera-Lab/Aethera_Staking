import { Request, Response } from 'express';
import { stakingService } from '../services/staking.services';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { CONTRACT_CONFIG } from '../config/aptos.config';

export class StakingController {

  // ── Per-Project (new) ───────────────────────────────────────────────────────

  /**
   * POST /api/staking/stake
   * Body: { private_key, project_id, amount, duration }
   */
  async stake(req: Request, res: Response) {
    try {
      const { private_key, project_id, amount, duration } = req.body;

      if (!private_key || project_id === undefined || !amount || !duration) {
        return res.status(400).json({
          success: false,
          error: 'private_key, project_id, amount, and duration are required',
        });
      }

      const userAccount = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await stakingService.stake(userAccount, Number(project_id), amount.toString(), Number(duration));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Staking failed' });
    }
  }

  /**
   * POST /api/staking/unstake
   * Body: { private_key, project_id }
   */
  async unstake(req: Request, res: Response) {
    try {
      const { private_key, project_id } = req.body;

      if (!private_key || project_id === undefined) {
        return res.status(400).json({ success: false, error: 'private_key and project_id are required' });
      }

      const userAccount = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await stakingService.unstake(userAccount, Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Unstaking failed' });
    }
  }

  /**
   * POST /api/staking/claim
   * Body: { private_key, project_id }
   */
  async claimRewards(req: Request, res: Response) {
    try {
      const { private_key, project_id } = req.body;

      if (!private_key || project_id === undefined) {
        return res.status(400).json({ success: false, error: 'private_key and project_id are required' });
      }

      const userAccount = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await stakingService.claimRewards(userAccount, Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Claim failed' });
    }
  }

  /**
   * GET /api/staking/project/:project_id
   */
  async getProjectVault(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);
      if (isNaN(projectId)) return res.status(400).json({ success: false, error: 'Invalid project_id' });

      const vault = await stakingService.getProjectVaultInfo(projectId);
      if (!vault) return res.status(404).json({ success: false, error: 'Vault not found' });

      res.json({ success: true, data: vault });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch vault' });
    }
  }

  /**
   * GET /api/staking/player/:address/project/:project_id
   */
  async getPlayerStake(req: Request, res: Response) {
    try {
      const { address, project_id } = req.params;
      const projectId = Number(project_id);

      if (!address || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'address and project_id are required' });
      }

      const stake = await stakingService.getProjectPlayerStake(address, projectId);
      if (!stake) return res.status(404).json({ success: false, error: 'No stake found' });

      res.json({ success: true, data: stake });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch stake' });
    }
  }

  /**
   * POST /api/staking/simulate
   * Body: { amount, apy_rate, duration_days }
   */
  async simulateStake(req: Request, res: Response) {
    try {
      const { amount, apy_rate, duration_days } = req.body;

      if (!amount || apy_rate === undefined || !duration_days) {
        return res.status(400).json({ success: false, error: 'amount, apy_rate, and duration_days are required' });
      }

      const durationSeconds = Number(duration_days) * 86400;
      const estimatedReward = stakingService.simulateRewards(amount.toString(), Number(apy_rate), durationSeconds);

      res.json({
        success: true,
        data: {
          principal_apt:          (Number(amount) / 1e8).toFixed(8),
          estimated_reward_apt:   (Number(estimatedReward) / 1e8).toFixed(8),
          total_return_apt:       ((Number(amount) + Number(estimatedReward)) / 1e8).toFixed(8),
          apy_rate:               Number(apy_rate),
          duration_days:          Number(duration_days),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Simulation failed' });
    }
  }

  // ── Legacy routes — kept for backward compat ────────────────────────────────

  async getVaultInfo(req: Request, res: Response) {
    try {
      const vaultInfo = await stakingService.getVaultInfo(CONTRACT_CONFIG.HUB_AUTHORITY);
      if (!vaultInfo) return res.status(404).json({ success: false, error: 'Vault not found' });
      res.json({ success: true, data: vaultInfo });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPlayerInfo(req: Request, res: Response) {
    res.status(410).json({
      success: false,
      error: 'Use /api/staking/player/:address/project/:project_id instead',
    });
  }

  async getStats(req: Request, res: Response) {
    try {
      const stats = await stakingService.getStakingStats();
      if (!stats) return res.status(404).json({ success: false, error: 'Stats not available' });
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getBalance(req: Request, res: Response) {
    try {
      const { address } = req.params;
      if (!address) return res.status(400).json({ success: false, error: 'Address is required' });
      const balance = await stakingService.getAccountBalance(address);
      res.json({ success: true, data: { address, balance, balance_apt: (Number(balance) / 1e8).toFixed(8) } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const stakingController = new StakingController();