/**
 * DA Media Library Configuration
 * Centralized configuration for API endpoints and settings
 */

// Environment detection
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('localhost');

// API Configuration
export const CONFIG = {
  // API Endpoints
  API: {
    // 🚀 REPLACE THIS WITH YOUR ACTUAL CLOUDFLARE WORKER URL
    // After running 'npx wrangler deploy', update this URL
    CLOUDFLARE_WORKER: 'https://da-media-library.adobeaem.workers.dev',
    
    // Local development endpoint (fallback)
    LOCAL_WORKER: 'http://localhost:8787',
    
    // Get the appropriate endpoint based on environment
    get BASE_URL() {
      // You can override this by setting a global variable
      if (window.DA_MEDIA_API_OVERRIDE) {
        return window.DA_MEDIA_API_OVERRIDE;
      }
      
      // Auto-detect local vs deployed for testing
      return isLocalDevelopment ? this.LOCAL_WORKER : this.CLOUDFLARE_WORKER;
    }
  },
  
  // Cache settings
  CACHE: {
    ANALYZED_IMAGES_TTL: 5 * 60 * 1000, // 5 minutes
    EXTERNAL_ASSETS_TTL: 10 * 60 * 1000, // 10 minutes
  },
  
  // Feature flags
  FEATURES: {
    ENABLE_EXTERNAL_ASSETS: true,
    ENABLE_AI_RECOMMENDATIONS: true,
    ENABLE_QUALITY_FILTERING: true,
  }
};

// Helper function to get API endpoint
export function getApiEndpoint() {
  return CONFIG.API.BASE_URL;
}

// Helper function to override API endpoint (useful for testing)
export function setApiEndpoint(url) {
  window.DA_MEDIA_API_OVERRIDE = url;
  console.log(`🔧 API endpoint overridden to: ${url}`);
}

// Helper function to switch to local development
export function useLocalEndpoint() {
  setApiEndpoint(CONFIG.API.LOCAL_WORKER);
}

// Helper function to switch to deployed endpoint
export function useDeployedEndpoint() {
  setApiEndpoint(CONFIG.API.CLOUDFLARE_WORKER);
}

// Configuration loaded

// 🔧 DEBUGGING: Add these functions to window for easy testing
if (typeof window !== 'undefined') {
  window.DAMediaConfig = {
    setApiEndpoint,
    useLocalEndpoint,
    useDeployedEndpoint,
    getCurrentEndpoint: () => CONFIG.API.BASE_URL
  };
} 