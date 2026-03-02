/**
 * Environment Variable Validation
 *
 * Validates required environment variables at runtime and provides
 * helpful error messages for missing or invalid configuration.
 */

export interface EnvValidationResult {
    valid: boolean;
    missing: string[];
    invalid: string[];
    warnings: string[];
}

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
    'PUBLIC_API_URL',
    'PUBLIC_KALE_SAC_ID',
    'PUBLIC_NETWORK_PASSPHRASE',
    'PUBLIC_RPC_URL',
    'PUBLIC_SMOL_CONTRACT_ID',
    // 'PUBLIC_WEBAUTHN_VERIFIER_ADDRESS', // Unused (handled by passkey-kit internal logic)
    'PUBLIC_WALLET_WASM_HASH',
    'PUBLIC_TURNSTILE_SITE_KEY',
] as const;

/**
 * Optional environment variables
 */
const OPTIONAL_ENV_VARS = [
    'PUBLIC_AUDIO_PROXY_URL',
    'PUBLIC_RELAYER_API_KEY',
    'PUBLIC_RELAYER_URL',
    'PUBLIC_XLM_SAC_ID',
] as const;

/**
 * Validate a contract address (basic format check)
 */
function isValidContractAddress(address: string): boolean {
    // Stellar contract addresses start with 'C' and are 56 characters
    return /^C[A-Z0-9]{55}$/.test(address);
}

/**
 * Validate a public key (basic format check)
 */
function isValidPublicKey(key: string): boolean {
    // Stellar public keys start with 'G' and are 56 characters
    return /^G[A-Z0-9]{55}$/.test(key);
}

/**
 * Validate a hash (basic format check)
 */
function isValidHash(hash: string): boolean {
    // Hashes are 64 character hex strings
    return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Validate a URL
 */
function isValidUrl(url: string): boolean {
    if (url.startsWith('/')) return true; // Allow relative URLs
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate environment configuration
 */
export function validateEnvironment(): EnvValidationResult {
    const result: EnvValidationResult = {
        valid: true,
        missing: [],
        invalid: [],
        warnings: [],
    };

    // Check required variables
    for (const varName of REQUIRED_ENV_VARS) {
        const value = import.meta.env[varName];

        if (!value) {
            result.missing.push(varName);
            result.valid = false;
            continue;
        }

        // Validate specific formats
        switch (varName) {
            case 'PUBLIC_API_URL':
            case 'PUBLIC_RPC_URL':
                if (!isValidUrl(value)) {
                    result.invalid.push(`${varName} (invalid URL: ${value})`);
                    result.valid = false;
                }
                break;

            case 'PUBLIC_KALE_SAC_ID':
            case 'PUBLIC_SMOL_CONTRACT_ID':
                if (!isValidContractAddress(value)) {
                    result.invalid.push(`${varName} (invalid contract address: ${value})`);
                    result.valid = false;
                }
                break;

            case 'PUBLIC_WALLET_WASM_HASH':
                if (!isValidHash(value)) {
                    result.invalid.push(`${varName} (invalid hash: ${value})`);
                    result.valid = false;
                }
                break;

            case 'PUBLIC_NETWORK_PASSPHRASE':
                if (!value.includes('Stellar')) {
                    result.warnings.push(`${varName} may be invalid (doesn't contain 'Stellar')`);
                }
                break;

            case 'PUBLIC_TURNSTILE_SITE_KEY':
                if (!value.startsWith('0x')) {
                    result.warnings.push(`${varName} may be invalid (doesn't start with '0x')`);
                }
                break;
        }
    }

    // Check optional variables and warn if URL format is wrong
    for (const varName of OPTIONAL_ENV_VARS) {
        const value = import.meta.env[varName];

        if (value) {
            switch (varName) {
                case 'PUBLIC_AUDIO_PROXY_URL':
                case 'PUBLIC_RELAYER_URL':
                    if (!isValidUrl(value)) {
                        result.warnings.push(`${varName} has invalid URL format: ${value}`);
                    }
                    break;

                case 'PUBLIC_XLM_SAC_ID':
                    if (!isValidContractAddress(value)) {
                        result.warnings.push(`${varName} has invalid contract address format: ${value}`);
                    }
                    break;
            }
        }
    }

    return result;
}

/**
 * Get a formatted error message for validation results
 */
export function formatValidationErrors(result: EnvValidationResult): string {
    const messages: string[] = [];

    if (result.missing.length > 0) {
        messages.push('Missing required environment variables:');
        result.missing.forEach(varName => {
            messages.push(`  - ${varName}`);
        });
    }

    if (result.invalid.length > 0) {
        messages.push('Invalid environment variables:');
        result.invalid.forEach(msg => {
            messages.push(`  - ${msg}`);
        });
    }

    if (result.warnings.length > 0) {
        messages.push('Warnings:');
        result.warnings.forEach(msg => {
            messages.push(`  - ${msg}`);
        });
    }

    return messages.join('\n');
}

/**
 * Validate environment and throw if invalid
 */
export function validateEnvironmentOrThrow(): void {
    const result = validateEnvironment();

    if (!result.valid) {
        const errorMessage = formatValidationErrors(result);
        console.error('[EnvValidation] Invalid environment configuration:\n' + errorMessage);
        throw new Error('Invalid environment configuration. Check console for details.');
    }

    if (result.warnings.length > 0) {
        console.warn('[EnvValidation] Environment warnings:\n' + formatValidationErrors(result));
    }

    console.log('[EnvValidation] Environment validation passed');
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo(): Record<string, any> {
    const isDev = import.meta.env.DEV;
    const isProd = import.meta.env.PROD;
    const mode = import.meta.env.MODE;

    const isLocalhost = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
    const isPagesDev = typeof window !== 'undefined' && window.location.hostname.includes('pages.dev');

    return {
        isDev,
        isProd,
        mode,
        isLocalhost,
        isPagesDev,
        rpcUrl: import.meta.env.PUBLIC_RPC_URL,
        apiUrl: import.meta.env.PUBLIC_API_URL,
        relayerUrl: import.meta.env.PUBLIC_RELAYER_URL || 'default',
        hasRelayerApiKey: !!import.meta.env.PUBLIC_RELAYER_API_KEY,
    };
}
