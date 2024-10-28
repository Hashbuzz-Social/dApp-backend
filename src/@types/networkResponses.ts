type Key = {
    _type: string;
    key: string;
}

type CustomFees = {
    created_timestamp: string;
    fixed_fees: any[];
    fractional_fees: any[];
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