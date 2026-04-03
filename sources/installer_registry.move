/// Task 1 — Installer Registry
/// Handles installer registration, KYC submission, and admin approval.
/// All installer data is stored in a single SimpleMap at the admin's address.

module aethera_staking::installer_registry {
    use std::signer;
    use std::string::String;
    use aptos_std::simple_map::{Self, SimpleMap};

    // ── Error Codes ──────────────────────────────────────────────────────────
    const E_NOT_ADMIN: u64          = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_NOT_REGISTERED: u64     = 3;
    const E_KYC_NOT_SUBMITTED: u64  = 4;

    // ── KYC Status Constants ─────────────────────────────────────────────────
    const KYC_PENDING: u8   = 0;   // registered but docs not uploaded yet
    const KYC_SUBMITTED: u8 = 1;   // docs uploaded, waiting for admin
    const KYC_APPROVED: u8  = 2;   // admin approved
    const KYC_REJECTED: u8  = 3;   // admin rejected

    // ── Structs ──────────────────────────────────────────────────────────────

    /// One record per installer, stored inside InstallerRegistry map
    struct InstallerInfo has store, copy, drop {
        wallet:          address,
        name:            String,
        business_reg:    String,
        documents_hash:  String,   // IPFS hash of uploaded KYC docs
        kyc_status:      u8,
        location_id:     u64,      // on-chain oracle location chosen by installer
        project_id:      u64,      // 0 = no project listed yet
    }

    /// Stored at admin's address — single source of truth for all installers
    struct InstallerRegistry has key {
        admin:      address,
        installers: SimpleMap<address, InstallerInfo>,
    }

    // ── Admin Functions ──────────────────────────────────────────────────────

    /// Called ONCE by the platform admin to initialise the registry on-chain
    public entry fun initialize(admin: &signer) {
        move_to(admin, InstallerRegistry {
            admin:      signer::address_of(admin),
            installers: simple_map::create<address, InstallerInfo>(),
        });
    }

    /// Admin approves an installer's KYC (status must be SUBMITTED)
    public entry fun approve_kyc(
        admin:             &signer,
        registry_authority: address,
        installer_addr:    address,
    ) acquires InstallerRegistry {
        let registry = borrow_global_mut<InstallerRegistry>(registry_authority);
        assert!(signer::address_of(admin) == registry.admin, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&registry.installers, &installer_addr), E_NOT_REGISTERED);

        let info = simple_map::borrow_mut(&mut registry.installers, &installer_addr);
        assert!(info.kyc_status == KYC_SUBMITTED, E_KYC_NOT_SUBMITTED);
        info.kyc_status = KYC_APPROVED;
    }

    /// Admin rejects an installer's KYC
    public entry fun reject_kyc(
        admin:             &signer,
        registry_authority: address,
        installer_addr:    address,
    ) acquires InstallerRegistry {
        let registry = borrow_global_mut<InstallerRegistry>(registry_authority);
        assert!(signer::address_of(admin) == registry.admin, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&registry.installers, &installer_addr), E_NOT_REGISTERED);

        let info = simple_map::borrow_mut(&mut registry.installers, &installer_addr);
        info.kyc_status = KYC_REJECTED;
    }

    // ── Installer Functions ──────────────────────────────────────────────────

    /// Step 1 — Installer connects wallet and registers basic info
    public entry fun register_installer(
        installer:          &signer,
        registry_authority: address,
        name:               String,
        business_reg:       String,
    ) acquires InstallerRegistry {
        let registry = borrow_global_mut<InstallerRegistry>(registry_authority);
        let addr = signer::address_of(installer);
        assert!(!simple_map::contains_key(&registry.installers, &addr), E_ALREADY_REGISTERED);

        simple_map::add(&mut registry.installers, addr, InstallerInfo {
            wallet:         addr,
            name,
            business_reg,
            documents_hash: std::string::utf8(b""),
            kyc_status:     KYC_PENDING,
            location_id:    0,
            project_id:     0,
        });
    }


// submitkyc 
public entry fun submit_kyc(
    installer:          &signer,
    registry_authority: address,
    documents_hash:     String,
    location_id:        u64,
) acquires InstallerRegistry {
    let registry = borrow_global_mut<InstallerRegistry>(registry_authority);
    let addr = signer::address_of(installer);

    assert!(
        simple_map::contains_key(&registry.installers, &addr),
        E_NOT_REGISTERED
    );

    let info = simple_map::borrow_mut(&mut registry.installers, &addr);

    // prevent resubmission
    assert!(
        info.kyc_status == KYC_PENDING,
        E_KYC_NOT_SUBMITTED
    );

    info.documents_hash = documents_hash;
    info.location_id    = location_id;
    info.kyc_status     = KYC_SUBMITTED;
}



    /// Step 2 — Installer uploads IPFS doc hash + picks their oracle location
    ///          This moves status from PENDING → SUBMITTED
   
   

    /// Called internally by project_listing when a project is submitted
    public fun set_project_id(
        registry_authority: address,
        installer_addr:     address,
        project_id:         u64,
    ) acquires InstallerRegistry {
        let registry = borrow_global_mut<InstallerRegistry>(registry_authority);
        assert!(simple_map::contains_key(&registry.installers, &installer_addr), E_NOT_REGISTERED);
        let info = simple_map::borrow_mut(&mut registry.installers, &installer_addr);
        info.project_id = project_id;
    }

    // ── View Functions ───────────────────────────────────────────────────────

    #[view]
    public fun get_kyc_status(
        registry_authority: address,
        installer_addr:     address,
    ): u8 acquires InstallerRegistry {
        let registry = borrow_global<InstallerRegistry>(registry_authority);
        assert!(simple_map::contains_key(&registry.installers, &installer_addr), E_NOT_REGISTERED);
        simple_map::borrow(&registry.installers, &installer_addr).kyc_status
    }

    /// Used by project_listing.move to gate project submission
    #[view]
    public fun is_kyc_approved(
        registry_authority: address,
        installer_addr:     address,
    ): bool acquires InstallerRegistry {
        let registry = borrow_global<InstallerRegistry>(registry_authority);
        if (!simple_map::contains_key(&registry.installers, &installer_addr)) return false;
        simple_map::borrow(&registry.installers, &installer_addr).kyc_status == KYC_APPROVED
    }

    #[view]
    public fun get_installer_location(
        registry_authority: address,
        installer_addr:     address,
    ): u64 acquires InstallerRegistry {
        let registry = borrow_global<InstallerRegistry>(registry_authority);
        assert!(simple_map::contains_key(&registry.installers, &installer_addr), E_NOT_REGISTERED);
        simple_map::borrow(&registry.installers, &installer_addr).location_id
    }
}
