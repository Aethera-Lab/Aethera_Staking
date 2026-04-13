import { aptos, INSTALLER_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG, formatApt } from '../config/aptos.config';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { InstallerInfo, KycStatus, TransactionResponse } from '../models/types';

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
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::InstallerRegistry` as `${string}::${string}::${string}`;

      const resource = await aptos.getAccountResource({
        accountAddress: CONTRACT_CONFIG.REGISTRY_AUTHORITY,
        resourceType,
      });

      const data = (resource as any).data || resource;
      // SimpleMap stores entries as [{ key, value }] array
      const entries: any[] = data?.installers?.data || [];
      const entry = entries.find((e: any) => e.key === installerAddress);

      if (!entry) return null;

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
      if (error.status === 404) return null;
      console.error('Error fetching installer info:', error.message || error);
      return null;
    }
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

  /**
   * Initialize the InstallerRegistry on-chain (if not already initialized)
   * This must be called once before any installers can register
   */
  async initializeRegistry(): Promise<boolean> {
    try {
      console.log('[initializeRegistry] Checking if registry is already initialized...');
      
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::InstallerRegistry` as `${string}::${string}::${string}`;

      try {
        const resource = await aptos.getAccountResource({
          accountAddress: CONTRACT_CONFIG.REGISTRY_AUTHORITY,
          resourceType,
        });
        
        if (resource) {
          console.log('[initializeRegistry] Registry already initialized');
          return true;
        }
      } catch (e: any) {
        if (e.status !== 404) throw e;
        // 404 means registry doesn't exist, so we need to initialize
      }

      console.log('[initializeRegistry] Registry not found, initializing...');
      
      // Get the admin account from ADMIN_PRIVATE_KEY
      const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        console.error('[initializeRegistry] ADMIN_PRIVATE_KEY not set');
        return false;
      }

      const adminAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(adminPrivateKey),
      });

      // Call initialize function
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: INSTALLER_FUNCTIONS.INITIALIZE as `${string}::${string}::${string}`,
          functionArguments: [],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      
      // Wait for transaction to complete
      const executed = await aptos.waitForTransaction({ transactionHash: committed.hash });
      console.log('[initializeRegistry] Transaction executed:', executed.success);

      console.log('[initializeRegistry] ✅ Registry initialized! TX:', committed.hash);
      return true;
    } catch (error: any) {
      console.error('[initializeRegistry] Error:', error);
      return false;
    }
  }
}

export const installerService = new InstallerService();