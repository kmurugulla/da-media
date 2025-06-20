/**
 * Utility functions for DA Media Library API
 * Centralized utilities to eliminate code duplication
 */

// Configuration constants
export const CONFIG = {
  CACHE_TTL: {
    ANALYSIS: 24 * 60 * 60, // 24 hours in seconds
    IMAGES: 5 * 60, // 5 minutes in seconds
    RATE_LIMIT: 60 * 60, // 1 hour in seconds
  },
  LIMITS: {
    RATE_LIMIT_MAX: 50,
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 200,
  },
  PREFIXES: {
    IMAGE: 'image:',
    ANALYSIS: 'analysis:',
    RATE_LIMIT: 'rate:',
  },
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
  },
};

// Centralized CORS headers
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Common response headers
export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  ...CORS_HEADERS,
};

// CORS preflight handler
export function handleCORSPreflight() {
  return new Response(null, {
    status: CONFIG.HTTP_STATUS.OK,
    headers: CORS_HEADERS,
  });
}

// Standardized success response
export function createSuccessResponse(data, options = {}) {
  const { status = CONFIG.HTTP_STATUS.OK, headers = {}, cache = false } = options;

  const responseHeaders = {
    ...JSON_HEADERS,
    ...headers,
  };

  if (cache && typeof cache === 'number') {
    responseHeaders['Cache-Control'] = `public, max-age=${cache}`;
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

// Standardized error response
export function createErrorResponse(error, options = {}) {
  const {
    status = CONFIG.HTTP_STATUS.INTERNAL_ERROR,
    message = 'Internal server error',
    headers = {},
    includeStack = false,
  } = options;

  const errorData = {
    error: message,
    message: error.message || error,
    timestamp: new Date().toISOString(),
  };

  if (includeStack && error.stack) {
    errorData.stack = error.stack;
  }

  return new Response(JSON.stringify(errorData), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}

// Method validation middleware
export function validateMethod(request, allowedMethods) {
  if (!allowedMethods.includes(request.method)) {
    throw new Error(`Method ${request.method} not allowed. Allowed: ${allowedMethods.join(', ')}`);
  }
}

// Rate limiting utility
export async function checkRateLimit(request, env, key = null) {
  if (!env.DA_MEDIA_KV) return true;

  const rateLimitKey = key || `${CONFIG.PREFIXES.RATE_LIMIT}${request.headers.get('CF-Connecting-IP') || 'unknown'}`;
  const currentCount = await env.DA_MEDIA_KV.get(rateLimitKey) || '0';

  if (parseInt(currentCount, 10) > CONFIG.LIMITS.RATE_LIMIT_MAX) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  await env.DA_MEDIA_KV.put(
    rateLimitKey,
    (parseInt(currentCount, 10) + 1).toString(),
    { expirationTtl: CONFIG.CACHE_TTL.RATE_LIMIT },
  );

  return true;
}

// Cache key generators
export function generateCacheKey(type, identifier) {
  const prefix = CONFIG.PREFIXES[type.toUpperCase()];
  if (!prefix) {
    throw new Error(`Unknown cache type: ${type}`);
  }
  return `${prefix}${identifier}`;
}

// URL validation utility
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// File size formatter
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

/**
 * Async error wrapper for handlers
 */
export function asyncHandler(fn) {
  return async (request, env, ...args) => {
    // Handle CORS preflight requests FIRST, before any other processing
    if (request.method === 'OPTIONS') {
      return handleCORSPreflight();
    }

    try {
      return await fn(request, env, ...args);
    } catch (error) {
      let status = CONFIG.HTTP_STATUS.INTERNAL_ERROR;
      let message = 'Internal server error';

      if (error.message.includes('not allowed')) {
        status = CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED;
        message = 'Method not allowed';
      } else if (error.message.includes('Rate limit')) {
        status = CONFIG.HTTP_STATUS.RATE_LIMITED;
        message = 'Rate limit exceeded';
        return createErrorResponse(error, {
          status,
          message,
          headers: { 'Retry-After': '3600' },
        });
      } else if (error.message.includes('required') || error.message.includes('invalid')) {
        status = CONFIG.HTTP_STATUS.BAD_REQUEST;
        message = 'Bad request';
      }

      return createErrorResponse(error, { status, message });
    }
  };
}

// Pagination utility
export function parsePaginationParams(url) {
  const page = parseInt(url.searchParams.get('page'), 10) || 1;
  const limit = Math.min(
    parseInt(url.searchParams.get('limit'), 10) || CONFIG.LIMITS.DEFAULT_PAGE_SIZE,
    CONFIG.LIMITS.MAX_PAGE_SIZE,
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

// Response timing utility
export function withTiming(response, startTime) {
  const duration = Date.now() - startTime;
  response.headers.set('X-Response-Time', `${duration}ms`);
  return response;
}

/**
 * Logging utility with structured format
 */
export function logRequest() {
  // const { method, url } = request;
  // const timestamp = new Date().toISOString();

  // Structured logging - can be connected to external logging service
  // const logData = {
  //   timestamp,
  //   method,
  //   url: url.toString(),
  //   ...context,
  // };

  // Remove console.log as requested - replace with proper logging service integration
  // console.log(JSON.stringify(logData));
}
