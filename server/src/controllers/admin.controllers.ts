import { Request, Response } from 'express';
import { adminService } from '../services/admin.services';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

// Loads admin account from ADMIN_PRIVATE_KEY env var
// Same pattern as your existing staking.controllers.ts
const getAdminAccount = (): Account => {
  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) throw new Error('Admin credentials not configured');
  return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
};

export class AdminController {

  // ── KYC ────────────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/kyc/approve
   * Body: { installer_address }
   */
  async approveKyc(req: Request, res: Response) {
    try {
      const { installer_address } = req.body;
      if (!installer_address)
        return res.status(400).json({ success: false, error: 'installer_address is required' });

      const result = await adminService.approveKyc(getAdminAccount(), installer_address);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'KYC approval failed' });
    }
  }

  /**
   * POST /api/admin/kyc/reject
   * Body: { installer_address }
   */
  async rejectKyc(req: Request, res: Response) {
    try {
      const { installer_address } = req.body;
      if (!installer_address)
        return res.status(400).json({ success: false, error: 'installer_address is required' });

      const result = await adminService.rejectKyc(getAdminAccount(), installer_address);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'KYC rejection failed' });
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/project/approve
   * Body: { project_id }
   */
  async approveProject(req: Request, res: Response) {
    try {
      const { project_id } = req.body;
      if (project_id === undefined)
        return res.status(400).json({ success: false, error: 'project_id is required' });

      const result = await adminService.approveProject(getAdminAccount(), Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Project approval failed' });
    }
  }

  /**
   * POST /api/admin/project/reject
   * Body: { project_id }
   */
  async rejectProject(req: Request, res: Response) {
    try {
      const { project_id } = req.body;
      if (project_id === undefined)
        return res.status(400).json({ success: false, error: 'project_id is required' });

      const result = await adminService.rejectProject(getAdminAccount(), Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Project rejection failed' });
    }
  }

  // ── Vaults ─────────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/vault/create
   * Body: { project_id, apy_rate }
   * Must be called AFTER approving the project
   */
  async createVault(req: Request, res: Response) {
    try {
      const { project_id, apy_rate } = req.body;
      if (project_id === undefined || apy_rate === undefined)
        return res.status(400).json({ success: false, error: 'project_id and apy_rate are required' });

      const result = await adminService.createVault(
        getAdminAccount(),
        Number(project_id),
        Number(apy_rate),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Vault creation failed' });
    }
  }

  /**
   * POST /api/admin/vault/deposit
   * Body: { project_id, amount }  (amount in octas)
   */
  async depositRewards(req: Request, res: Response) {
    try {
      const { project_id, amount } = req.body;
      if (project_id === undefined || !amount)
        return res.status(400).json({ success: false, error: 'project_id and amount are required' });

      const result = await adminService.depositRewards(
        getAdminAccount(),
        Number(project_id),
        amount.toString(),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Deposit failed' });
    }
  }

  /**
   * POST /api/admin/vault/withdraw
   * Body: { project_id }
   */
  async withdraw(req: Request, res: Response) {
    try {
      const { project_id } = req.body;
      if (project_id === undefined)
        return res.status(400).json({ success: false, error: 'project_id is required' });

      const result = await adminService.withdraw(getAdminAccount(), Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Withdrawal failed' });
    }
  }

  /**
   * POST /api/admin/vault/config
   * Body: { project_id, new_apy_rate }
   */
  async updateConfig(req: Request, res: Response) {
    try {
      const { project_id, new_apy_rate } = req.body;
      if (project_id === undefined || new_apy_rate === undefined)
        return res.status(400).json({ success: false, error: 'project_id and new_apy_rate are required' });

      const result = await adminService.updateConfig(
        getAdminAccount(),
        Number(project_id),
        Number(new_apy_rate),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Config update failed' });
    }
  }
}

export const adminController = new AdminController();