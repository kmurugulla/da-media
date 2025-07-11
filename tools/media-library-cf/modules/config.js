/**
 * DA Media Library Configuration
 * Centralized configuration for API endpoints and settings
 */

// Environment detection
const isLocalDevelopment = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1'
  || window.location.hostname.includes('localhost');

// API Configuration
const CONFIG = {
  // API Endpoints
  API: {
    // 🚀 REPLACE THIS WITH YOUR ACTUAL CLOUDFLARE WORKER URL
    // After running 'npx wrangler deploy', update this URL
    CLOUDFLARE_WORKER: 'https://da-media-library.adobeaem.workers.dev',

    // Local development endpoints
    LOCAL_WORKER: 'http://localhost:8787',
    LOCAL_WORKER_ALT: 'http://localhost:8788', // Alternative local port

    // Remote development (wrangler dev --remote gives temporary URLs)
    // Check the wrangler output for the actual URL when using remote mode
    REMOTE_DEV: 'https://da-media-api-gateway.murugull.workers.dev', // Your deployed worker

    // Get the appropriate endpoint based on environment
    get BASE_URL() {
      // You can override this by setting a global variable
      if (window.DA_MEDIA_API_OVERRIDE) {
        return window.DA_MEDIA_API_OVERRIDE;
      }

      // For local development, try different options
      if (isLocalDevelopment) {
        // Check if user wants to use remote development
        if (window.localStorage.getItem('da-media-use-remote') === 'true') {
          return this.REMOTE_DEV;
        }

        // Default to local development
        return this.LOCAL_WORKER;
      }

      // Production uses deployed worker
      return this.CLOUDFLARE_WORKER;
    },

    DEPLOYED: 'https://da-media-api-gateway.murugull.workers.dev',
  },

  // Cache settings
  CACHE: {
    TTL: 5 * 60 * 1000,
    PREFIX: 'da_media_',
  },

  // Feature flags
  FEATURES: {
    ENABLE_EXTERNAL_ASSETS: true,
    ENABLE_AI_RECOMMENDATIONS: true,
    ENABLE_QUALITY_FILTERING: true,
  },

  SEARCH: {
    MIN_QUERY_LENGTH: 2,
    DEBOUNCE_DELAY: 300,
  },

  UI: {
    ASSETS_PER_PAGE: 50,
    PREVIEW_SIZES: {
      THUMBNAIL: 150,
      MEDIUM: 300,
      LARGE: 600,
    },
  },
};

// Helper function to get API endpoint
function getApiEndpoint() {
  return CONFIG.API.BASE_URL;
}

// Helper function to override API endpoint (useful for testing)
function setApiEndpoint(url) {
  window.DA_MEDIA_API_OVERRIDE = url;
}

// Helper function to switch to local development
function useLocalEndpoint() {
  window.localStorage.removeItem('da-media-use-remote');
  delete window.DA_MEDIA_API_OVERRIDE;
}

// Helper function to switch to remote development (with production data)
function useRemoteEndpoint() {
  window.localStorage.setItem('da-media-use-remote', 'true');
  delete window.DA_MEDIA_API_OVERRIDE;
}

// Helper function to switch to deployed endpoint
function useDeployedEndpoint() {
  setApiEndpoint(CONFIG.API.DEPLOYED);
}

// Configuration loaded

// 🔧 DEBUGGING: Add these functions to window for easy testing
if (typeof window !== 'undefined') {
  window.DAMediaConfig = {
    override: setApiEndpoint,
    local: useLocalEndpoint,
    remote: useRemoteEndpoint,
    deployed: useDeployedEndpoint,
    getCurrentEndpoint: () => CONFIG.API.BASE_URL,
  };
}

function getCurrentDocumentPath() {
  const path = window.location.pathname;
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function normalizeDocumentPath(path) {
  if (!path) return '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getFromCache(key, maxAge = CONFIG.CACHE.TTL) {
  try {
    const item = localStorage.getItem(`${CONFIG.CACHE.PREFIX}${key}`);
    if (!item) return null;

    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > maxAge) {
      localStorage.removeItem(`${CONFIG.CACHE.PREFIX}${key}`);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function setCache(key, data) {
  try {
    const item = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(`${CONFIG.CACHE.PREFIX}${key}`, JSON.stringify(item));
  } catch {
    // Ignore cache errors
  }
}

export {
  CONFIG,
  getApiEndpoint,
  setApiEndpoint,
  useLocalEndpoint,
  useRemoteEndpoint,
  useDeployedEndpoint,
  getCurrentDocumentPath,
  normalizeDocumentPath,
  getFromCache,
  setCache,
};
