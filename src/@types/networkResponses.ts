export type Key = {
    _type: string;
    key: string;
}

export type CustomFees = {
    created_timestamp: string;
    fixed_fees: any[];
    fractional_fees: any[];
}

export type TokenBalance = {
    token_id: string;
    balance: number;
}


export type Links = {
    next: string;
}

export interface TokenData {
    admin_key: Key;
    auto_renew_account: string;
    auto_renew_period: number;
    created_timestamp: string;
    custom_fees: CustomFees;
    decimals: string;
    deleted: boolean;
    expiry_timestamp: number;
    fee_schedule_key: Key;
    freeze_default: boolean;
    freeze_key: string | null;
    initial_supply: string;
    kyc_key: string | null;
    max_supply: string;
    memo: string;
    metadata: string;
    metadata_key: string | null;
    modified_timestamp: string;
    name: string;
    pause_key: string | null;
    pause_status: string;
    supply_key: Key;
    supply_type: string;
    symbol: string;
    token_id: string;
    total_supply: string;
    treasury_account_id: string;
    type: string;
    wipe_key: string | null;
}
export interface Balance {
    balance: number;
    timestamp: string;
    tokens: TokenBalance[];
}
export interface AccountDetails {
    account: string;
    alias: string;
    auto_renew_period: number;
    balance: Balance;
    created_timestamp: string;
    decline_reward: boolean;
    deleted: boolean;
    ethereum_nonce: number;
    evm_address: string;
    expiry_timestamp: string;
    key: Key;
    max_automatic_token_associations: number;
    memo: string;
    pending_reward: number;
    receiver_sig_required: boolean;
    staked_account_id: string | null;
    staked_node_id: string | null;
    stake_period_start: string | null;
    transactions: any[];
    links: Links;
}