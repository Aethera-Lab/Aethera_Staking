import { aptos, INSTALLER_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG, formatApt } from '../config/aptos.config';
import { Account, Ed25519PrivateKey} from '@aptos-labs/ts-sdk';
import { InstallerInfo, KycStatus, TransactionResponse } from '../models/types';
import { Request, Response, NextFunction } from "express";
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
    const { privateKey, name, businessReg } = req.body;
    
    if (!privateKey) {
      return res.status(400).json({ success: false, error: "Private key is required" });
    }

    const installerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });
    const address = installerAccount.accountAddress.toString();
    console.log(`[Register] Checking if installer already exists at address: ${address}`);

    // Check if already registered
    const existingInfo = await installerService.getInstallerInfo(address);
    console.log(`[Register] Existing info query result:`, existingInfo);
    
    if (existingInfo) {
      console.log(`[Register] Installer already registered with KYC status: ${existingInfo.kyc_status}`);
      // Already registered — guide based on KYC status
      switch (existingInfo.kyc_status) {
        case KycStatus.PENDING:
          return res.status(200).json({
            success: true,
            message: "You are registered but have not submitted KYC yet. Please proceed to KYC verification.",
            next_step: "submit_kyc",
            installer: existingInfo,
          });
        case KycStatus.SUBMITTED:
          return res.status(200).json({
            success: true,
            message: "KYC submitted and awaiting admin approval. Check back later.",
            next_step: "await_approval",
            installer: existingInfo,
          });
        case KycStatus.APPROVED:
          return res.status(200).json({
            success: true,
            message: "KYC approved. You can now submit projects.",
            next_step: "submit_project",
            installer: existingInfo,
          });
        case KycStatus.REJECTED:
          return res.status(200).json({
            success: false,
            message: "KYC was rejected. Contact admin for details.",
            next_step: "contact_admin",
            installer: existingInfo,
          });
        default:
          return res.status(200).json({
            success: true,
            message: "Registration complete. Please submit KYC to proceed.",
            next_step: "submit_kyc",
            installer: existingInfo,
          });
      }
    }

    // Not registered — proceed with registration
    console.log(`[Register] No existing registration found. Proceeding with new registration...`);
    const result = await installerService.register(installerAccount, name, businessReg);
    console.log(`[Register] Registration result:`, result);
    
    if (result.success) {
      return res.status(200).json({
        success: true,
        transaction_hash: result.transaction_hash,
        message: 'Installer registered successfully. Please submit KYC next.',
        next_step: "submit_kyc",
      });
    } else {
      // Check for E_ALREADY_REGISTERED in error message
      if (result.error?.includes("E_ALREADY_REGISTERED") || result.error?.includes("abort 0x2")) {
        console.log(`[Register] Contract returned E_ALREADY_REGISTERED. Fetching installer info again...`);
        // Try fetching info again after small delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryInfo = await installerService.getInstallerInfo(address);
        if (retryInfo) {
          return res.status(200).json({
            success: true,
            message: "You are already registered. Please proceed to KYC verification.",
            next_step: "submit_kyc",
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
    console.error('[Register] Error:', error);
    next(error);
  }
};

export const submitKyc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { privateKey, documentsHash, locationId } = req.body;
    const installerAccount = Account.fromPrivateKey({privateKey: new Ed25519PrivateKey(privateKey),});
    const result = await installerService.submitKyc(installerAccount, documentsHash, locationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getInstaller = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    const info = await installerService.getInstallerInfo(address);
    if (!info) return res.status(404).json({ success: false, error: "Installer not found" });
    res.json({ success: true, installer: info });
  } catch (error) {
    next(error);
  }
};