module aethera_staking::project_listing {
    use std::signer;
    use std::string::String;
    use aptos_std::simple_map::{Self, SimpleMap};

    use aethera_staking::installer_registry;

    const E_NOT_ADMIN: u64          = 1;
    const E_PROJECT_NOT_FOUND: u64  = 2;
    const E_KYC_NOT_APPROVED: u64   = 3;
    const E_NOT_APPROVED: u64       = 4; 

    const STATUS_PENDING: u8  = 0;
    const STATUS_APPROVED: u8 = 1;
    const STATUS_REJECTED: u8 = 2;


    struct Project has store, copy, drop {
        project_id:          u64,
        name:                String,
        location_id:         u64,      // must match an on-chain oracle location
        capacity_kw:         u64,      // solar panel capacity
        cost_apt:            u64,      // funding goal in octas (1 APT = 1e8 octas)
        description:         String,
        documents_hash:      String,   // IPFS hash for project docs / images
        expected_yield_bps:  u64,      // e.g. 800 = 8% APY shown to investors
        installer:           address,
        status:              u8,
        token_symbol:        String, //NEW token-economics fields (set by admin at/after approval, NOT by installer)
        ppa_tenure_months:   u64,
        nav_per_token_initial: u64,
    }

    /// Stored at admin's address — single map of all projects across all locations
    struct ProjectRegistry has key {
        admin:               address,
        registry_authority:  address,   // InstallerRegistry address (for KYC check)
        projects:            SimpleMap<u64, Project>,
        next_project_id:     u64,
    }


    /// Called ONCE by the platform admin to init project registry on-chain,  registry_authority = the address where InstallerRegistry is stored
    public entry fun initialize(
        admin:              &signer,
        registry_authority: address,
    ) {
        move_to(admin, ProjectRegistry {
            admin:              signer::address_of(admin),
            registry_authority,
            projects:           simple_map::create<u64, Project>(),
            next_project_id:    1,
        });
    }

    public entry fun approve_project(
        admin:             &signer,
        project_authority: address,
        project_id:        u64,
    ) acquires ProjectRegistry {
        let registry = borrow_global_mut<ProjectRegistry>(project_authority);
        assert!(signer::address_of(admin) == registry.admin, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);

        let project = simple_map::borrow_mut(&mut registry.projects, &project_id);
        project.status = STATUS_APPROVED;
    }

    public entry fun reject_project(
        admin:             &signer,
        project_authority: address,
        project_id:        u64,
    ) acquires ProjectRegistry {
        let registry = borrow_global_mut<ProjectRegistry>(project_authority);
        assert!(signer::address_of(admin) == registry.admin, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);

        let project = simple_map::borrow_mut(&mut registry.projects, &project_id);
        project.status = STATUS_REJECTED;
    }


    // now the admin sets the token economics for an already-approved project

    public entry fun set_token_params(
        admin:                 &signer,
        project_authority:     address,
        project_id:            u64,
        token_symbol:          String,
        ppa_tenure_months:     u64,
        nav_per_token_initial: u64,
    ) acquires ProjectRegistry {
        let registry = borrow_global_mut<ProjectRegistry>(project_authority);
        assert!(signer::address_of(admin) == registry.admin, E_NOT_ADMIN);          // admin only
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);

        let project = simple_map::borrow_mut(&mut registry.projects, &project_id);
        assert!(project.status == STATUS_APPROVED, E_NOT_APPROVED);                 // can't set on a pending/rejected project

        project.token_symbol          = token_symbol;
        project.ppa_tenure_months     = ppa_tenure_months;
        project.nav_per_token_initial = nav_per_token_initial;
    }
    

    public entry fun submit_project(
        installer:         &signer,
        project_authority: address,
        name:              String,
        location_id:       u64,
        capacity_kw:       u64,
        cost_apt:          u64,
        description:       String,
        documents_hash:    String,
        expected_yield_bps: u64,
    ) acquires ProjectRegistry {
        let registry      = borrow_global_mut<ProjectRegistry>(project_authority);
        let installer_addr = signer::address_of(installer);

        // Gate: installer must be KYC-approved before they can list a project
        assert!(
            installer_registry::is_kyc_approved(registry.registry_authority, installer_addr),
            E_KYC_NOT_APPROVED
        );

        let project_id = registry.next_project_id;
        registry.next_project_id = project_id + 1;

        simple_map::add(&mut registry.projects, project_id, Project {
            project_id,
            name,
            location_id,
            capacity_kw,
            cost_apt,
            description,
            documents_hash,
            expected_yield_bps,
            installer: installer_addr,
            status: STATUS_PENDING,
            token_symbol: std::string::utf8(b""), //  default token params
            ppa_tenure_months:     0,
            nav_per_token_initial: 0,
        });

        // Write project_id back to installer record
        installer_registry::set_project_id(
            registry.registry_authority,
            installer_addr,
            project_id,
        );
    }


    // Used by staking.move to gate vault creation
    #[view]
    public fun is_project_approved(
        project_authority: address,
        project_id:        u64,
    ): bool acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        if (!simple_map::contains_key(&registry.projects, &project_id)) return false;
        simple_map::borrow(&registry.projects, &project_id).status == STATUS_APPROVED
    }

    #[view]
    public fun get_project_status(
        project_authority: address,
        project_id:        u64,
    ): u8 acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);
        simple_map::borrow(&registry.projects, &project_id).status
    }

    /// Returns funding goal of a project in octas — used by staking UI
    #[view]
    public fun get_project_cost(
        project_authority: address,
        project_id:        u64,
    ): u64 acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);
        simple_map::borrow(&registry.projects, &project_id).cost_apt
    }

    /// Returns the location_id of a project — used by investor platform to filter
    #[view]
    public fun get_project_location(
        project_authority: address,
        project_id:        u64,
    ): u64 acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);
        simple_map::borrow(&registry.projects, &project_id).location_id
    }

    #[view]
    public fun get_expected_yield(
        project_authority: address,
        project_id:        u64,
    ): u64 acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);
        simple_map::borrow(&registry.projects, &project_id).expected_yield_bps
    }


      public fun get_token_params(
        project_authority: address,
        project_id: u64,
      ):(String, u64, u64) acquires ProjectRegistry {
        let registry = borrow_global<ProjectRegistry>(project_authority);
        assert!(simple_map::contains_key(&registry.projects, &project_id), E_PROJECT_NOT_FOUND);
        let p = simple_map::borrow(&registry.projects, &project_id);
        (p.token_symbol, p.ppa_tenure_months, p.nav_per_token_initial)
    }
      }