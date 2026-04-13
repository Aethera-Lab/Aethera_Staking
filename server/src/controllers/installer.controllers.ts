import { aptos, INSTALLER_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG, formatApt } from '../config/aptos.config';
import { Account, Ed25519PrivateKey} from '@aptos-labs/ts-sdk';
import { InstallerInfo, KycStatus, TransactionResponse } from '../models/types';
import { Request, Response, NextFunction } from "express";
import { registrationTracker } from '../services/registration-tracker';
// Helper to get human-readable KYC label
const kycLabel = (status: number): string => {
  switch (status) {
    case KycStatus.PENDING:   return 'Pending';
    case KycStatus.SUBMITTED: return 'Submitted';
    case KycStatus.APPROVED:  return 'Approved';
    case KycStatus.REJECTED:  return 'Rejected';
    default:                  return 'Unknown';
  }
};

export class InstallerService {

  /**
   * Read installer info from on-chain InstallerRegistry resource
   * The registry is a SimpleMap stored inside InstallerRegistry at registry_authority
   */
  async getInstallerInfo(installerAddress: string): Promise<InstallerInfo | null> {
    try {
      // Normalize address to full format (0x + 64 hex chars)
      const normalizedAddress = this.normalizeAddress(installerAddress);
      console.log(`[getInstallerInfo] Querying for address: ${installerAddress} (normalized: ${normalizedAddress})`);
      console.log(`[getInstallerInfo] Registry Authority: ${CONTRACT_CONFIG.REGISTRY_AUTHORITY}`);
      console.log(`[getInstallerInfo] Contract Address: ${CONTRACT_CONFIG.CONTRACT_ADDRESS}`);

      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::InstallerRegistry` as `${string}::${string}::${string}`;
      console.log(`[getInstallerInfo] Resource Type: ${resourceType}`);

      const resource = await aptos.getAccountResource({
        accountAddress: CONTRACT_CONFIG.REGISTRY_AUTHORITY,
        resourceType,
      });

      console.log(`[getInstallerInfo] Resource fetched successfully`);
      console.log(`[getInstallerInfo] Resource data:`, JSON.stringify(resource, null, 2));

      const data = (resource as any).data || resource;
      // SimpleMap stores entries as [{ key, value }] array
      const entries: any[] = data?.installers?.data || [];
      console.log(`[getInstallerInfo] Found ${entries.length} total installers in registry`);

      // Try exact match first
      let entry = entries.find((e: any) => e.key === normalizedAddress);
      
      // If no exact match, try normalized comparison
      if (!entry) {
        entry = entries.find((e: any) => {
          const normalizedKey = this.normalizeAddress(e.key);
          return normalizedKey === normalizedAddress;
        });
      }

      if (!entry) {
        console.log(`[getInstallerInfo] No installer found for address: ${normalizedAddress}`);
        // Log first 5 addresses for debugging
        console.log(`[getInstallerInfo] Sample addresses in registry:`, entries.slice(0, 5).map(e => e.key));
        return null;
      }

      console.log(`[getInstallerInfo] Found installer entry`);
      const v = entry.value;
      return {
        wallet:          v.wallet,
        name:            v.name,
        business_reg:    v.business_reg,
        documents_hash:  v.documents_hash,
        kyc_status:      Number(v.kyc_status) as KycStatus,
        kyc_status_label: kycLabel(Number(v.kyc_status)),
        location_id:     Number(v.location_id),
        project_id:      Number(v.project_id),
      };
    } catch (error: any) {
      console.error('[getInstallerInfo] ERROR:', {
        status: error.status,
        message: error.message,
        code: error.code,
        fullError: error,
      });
      if (error.status === 404) {
        console.error('[getInstallerInfo] Resource not found (404) - InstallerRegistry may not be initialized');
        return null;
      }
      console.error('[getInstallerInfo] Error fetching installer info:', error.message || error);
      return null;
    }
  }

  /**
   * Normalize Aptos address to standard format: 0x + 64 lowercase hex chars
   */
  private normalizeAddress(address: string): string {
    // Remove 0x prefix if present and pad with zeros
    let addr = address.startsWith("0x") ? address.slice(2) : address;
    // Pad to 64 characters
    addr = addr.padStart(64, "0");
    return `0x${addr.toLowerCase()}`;
  }

  /**
   * Step 1 — Installer registers wallet + basic info
   * POST /api/installer/register
   */
  async register(
    installerAccount: Account,
    name: string,
    businessReg: string,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: installerAccount.accountAddress,
        data: {
          function: INSTALLER_FUNCTIONS.REGISTER as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.REGISTRY_AUTHORITY,
            name,
            businessReg,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({
        signer: installerAccount,
        transaction,
      });

      const executed = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'Installer registered successfully',
      };
    } catch (error: any) {
      console.error('Error registering installer:', error);
      return { success: false, error: error.message || 'Registration failed' };
    }
  }

  /**
   * Step 2 — Installer uploads IPFS doc hash + picks oracle location
   * POST /api/installer/submit-kyc
   */
  async submitKyc(
    installerAccount: Account,
    documentsHash: string,
    locationId: number,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: installerAccount.accountAddress,
        data: {
          function: INSTALLER_FUNCTIONS.SUBMIT_KYC as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.REGISTRY_AUTHORITY,
            documentsHash,
            locationId,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({
        signer: installerAccount,
        transaction,
      });

      const executed = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'KYC submitted successfully — awaiting admin review',
      };
    } catch (error: any) {
      console.error('Error submitting KYC:', error);
      return { success: false, error: error.message || 'KYC submission failed' };
    }
  }

  /**
   * Admin — approve KYC
   */
  async approveKyc(
    adminAccount: Account,
    installerAddress: string,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: INSTALLER_FUNCTIONS.APPROVE_KYC as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.REGISTRY_AUTHORITY,
            installerAddress,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'KYC approved',
      };
    } catch (error: any) {
      console.error('Error approving KYC:', error);
      return { success: false, error: error.message || 'KYC approval failed' };
    }
  }

  /**
   * Admin — reject KYC
   */
  async rejectKyc(
    adminAccount: Account,
    installerAddress: string,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: INSTALLER_FUNCTIONS.REJECT_KYC as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.REGISTRY_AUTHORITY,
            installerAddress,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      const executed  = await aptos.waitForTransaction({ transactionHash: committed.hash });

      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: 'KYC rejected',
      };
    } catch (error: any) {
      console.error('Error rejecting KYC:', error);
      return { success: false, error: error.message || 'KYC rejection failed' };
    }
  }
}

export const installerService = new InstallerService();

// --- Controller functions for Express routes ---

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, privateKey, name, businessReg } = req.body;
    
    // Accept either walletAddress (for checking status) or privateKey (for on-chain tx)
    if (!walletAddress && !privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: "Either walletAddress or privateKey is required" 
      });
    }

    let address: string;
    
    if (walletAddress) {
      // User already submitted on-chain, just check status
      address = walletAddress;
      console.log(`\n[Register] ========================================`);
      console.log(`[Register] Checking status for wallet: ${address}`);
    } else {
      // User wants backend to submit (legacy flow)
      const installerAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKey),
      });
      address = installerAccount.accountAddress.toString();
      console.log(`\n[Register] ========================================`);
      console.log(`[Register] Submitting registration for: ${address}`);
    }

    console.log(`[Register] Address: ${address}`);
    console.log(`[Register] Checking for existing installer...`);

    // Check if already registered on-chain
    const existingInfo = await installerService.getInstallerInfo(address);
    console.log(`[Register] Query Result:`, existingInfo ? `Found (status: ${existingInfo.kyc_status})` : 'Not found');
    
    if (existingInfo) {
      console.log(`[Register] ✅ Installer FOUND - KYC Status: ${existingInfo.kyc_status_label} (${existingInfo.kyc_status})`);
      // Already registered — guide based on KYC status
      switch (existingInfo.kyc_status) {
        case KycStatus.PENDING:
          console.log(`[Register] → Next Step: submit_kyc`);
          return res.status(200).json({
            success: true,
            message: "You are registered but have not submitted KYC yet. Please proceed to KYC verification.",
            next_step: "submit_kyc",
            installer: existingInfo,
          });
        case KycStatus.SUBMITTED:
          console.log(`[Register] → Next Step: await_approval`);
          return res.status(200).json({
            success: true,
            message: "KYC submitted and awaiting admin approval. Check back later.",
            next_step: "await_approval",
            installer: existingInfo,
          });
        case KycStatus.APPROVED:
          console.log(`[Register] → Next Step: submit_project (KYC already approved!)`);
          return res.status(200).json({
            success: true,
            message: "✅ KYC approved! You can now submit projects.",
            next_step: "submit_project",
            installer: existingInfo,
          });
        case KycStatus.REJECTED:
          console.log(`[Register] → Next Step: contact_admin`);
          return res.status(200).json({
            success: false,
            message: "KYC was rejected. Contact admin for details.",
            next_step: "contact_admin",
            installer: existingInfo,
          });
        default:
          console.log(`[Register] → Next Step: submit_kyc (unknown status)`);
          return res.status(200).json({
            success: true,
            message: "Registration complete. Please submit KYC to proceed.",
            next_step: "submit_kyc",
            installer: existingInfo,
          });
      }
    }

    // If only checking status (walletAddress provided, no privateKey), don't submit
    if (walletAddress && !privateKey) {
      console.log(`[Register] Not found on-chain. Checking if name & businessReg provided...`);
      
      // If name and businessReg are provided, frontend is reporting a successful on-chain registration
      if (name && businessReg) {
        console.log(`[Register] Frontend reports successful on-chain registration. Recording in tracker...`);
        registrationTracker.registerInstaller(address, name, businessReg);
        console.log(`[Register] ✅ Recorded in tracker for fallback`);
        
        return res.status(200).json({
          success: true,
          message: "Registration recorded successfully. Please proceed to KYC verification.",
          next_step: "submit_kyc",
          registered: true,
        });
      }
      
      console.log(`[Register] Not found on-chain and no name provided. User needs to register first.`);
      return res.status(200).json({
        success: false,
        message: "Wallet not registered. Please complete registration transaction.",
        next_step: "register",
        registered: false,
      });
    }

    // Not registered and user provided privateKey — proceed with on-chain registration
    console.log(`[Register] ⚠️  No existing registration found. Submitting on-chain...`);
    const installerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });
    const result = await installerService.register(installerAccount, name, businessReg);
    console.log(`[Register] Registration tx result:`, result.success ? 'SUCCESS' : 'FAILED');
    
    if (result.success) {
      // Also record in tracker as fallback
      registrationTracker.registerInstaller(address, name, businessReg);
      console.log(`[Register] ✅ Recorded in tracker for fallback`);
      
      return res.status(200).json({
        success: true,
        transaction_hash: result.transaction_hash,
        message: 'Installer registered successfully. Please submit KYC next.',
        next_step: "submit_kyc",
      });
    } else {
      // Check for E_ALREADY_REGISTERED in error message
      if (result.error?.includes("E_ALREADY_REGISTERED") || result.error?.includes("abort 0x2")) {
        console.log(`[Register] Contract says already registered. Retrying query...`);
        // Try fetching info again after small delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        const retryInfo = await installerService.getInstallerInfo(address);
        console.log(`[Register] Retry result:`, retryInfo ? `Found (status: ${retryInfo.kyc_status_label})` : 'Still not found');
        
        if (retryInfo) {
          return res.status(200).json({
            success: true,
            message: "You are already registered. Proceeding based on KYC status.",
            next_step: retryInfo.kyc_status === KycStatus.APPROVED ? "submit_project" : "submit_kyc",
            installer: retryInfo,
          });
        }
        return res.status(400).json({
          success: false,
          error: "Installer is already registered. Please proceed to KYC verification.",
          next_step: "submit_kyc",
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error || 'Registration failed',
        });
      }
    }
  } catch (error: any) {
    console.error('[Register] ❌ Error:', error);
    next(error);
  }
};

export const submitKyc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { privateKey, walletAddress, documentsHash, docsHash, locationId } = req.body;
    
    // Support both documentsHash and docsHash parameter names
    const hash = documentsHash || docsHash;
    if (!hash) {
      return res.status(400).json({ success: false, error: "documentsHash or docsHash is required" });
    }

    // Support both walletAddress (frontend notification) and privateKey (legacy backend submission)
    let address: string;
    if (walletAddress) {
      address = walletAddress;
      console.log(`[submitKyc] Frontend notification - wallet: ${address}`);
      
      // Frontend reports successful on-chain KYC submission - just record in tracker
      console.log(`[submitKyc] Recording KYC submission in tracker...`);
      registrationTracker.submitKyc(address, hash, Number(locationId) || 1);
      console.log(`[submitKyc] ✅ Recorded in tracker`);
      
      return res.status(200).json({
        success: true,
        message: "KYC submission recorded successfully. Awaiting admin approval.",
        next_step: "await_approval",
      });
    } else if (!privateKey) {
      return res.status(400).json({ success: false, error: "walletAddress or privateKey is required" });
    }

    // Legacy flow: backend submission with privateKey
    const installerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });
    address = installerAccount.accountAddress.toString();
    
    console.log(`[submitKyc] Checking KYC status for address: ${address}`);
    
    // Check current KYC status
    const installerInfo = await installerService.getInstallerInfo(address);
    
    if (!installerInfo) {
      return res.status(400).json({
        success: false,
        error: "Installer not registered. Please register first.",
        next_step: "register",
      });
    }

    // If KYC is already APPROVED, user can submit multiple projects
    if (installerInfo.kyc_status === KycStatus.APPROVED) {
      console.log(`[submitKyc] KYC already approved. User can submit projects directly.`);
      return res.status(200).json({
        success: true,
        message: "Your KYC is already approved. You can proceed to submit projects.",
        next_step: "submit_project",
        installer: installerInfo,
      });
    }

    // If KYC is already SUBMITTED, prevent resubmission
    if (installerInfo.kyc_status === KycStatus.SUBMITTED) {
      console.log(`[submitKyc] KYC already submitted and awaiting admin approval.`);
      return res.status(200).json({
        success: false,
        message: "KYC already submitted and awaiting admin approval. Please check back later.",
        next_step: "await_approval",
        installer: installerInfo,
      });
    }

    // If KYC is REJECTED, prevent submission
    if (installerInfo.kyc_status === KycStatus.REJECTED) {
      console.log(`[submitKyc] KYC was rejected. Cannot resubmit.`);
      return res.status(400).json({
        success: false,
        message: "Your KYC was rejected. Please contact admin for guidance.",
        next_step: "contact_admin",
        installer: installerInfo,
      });
    }

    // Only submit if status is PENDING
    if (installerInfo.kyc_status !== KycStatus.PENDING) {
      return res.status(400).json({
        success: false,
        error: "Invalid KYC status for submission",
        next_step: "contact_admin",
      });
    }

    console.log(`[submitKyc] Submitting KYC for address: ${address}`);
    const result = await installerService.submitKyc(installerAccount, documentsHash, locationId);
    
    if (result.success) {
      // Also record in tracker as fallback
      registrationTracker.submitKyc(address, documentsHash, locationId);
      console.log(`[submitKyc] ✅ Recorded in tracker for fallback`);
      
      return res.status(200).json({
        success: true,
        transaction_hash: result.transaction_hash,
        message: result.message || 'KYC submitted successfully',
        next_step: "await_approval",
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'KYC submission failed',
      });
    }
  } catch (error: any) {
    console.error('[submitKyc] Error:', error);
    next(error);
  }
};

export const getInstaller = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    console.log(`[getInstaller] Fetching info for address: ${address}`);
    const info = await installerService.getInstallerInfo(address);
    
    if (!info) {
      return res.status(404).json({ 
        success: false, 
        error: "Installer not found",
        next_step: "register",
      });
    }

    // Return helpful next steps based on KYC status
    let next_step = "submit_kyc";
    if (info.kyc_status === KycStatus.PENDING) {
      next_step = "submit_kyc";
    } else if (info.kyc_status === KycStatus.SUBMITTED) {
      next_step = "await_approval";
    } else if (info.kyc_status === KycStatus.APPROVED) {
      next_step = "submit_project";  // Can submit multiple projects
    } else if (info.kyc_status === KycStatus.REJECTED) {
      next_step = "contact_admin";
    }

    res.json({ 
      success: true, 
      installer: info,
      next_step,
      message: `KYC Status: ${info.kyc_status_label}`,
    });
  } catch (error) {
    next(error);
  }
};