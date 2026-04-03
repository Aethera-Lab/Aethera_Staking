module aethera_staking::state {
    use std::signer;
    use std::timestamp;
    use aptos_framework::coin;
    use aptos_framework::coin::Coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::simple_map::{Self, SimpleMap};

    // use aptos_framework::error;

    use aethera_staking::helpers;
    use aethera_staking::project_listing;
    // Error codes
    const E_AMOUNT_ZERO: u64 = 1;
    const E_UNSTAKE_TOO_EARLY: u64 = 2;
    const E_NO_REWARD_AVAILABLE: u64 = 3;
    const E_PROJECT_NOT_APPROVED: u64  = 4;
    const E_NOT_STAKED: u64 = 5;
    const E_NOT_ADMIN: u64 = 6;
    const E_VAULT_ALREADY_EXISTS: u64 = 7;
    const E_VAULT_NOT_FOUND: u64 = 8;

    struct VaultAccount has store {
        authority: address,
        staked_amount: u64,
        apy_rate: u64,
        vault_coins: Coin<AptosCoin>,
    }
    struct PlayerAccount has store,copy,drop {
        staked_time: u64,
        staked_amount: u64,
        reward_time: u64,
        duration_time: u64,
        reward_amount: u64,
    }

    // adding new wrappers structs
    // Replacing the single VaultAccount and PlayerAccount structs with wrappers
    struct StakingHub has key {
        authority : address,
        project_authority: address,
        vaults: SimpleMap<u64, VaultAccount>,
    }

    struct PlayerHub has key { // Replaced the single global PlayerAccount — holds one PlayerAccount per project
        stakes: SimpleMap<u64, PlayerAccount>,
    }

    // modified: takes project_authority instead of apy_rate
    public entry fun initialize(authority: &signer, project_authority: address){
        move_to(authority,StakingHub {
            authority: signer::address_of(authority),
            project_authority,
            vaults: simple_map::create<u64, VaultAccount>(),
        });
    }

    // Adding : admin creates a vault for approved projects
    public entry fun create_project_vault(
            authority: &signer,
            hub_authority: address,
            project_id: u64,
            apy_rate: u64,
        ) acquires StakingHub {
            let hub = borrow_global_mut<StakingHub>(hub_authority);
            assert!(signer::address_of(authority) == hub.authority, E_NOT_ADMIN);
            assert!(
                project_listing::is_project_approved(hub.project_authority, project_id),
                E_PROJECT_NOT_APPROVED
            );
            assert!(!simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_ALREADY_EXISTS);

            simple_map::add(&mut hub.vaults, project_id, VaultAccount {
                authority: signer::address_of(authority),
                staked_amount: 0,
                apy_rate,
                vault_coins: coin::zero<AptosCoin>(),
            });
        }

    public entry fun deposit( // target a specific vaults
    player: &signer,
    hub_authority: address,
    project_id: u64,
    amount: u64
    )
     acquires StakingHub {
        assert!(amount > 0, E_AMOUNT_ZERO);

        let hub = borrow_global_mut<StakingHub>(hub_authority);
                assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

                let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);
                        vault_data.staked_amount = vault_data.staked_amount + amount;

        let coins = helpers::transfer_lamports(player, amount);
        coin::merge(&mut vault_data.vault_coins, coins);
    }



    public entry fun sol_stake(
        player: &signer,
        hub_authority: address,
        project_id: u64,
        // vault_authority: address,
        amount: u64,
        duration: u64) // sol stake now take project id

        acquires StakingHub, PlayerHub {
       assert!(amount > 0, E_AMOUNT_ZERO);


        let player_addr = signer::address_of(player);
        let hub = borrow_global_mut<StakingHub>(hub_authority);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

        let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);        let current_time = timestamp::now_seconds();
        // Create PlayerHub first time this investor stakes anything
        if (!exists<PlayerHub>(player_addr)) {
            move_to(player, PlayerHub {
                stakes: simple_map::create<u64, PlayerAccount>(),
            });
        };
        let player_hub = borrow_global_mut<PlayerHub>(player_addr);

                if (simple_map::contains_key(&player_hub.stakes, &project_id)) {
                    let player_data = simple_map::borrow_mut(&mut player_hub.stakes, &project_id);
                    player_data.staked_amount = player_data.staked_amount + amount;
                    player_data.staked_time = current_time;
                    player_data.duration_time = duration;
                    player_data.reward_time = current_time;
                } else {
                    simple_map::add(&mut player_hub.stakes, project_id, PlayerAccount {
                        staked_time: current_time,
                        staked_amount: amount,
                        reward_time: current_time,
                        duration_time: duration,
                        reward_amount: 0,
                    });
                };

         let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);        vault_data.staked_amount = vault_data.staked_amount + amount;
        let coins = helpers::transfer_lamports(player, amount);
        coin::merge(&mut vault_data.vault_coins, coins);
    }




// unstake with project id
    public entry fun sol_unstake(
        player: &signer,
        hub_authority: address,
        project_id: u64)
        acquires StakingHub, PlayerHub {
        let player_addr = signer::address_of(player);
        let hub = borrow_global_mut<StakingHub>(hub_authority);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

        let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);
        let player_hub = borrow_global_mut<PlayerHub>(player_addr);
        assert!(simple_map::contains_key(&player_hub.stakes, &project_id), E_NOT_STAKED);


        let player_data = simple_map::borrow_mut(&mut player_hub.stakes, &project_id);
        let current_time = timestamp::now_seconds();
        let staked_duration = current_time - player_data.staked_time;
        assert!(staked_duration >= player_data.duration_time, E_UNSTAKE_TOO_EARLY);


        let amount = player_data.staked_amount;
        player_data.staked_amount = 0;
        vault_data.staked_amount = vault_data.staked_amount - amount;

        let coins = coin::extract(&mut vault_data.vault_coins, amount);
        helpers::transfer_coins_to_player(player, coins);
    }


// claim rewards with project id
    public entry fun claim_rewards(
        player: &signer,
        hub_authority: address,
        project_id: u64)
        acquires StakingHub, PlayerHub {
        let player_addr = signer::address_of(player);
        let hub = borrow_global_mut<StakingHub>(hub_authority);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

        let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);
        let player_hub = borrow_global_mut<PlayerHub>(player_addr);
        assert!(simple_map::contains_key(&player_hub.stakes, &project_id), E_NOT_STAKED);

        let player_data = simple_map::borrow_mut(&mut player_hub.stakes, &project_id);
        let current_time = timestamp::now_seconds();
        let elapsed_time = current_time - player_data.reward_time;

        let reward = (player_data.staked_amount * vault_data.apy_rate * elapsed_time) / (365 * 24 * 60 * 60 * 100);
        assert!(reward > 0, E_NO_REWARD_AVAILABLE);


        player_data.reward_amount = player_data.reward_amount + reward;
        player_data.reward_time = current_time;

        let reward_coins = coin::extract(&mut vault_data.vault_coins, reward);
        helpers::transfer_coins_to_player(player, reward_coins);
    }

// withdraw with project id
    public entry fun withdraw(
        authority: &signer,
        hub_authority: address,
        project_id: u64)
        acquires StakingHub {
        let hub = borrow_global_mut<StakingHub>(hub_authority);
        assert!(signer::address_of(authority) == hub.authority, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

        let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);
        let amount = vault_data.staked_amount;
        vault_data.staked_amount = 0;
        let coins = coin::extract(&mut vault_data.vault_coins, amount);
        helpers::transfer_coins_to_player(authority, coins);
    }

    public entry fun config(
        authority: &signer,
        hub_authority: address,
        project_id: u64,
        new_apy_rate: u64)
        acquires StakingHub {
        let hub = borrow_global_mut<StakingHub>(hub_authority);
        assert!(signer::address_of(authority) == hub.authority, E_NOT_ADMIN);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);

        let vault_data = simple_map::borrow_mut(&mut hub.vaults, &project_id);
        vault_data.apy_rate = new_apy_rate;
    }
    // view functions
    #[view]
    public fun get_project_total_staked(hub_authority: address, project_id: u64): u64 acquires StakingHub {
        let hub = borrow_global<StakingHub>(hub_authority);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);
        simple_map::borrow(&hub.vaults, &project_id).staked_amount
    }

    #[view]
    public fun get_project_apy(hub_authority: address, project_id: u64): u64 acquires StakingHub {
        let hub = borrow_global<StakingHub>(hub_authority);
        assert!(simple_map::contains_key(&hub.vaults, &project_id), E_VAULT_NOT_FOUND);
        simple_map::borrow(&hub.vaults, &project_id).apy_rate
    }

    #[view]
    public fun get_player_stake(player_addr: address, project_id: u64): u64 acquires PlayerHub {
        if (!exists<PlayerHub>(player_addr)) return 0;
        let player_hub = borrow_global<PlayerHub>(player_addr);
        if (!simple_map::contains_key(&player_hub.stakes, &project_id)) return 0;
        simple_map::borrow(&player_hub.stakes, &project_id).staked_amount
    }

}
