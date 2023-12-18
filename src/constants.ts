// web3js errors
export const WEB3_ACCT_NOT_EXISTS_ERR = 'Account does not exist';

// SystemProgram errors.
export const SYS_ALREADY_IN_USE_ERR = '0x0';
export const SYS_INSUF_FUND_ERR = '0x1';

// Anchor errors
export const ANCHOR_ACC_NOT_INIT_ERR = '0xbc4';
export const ANCHOR_HAS_ONE_ERR = '0x7d1';
export const ANCHOR_SEEDS_VIOLATED_ERR = '0x7d6';

// Compression errors.
export const CONC_MERKLE_TREE_ERROR = '0x1771'; // Error when proof invalid (CMT raises this).

// TWhitelist errors.
export const TWL_FAILED_VOC_ERROR = '0x1776'; // TWhitelist failed voc verification.
export const TWL_BAD_MINT_PROOF_ERROR = '0x1788'; // TWhitelist decode mint proof fails (seeds mismatch, owner, etc).

// Vipers IntegerOverflow error.
export const VIPERS_INT_OVERFLOW_ERR = '0x44f';
