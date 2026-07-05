import { Request, Response } from 'express';
import { adminService } from '../services/admin.services';
import { registrationTracker } from '../services/registration-tracker';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

// Loads admin account from ADMIN_PRIVATE_KEY env var
// Same pattern as your existing staking.controllers.ts
const getAdminAccount = (): Account | null => {
  let pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    console.warn('[getAdminAccount] ADMIN_PRIVATE_KEY not set');
    return null;
  }
  
  // Remove common prefixes that might be in the env var
  if (pk.startsWith('ed25519-priv-')) {
    pk = pk.replace('ed25519-priv-', '');
  }
  
  try {
    return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
  } catch (error) {
    console.error('[getAdminAccount] Invalid private key format:', error);
    return null;
  }
};

export class AdminController {

  // ── KYC Submissions ───────────────────────────────────────────────────────

  /**
   * GET /api/admin/kyc/submissions
   * Returns all KYC submissions (PENDING or SUBMITTED status)
   */
  async getKycSubmissions(req: Request, res: Response) {
    try {
      console.log('[getKycSubmissions] Fetching KYC submissions...');
      const submissions = await adminService.getKycSubmissions();
      console.log(`[getKycSubmissions] Found ${submissions.length} submissions`);
      res.json({ success: true, data: submissions });
    } catch (error: any) {
      console.error('[getKycSubmissions] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch KYC submissions' });
    }
  }

  /**
   * GET /api/admin/projects/pending
   * Returns all projects awaiting approval (PENDING status)
   */
  async getPendingProjects(req: Request, res: Response) {
    try {
      console.log('[getPendingProjects] Fetching pending projects...');
      const projects = await adminService.getPendingProjects();
      console.log(`[getPendingProjects] Found ${projects.length} pending projects`);
      res.json({ success: true, data: projects });
    } catch (error: any) {
      console.error('[getPendingProjects] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch pending projects' });
    }
  }

  /**
   * GET /api/admin/projects/all
   * Returns ALL projects (pending, approved, rejected)
   */
  async getAllProjects(req: Request, res: Response) {
    try {
      console.log('[getAllProjects] Fetching all projects...');
      const projects = await adminService.getAllProjects();
      console.log(`[getAllProjects] Found ${projects.length} total projects`);
      res.json({ success: true, data: projects });
    } catch (error: any) {
      console.error('[getAllProjects] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch projects' });
    }
  }

  // ── KYC Actions ───────────────────────────────────────────────────────────

  /**
   * POST /api/admin/kyc/approve
   * Body: { installer_address }
   */
  async approveKyc(req: Request, res: Response) {
    try {
      const { installer_address } = req.body;
      if (!installer_address)
        return res.status(400).json({ success: false, error: 'installer_address is required' });

      console.log(`[approveKyc] Approving KYC for installer: ${installer_address}`);
      
      const adminAccount = getAdminAccount();
      
      // If no admin account configured, use tracker directly
      if (!adminAccount) {
        console.log(`[approveKyc] No admin account, using tracker directly...`);
        const success = registrationTracker.approveKyc(installer_address);
        if (success) {
          return res.json({
            success: true,
            message: `KYC approved for ${installer_address} (via tracker)`,
            transaction_hash: 'tracker_' + Date.now().toString(),
          });
        } else {
          return res.status(404).json({ 
            success: false, 
            error: `Installer ${installer_address} not found in tracker` 
          });
        }
      }
      
      const result = await adminService.approveKyc(adminAccount, installer_address);
      console.log(`[approveKyc] Result:`, result);
      res.json(result);
    } catch (error: any) {
      console.error('[approveKyc] Error:', error);
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

      console.log(`[rejectKyc] Rejecting KYC for installer: ${installer_address}`);
      
      const adminAccount = getAdminAccount();
      
      // If no admin account configured, use tracker directly
      if (!adminAccount) {
        console.log(`[rejectKyc] No admin account, using tracker directly...`);
        const success = registrationTracker.rejectKyc(installer_address);
        if (success) {
          return res.json({
            success: true,
            message: `KYC rejected for ${installer_address} (via tracker)`,
            transaction_hash: 'tracker_' + Date.now().toString(),
          });
        } else {
          return res.status(404).json({ 
            success: false, 
            error: `Installer ${installer_address} not found in tracker` 
          });
        }
      }

      const result = await adminService.rejectKyc(adminAccount, installer_address);
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

      console.log(`[approveProject] Approving project: ${project_id}`);
      
      const adminAccount = getAdminAccount();
      
      // If no admin account configured, use tracker directly
      if (!adminAccount) {
        console.log(`[approveProject] No admin account, using tracker directly...`);
        const success = registrationTracker.approveProject(Number(project_id));
        if (success) {
          return res.json({
            success: true,
            message: `Project ${project_id} approved (via tracker)`,
            transaction_hash: 'tracker_' + Date.now().toString(),
          });
        } else {
          return res.status(404).json({ 
            success: false, 
            error: `Project ${project_id} not found in tracker` 
          });
        }
      }

      const result = await adminService.approveProject(adminAccount, Number(project_id));
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

      console.log(`[rejectProject] Rejecting project: ${project_id}`);
      
      const adminAccount = getAdminAccount();
      
      // If no admin account configured, use tracker directly
      if (!adminAccount) {
        console.log(`[rejectProject] No admin account, using tracker directly...`);
        const success = registrationTracker.rejectProject(Number(project_id));
        if (success) {
          return res.json({
            success: true,
            message: `Project ${project_id} rejected (via tracker)`,
            transaction_hash: 'tracker_' + Date.now().toString(),
          });
        } else {
          return res.status(404).json({ 
            success: false, 
            error: `Project ${project_id} not found in tracker` 
          });
        }
      }

      const result = await adminService.rejectProject(adminAccount, Number(project_id));
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

      const adminAccount = getAdminAccount();
      if (!adminAccount) {
        return res.status(500).json({ success: false, error: 'Admin credentials not configured' });
      }

      const result = await adminService.createVault(
        adminAccount,
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

      const adminAccount = getAdminAccount();
      if (!adminAccount) {
        return res.status(500).json({ success: false, error: 'Admin credentials not configured' });
      }

      const result = await adminService.depositRewards(
        adminAccount,
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

      const adminAccount = getAdminAccount();
      if (!adminAccount) {
        return res.status(500).json({ success: false, error: 'Admin credentials not configured' });
      }

      const result = await adminService.withdraw(adminAccount, Number(project_id));
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

      const adminAccount = getAdminAccount();
      if (!adminAccount) {
        return res.status(500).json({ success: false, error: 'Admin credentials not configured' });
      }

      const result = await adminService.updateConfig(
        adminAccount,
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