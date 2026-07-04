import { keccak256, stringToBytes } from 'viem';

/**
 * Utility for decoding Solidity custom errors
 */
export class ErrorDecoder {
  // Map of error signatures to human-readable names
  // These are the actual error signatures we've encountered in transactions
  private static readonly ERROR_SIGNATURES: Record<string, string> = {
    // Known error from actual transaction
    '0xfb8f41b2': 'InsufficientSYBalance',
    
    // Common contract errors (will be updated as we encounter more)
    '0x3ee5aeb5': 'SYTokenDoesNotExist',
    '0x8b6a4b7e': 'SYTokenHasMatured',
    '0x1f2a2005': 'MaturityTooSoon', 
    '0x0b07489b': 'MaturityTooFar',
    '0x7138356f': 'MaturityAlreadyExists',
    '0x7c946ed7': 'TokenPairDoesNotExist',
    '0x356680b7': 'InsufficientPTBalance',
    '0x37c3be29': 'InsufficientYTBalance',
    '0x2c5211c6': 'InvalidUnderlyingToken',
    '0x55299b49': 'NoMaturityOptionsAvailable',
    '0x1e4fbdf7': 'NoValidMaturityOptionsAvailable',
    '0x4b6a4b7e': 'PTTokenHasNotMatured',
    '0x456680b7': 'NoPTTokensToRedeem',
    '0x47c3be29': 'YTTokenHasExpired',
    '0x57c3be29': 'NoYieldToClaim',
    '0x6f2a2005': 'MaturityMustBeInFuture',
    '0x8c946ed7': 'AmountMustBeGreaterThanZero',
    '0x9b6a4b7e': 'TokenHasMatured',
    '0xa56680b7': 'OnlyFactoryCanCall',
    '0xb2c5211c6': 'InsufficientBalance',
    '0xc8b6a4b7e': 'TokenHasNotMaturedYet',
    '0xd2c5211c6': 'InvalidSYTokenAddress',
    '0xe56680b7': 'RedemptionNotEnabled',
    '0xf8b6a4b7e': 'TokenHasExpired',
    '0x1c946ed7': 'InsufficientFee',
    
    // Common ERC20 errors
    '0xa7fb7757': 'ERC20InsufficientBalance',
    '0x94280d62': 'ERC20InvalidSender',
    '0xec442f05': 'ERC20InvalidReceiver',
    '0xe602df05': 'ERC20InsufficientAllowance',
    '0x6b0c3f06': 'ERC20InvalidApprover',
    '0xd92e233d': 'ERC20InvalidSpender'
  };

  /**
   * Generate error signature from error name
   */
  private static generateErrorSignature(errorName: string): string {
    const hash = keccak256(stringToBytes(`${errorName}()`));
    return hash.slice(0, 10); // First 4 bytes (8 hex chars + 0x)
  }

  /**
   * Decode a custom error from transaction data
   */
  static decodeError(errorData: string): { name: string; signature: string; data: string } | null {
    if (!errorData || errorData.length < 10) {
      return null;
    }

    const signature = errorData.slice(0, 10);
    const data = errorData.slice(10);
    
    const errorName = this.ERROR_SIGNATURES[signature];
    
    // Log unknown error signatures for future mapping
    if (!errorName) {
      this.logUnknownError(signature, errorData);
    }
    
    return {
      name: errorName || 'UnknownError',
      signature,
      data
    };
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(errorName: string): string {
    const messages: Record<string, string> = {
      'SYTokenDoesNotExist': 'The requested yield token does not exist for this maturity',
      'SYTokenHasMatured': 'This yield token has already matured and cannot be used',
      'TokenPairDoesNotExist': 'PT/YT token pair does not exist for this SY token',
      'InsufficientSYBalance': 'Insufficient SY token balance',
      'InsufficientPTBalance': 'Insufficient PT token balance',
      'InsufficientYTBalance': 'Insufficient YT token balance',
      'InvalidUnderlyingToken': 'Invalid underlying token address',
      'MaturityTooSoon': 'Maturity date is too soon (minimum 1 day)',
      'MaturityTooFar': 'Maturity date is too far in the future (maximum 100 years)',
      'MaturityAlreadyExists': 'A token with this maturity already exists',
      'InsufficientFee': 'Insufficient fee paid for maturity creation',
      'PTTokenHasNotMatured': 'PT token has not matured yet',
      'NoPTTokensToRedeem': 'No PT tokens available to redeem',
      'YTTokenHasExpired': 'YT token has expired',
      'NoYieldToClaim': 'No yield available to claim',
      'NoMaturityOptionsAvailable': 'No maturity options available for this token',
      'NoValidMaturityOptionsAvailable': 'No valid maturity options available',
      'MaturityMustBeInFuture': 'Maturity must be set in the future',
      'AmountMustBeGreaterThanZero': 'Amount must be greater than zero',
      'TokenHasMatured': 'Token has already matured',
      'OnlyFactoryCanCall': 'Only the factory contract can call this function',
      'InsufficientBalance': 'Insufficient token balance',
      'TokenHasNotMaturedYet': 'Token has not matured yet',
      'RedemptionNotEnabled': 'Redemption is not enabled for this token',
      'TokenHasExpired': 'Token has expired',
      'ERC20InsufficientBalance': 'Insufficient token balance',
      'ERC20InvalidSender': 'Invalid sender address',
      'ERC20InvalidReceiver': 'Invalid receiver address',
      'ERC20InsufficientAllowance': 'Insufficient token allowance - please approve more tokens',
      'ERC20InvalidApprover': 'Invalid approver address',
      'ERC20InvalidSpender': 'Invalid spender address'
    };

    return messages[errorName] || `Unknown error: ${errorName}`;
  }

  /**
   * Debug helper to explore error structure
   */
  static debugErrorStructure(error: any, depth = 0, maxDepth = 3): void {
    if (depth > maxDepth) return;
    
    const indent = '  '.repeat(depth);
    console.log(`${indent}🔍 Error structure at depth ${depth}:`);
    
    if (error && typeof error === 'object') {
      const keys = Object.keys(error);
      console.log(`${indent}Keys:`, keys);
      
      for (const key of keys) {
        const value = error[key];
        console.log(`${indent}${key}:`, typeof value, Array.isArray(value) ? `(array length: ${value.length})` : '');
        
        if (key === 'data' || key === 'details') {
          console.log(`${indent}  → ${key} value:`, value);
        }
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && depth < maxDepth) {
          this.debugErrorStructure(value, depth + 1, maxDepth);
        }
        
        if (Array.isArray(value) && value.length > 0 && depth < maxDepth) {
          console.log(`${indent}  → First array item:`, value[0]);
        }
      }
    } else {
      console.log(`${indent}Error is not an object:`, typeof error, error);
    }
  }

  /**
   * Extract error information from a blockchain error
   */
  static extractErrorFromException(error: any): {
    errorName: string;
    errorMessage: string;
    signature: string;
    rawData: string;
  } | null {
    console.log('🔍 ErrorDecoder: Full error object:', error);
    
    // Deep debug the error structure
    this.debugErrorStructure(error);
    
    let errorData: string | null = null;

    // Enhanced wagmi/viem error extraction
    if (error?.cause?.data) {
      // Wagmi/viem: error.cause.data contains the raw error data
      errorData = error.cause.data;
      console.log('📍 Found error data in error.cause.data:', errorData);
    } else if (error?.data) {
      // Direct data property
      errorData = error.data;
      console.log('📍 Found error data in error.data:', errorData);
    } else if (error?.error?.data) {
      // Nested error data
      errorData = error.error.data;
      console.log('📍 Found error data in error.error.data:', errorData);
    } else if (error?.details) {
      // Some providers use details
      errorData = error.details;
      console.log('📍 Found error data in error.details:', errorData);
    } else if (error?.cause?.details) {
      // Wagmi cause details
      errorData = error.cause.details;
      console.log('📍 Found error data in error.cause.details:', errorData);
    } else if (error?.shortMessage && error.shortMessage.includes('0x')) {
      // Wagmi shortMessage sometimes contains hex data
      const match = error.shortMessage.match(/(0x[a-fA-F0-9]{8,})/);
      if (match) {
        errorData = match[1];
        console.log('📍 Found error data in shortMessage:', errorData);
      }
    } else if (error?.metaMessages && Array.isArray(error.metaMessages)) {
      // Check wagmi metaMessages for error data
      console.log('🔍 Inspecting metaMessages array:', error.metaMessages);
      for (let i = 0; i < error.metaMessages.length; i++) {
        const metaMessage = error.metaMessages[i];
        console.log(`🔍 metaMessage[${i}]:`, typeof metaMessage, metaMessage);
        
        if (typeof metaMessage === 'string') {
          // Look for the specific error signature pattern first
          if (metaMessage.includes('0xfb8f41b2')) {
            const match = metaMessage.match(/(0xfb8f41b2[a-fA-F0-9]*)/);
            if (match) {
              errorData = match[1];
              console.log('📍 Found InsufficientSYBalance error in metaMessages:', errorData);
              break;
            }
          }
          // Look for any long hex string that could be error data (not just addresses)
          else if (metaMessage.includes('0x')) {
            const matches = metaMessage.match(/(0x[a-fA-F0-9]{66,})/g); // 66+ chars = signature + data
            if (matches && matches.length > 0) {
              errorData = matches[0];
              console.log('📍 Found long hex data in metaMessages:', errorData);
              break;
            }
            // Fallback to any hex (but prefer longer ones)
            const anyHex = metaMessage.match(/(0x[a-fA-F0-9]{8,})/);
            if (anyHex && !errorData) {
              errorData = anyHex[1];
              console.log('📍 Found hex data in metaMessages (fallback):', errorData);
            }
          }
        }
      }
    } else if (error?.reason && error.reason.includes('0x')) {
      // Fallback: reason field
      const match = error.reason.match(/(0x[a-fA-F0-9]{8,})/);
      if (match) {
        errorData = match[1];
        console.log('📍 Found error data in error.reason:', errorData);
      }
    } else if (error?.message && error.message.includes('0x')) {
      // Fallback: message field
      const match = error.message.match(/(0x[a-fA-F0-9]{8,})/);
      if (match) {
        errorData = match[1];
        console.log('📍 Found error data in error.message:', errorData);
      }
    }

    if (!errorData) {
      // console.warn('❌ ErrorDecoder: No error data found');
      // console.warn('Available error keys:', Object.keys(error || {}));
      // console.warn('Full error JSON:', JSON.stringify(error, null, 2));
      return null;
    }

    // console.log('✅ ErrorDecoder: Extracted error data:', errorData);
    // console.log('✅ ErrorDecoder: Error data length:', errorData.length);
    // console.log('✅ ErrorDecoder: First 10 chars:', errorData.substring(0, 10));
    
    // // Check if we accidentally extracted a contract address instead of error data
    // if (errorData.length === 42 && errorData.startsWith('0x')) {
    //   console.warn('⚠️ ErrorDecoder: Extracted data looks like a contract address, not error data!');
    //   console.warn('⚠️ This suggests the error structure is different than expected');
    //   console.warn('⚠️ Expected: 0xfb8f41b2... (error signature + data)');
    //   console.warn('⚠️ Got:', errorData);
    // }

    const decoded = this.decodeError(errorData);
    if (!decoded) {
      // console.warn('❌ ErrorDecoder: Failed to decode error data');
      return null;
    }

    console.log('✅ ErrorDecoder: Successfully decoded:', decoded);

    return {
      errorName: decoded.name,
      errorMessage: this.getErrorMessage(decoded.name),
      signature: decoded.signature,
      rawData: errorData
    };
  }

  /**
   * Add a new error signature to the mapping (for development/debugging)
   */
  static addErrorSignature(signature: string, errorName: string): void {
    (this.ERROR_SIGNATURES as any)[signature] = errorName;
    console.log(`📝 Added new error signature: ${signature} -> ${errorName}`);
  }

  /**
   * Log unknown error signature for future mapping
   */
  static logUnknownError(signature: string, rawData: string): void {
    console.warn(`❓ Unknown error signature encountered:`);
    console.warn(`  Signature: ${signature}`);
    console.warn(`  Raw Data: ${rawData}`);
    console.warn(`  Add to ERROR_SIGNATURES mapping: '${signature}': 'YourErrorName'`);
  }

  /**
   * Manual test function - call this from browser console
   */
  static testWithKnownError(): void {
    console.log('🧪 Testing ErrorDecoder with known InsufficientSYBalance error...');
    
    // Test with the exact error signature from Hardhat
    const testError = {
      data: '0xfb8f41b2000000000000000000000000cf7ed3acca5a467e9e704c703e8d87f634fb0fc900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008ac7230489e80000'
    };
    
    console.log('Testing with error.data structure...');
    const result1 = this.extractErrorFromException(testError);
    console.log('Result 1:', result1);
    
    // Test with wagmi-style structure
    const wagmiError = {
      name: 'ContractFunctionExecutionError',
      cause: {
        name: 'ContractFunctionRevertedError',
        data: '0xfb8f41b2000000000000000000000000cf7ed3acca5a467e9e704c703e8d87f634fb0fc900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008ac7230489e80000'
      }
    };
    
    console.log('Testing with wagmi error.cause.data structure...');
    const result2 = this.extractErrorFromException(wagmiError);
    console.log('Result 2:', result2);
    
    // Test signature generation
    const generatedSig = this.generateErrorSignature('InsufficientSYBalance');
    console.log('Generated signature for InsufficientSYBalance:', generatedSig);
    console.log('Expected signature: 0xfb8f41b2');
    console.log('Signatures match:', generatedSig === '0xfb8f41b2');
  }

  /**
   * Generate and log correct error signatures for known errors (development helper)
   */
  static generateKnownErrorSignatures(): void {
    const knownErrors = [
      'SYTokenDoesNotExist',
      'SYTokenHasMatured',
      'InsufficientSYBalance',
      'TokenPairDoesNotExist',
      'MaturityTooSoon',
      'MaturityTooFar',
      'MaturityAlreadyExists',
      'InvalidUnderlyingToken',
      'InsufficientPTBalance',
      'InsufficientYTBalance',
      'NoMaturityOptionsAvailable',
      'NoValidMaturityOptionsAvailable',
      'PTTokenHasNotMatured',
      'NoPTTokensToRedeem',
      'YTTokenHasExpired',
      'NoYieldToClaim',
      'MaturityMustBeInFuture',
      'AmountMustBeGreaterThanZero',
      'TokenHasMatured',
      'OnlyFactoryCanCall',
      'InsufficientBalance',
      'TokenHasNotMaturedYet',
      'InvalidSYTokenAddress',
      'RedemptionNotEnabled',
      'TokenHasExpired',
      'InsufficientFee'
    ];

    console.log('🔧 Correct Error Signatures:');
    knownErrors.forEach(errorName => {
      const signature = this.generateErrorSignature(errorName);
      console.log(`  '${signature}': '${errorName}',`);
    });
  }

  /**
   * Test if our known error signature is correct
   */
  static testKnownSignature(): void {
    const actualSignature = '0xfb8f41b2'; // From the transaction
    const calculatedSignature = this.generateErrorSignature('InsufficientSYBalance');
    
    console.log('🧪 Testing known error signature:');
    console.log(`  Actual from transaction: ${actualSignature}`);
    console.log(`  Calculated for 'InsufficientSYBalance': ${calculatedSignature}`);
    console.log(`  Match: ${actualSignature === calculatedSignature ? '✅ YES' : '❌ NO'}`);
    
    if (actualSignature !== calculatedSignature) {
      console.warn('⚠️ Signature mismatch! The error might have a different name.');
    }
  }
}
