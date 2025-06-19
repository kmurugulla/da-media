/**
 * DA Media Library API Gateway Worker - Clean Refactored Version
 * Uses router architecture with essential handlers inline for immediate deployment
 */

import {
  CORS_HEADERS,
  JSON_HEADERS,
  CONFIG,
  createSuccessResponse,
  createErrorResponse,
  handleCORSPreflight,
  validateMethod,
  checkRateLimit,
  generateCacheKey,
  formatFileSize,
  logRequest,
  asyncHandler,
} from './utils.js';
import { APIRouter } from './router.js';
import { handleHealthCheck } from './handlers/health.js';
import { handleGetImages, handleGetHighQualityImages } from './handlers/images.js';
import { handleGetExternalAssets, handleCleanJunkAssets } from './handlers/external-assets.js';
import {
  handleCleanupPreview,
  handleCleanJunkAssets as handleCleanupJunkAssets,
  handleCleanLowQuality,
  handleCleanDuplicates,
  handleCleanupAnalytics,
} from './handlers/cleanup.js';
import {
  handleContextAnalysis,
  handlePersonalizedRecommendations,
} from './handlers/context-analysis.js';
import { handlePreviewContentScan } from './handlers/preview-scan.js';

// Create router instance
const router = new APIRouter();

// Add CORS middleware
router.use(async (request, env, ctx) => {
  if (request.method === 'OPTIONS') {
    return handleCORSPreflight();
  }
  return null; // Continue to next middleware/handler
});

/**
 * Add logging middleware
 */
router.use(async (request, env, ctx) => {
  const start = Date.now();
  const { method } = request;
  const { pathname } = new URL(request.url);

  return null;
});

// ============================================================================
// ESSENTIAL HANDLERS (Inline for immediate deployment)
// These will be gradually moved to separate files
// ============================================================================

// Generate deterministic hash ID from URL using 12-character hex for multi-million asset capacity
function generateHashId(url) {
  // Enhanced hash function for better distribution and collision resistance
  const str = url.toLowerCase().trim();
  let hash1 = 5381;
  let hash2 = 5381;
  let hash3 = 5381;

  // Triple DJB2 hash algorithm for maximum entropy
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) + char;
    hash2 = ((hash2 << 3) + hash2) ^ char;
    hash3 = ((hash3 << 7) + hash3) + (char * 31);
  }

  // Combine all three hashes for maximum collision resistance
  const combined1 = Math.abs(hash1 ^ hash2);
  const combined2 = Math.abs(hash2 ^ hash3);
  const combined3 = Math.abs(hash1 ^ hash3);

  // Generate 12-character hex ID for multi-million asset capacity
  const part1 = combined1.toString(16).padStart(4, '0').substring(0, 4);
  const part2 = combined2.toString(16).padStart(4, '0').substring(0, 4);
  const part3 = combined3.toString(16).padStart(4, '0').substring(0, 4);

  return `${part1}${part2}${part3}`;
}

// Fast analyzed images endpoint - optimized for performance
async function handleAnalyzedImagesFast(request, env) {
  validateMethod(request, ['GET']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });

    // Load all images in parallel for better performance
    const imagePromises = keys.map((key) => env.DA_MEDIA_KV.get(key.name, 'json'));

    const imageResults = await Promise.all(imagePromises);
    const allImages = imageResults.filter((img) => img !== null);

    const deduplicatedImages = deduplicateImagesByQuality(allImages);

    return createSuccessResponse({
      images: deduplicatedImages,
      total: deduplicatedImages.length,
      totalBeforeDeduplication: allImages.length,
      timestamp: new Date().toISOString(),
    }, {
      cache: CONFIG.CACHE_TTL.IMAGES,
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to load analyzed images',
    });
  }
}

// Deduplicate images by displayName, prioritizing higher quality URLs
function deduplicateImagesByQuality(images) {
  const imageMap = new Map();

  for (const image of images) {
    const key = image.displayName || image.id;
    const existing = imageMap.get(key);

    if (!existing || shouldReplaceImageForQuality(existing, image)) {
      imageMap.set(key, image);
    }
  }

  return Array.from(imageMap.values());
}

// Determine if candidate image should replace existing based on quality
function shouldReplaceImageForQuality(existing, candidate) {
  const existingScore = getImageUrlQualityScore(existing.src);
  const candidateScore = getImageUrlQualityScore(candidate.src);

  if (candidateScore > existingScore) {
    return true;
  }

  return false;
}

// Calculate quality score for image URL
function getImageUrlQualityScore(src) {
  if (!src) return 0;

  let score = 0;

  // Domain-based scoring (higher is better)
  if (src.includes('dish.scene7.com/is/image/dishenterprise/')) {
    score += 100; // Highest quality - Scene7 enterprise
  } else if (src.includes('dish.scene7.com/is/image/sling/')) {
    score += 80; // High quality - Scene7 sling
  } else if (src.includes('dish.scene7.com')) {
    score += 70; // Good quality - Scene7 generic
  } else if (src.includes('cdn.sling.com')) {
    score += 60; // Medium quality - Sling CDN
  } else if (src.includes('assets.sling.tv')) {
    score += 50; // Lower quality - Assets domain
  } else if (src.includes('main--da-media--')) {
    score += 90; // High quality - DA Media
  } else if (src.startsWith('http')) {
    score += 30; // Basic external URL
  } else {
    score += 10; // Relative or unknown URL
  }

  // Parameter-based scoring
  if (src.includes('$transparent-png-desktop$')) {
    score += 20; // High quality preset
  } else if (src.includes('format=webp')) {
    score += 15; // Modern format
  } else if (src.includes('optimize=medium')) {
    score += 10; // Optimized
  }

  // Avoid placeholder/fake URLs
  if (src.includes('example.com') || src.includes('placeholder')) {
    score -= 50;
  }

  return score;
}

// External assets endpoint
async function handleExternalAssets(request, env) {
  validateMethod(request, ['GET']);

  const url = new URL(request.url);
  const site = url.searchParams.get('site');
  const org = url.searchParams.get('org');

  if (!site || !org) {
    return createErrorResponse('Missing required parameters: site and org', {
      status: CONFIG.HTTP_STATUS.BAD_REQUEST,
    });
  }

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const externalAssets = [];
    const groupedByDomain = {};

    // Process images in parallel
    const imagePromises = keys.map((key) => env.DA_MEDIA_KV.get(key.name, 'json'));
    const images = await Promise.all(imagePromises);

    for (const image of images) {
      if (!image || !image.src) continue;

      const isExternal = isExternalAsset(image.src, { site, org });
      if (isExternal) {
        const domain = extractDomain(image.src);
        const category = categorizeAssetDomain(domain);

        const assetInfo = {
          ...image,
          domain,
          category,
          migrationPriority: calculateMigrationPriority(domain, category),
          estimatedSavings: calculateEstimatedSavings(image),
        };

        externalAssets.push(assetInfo);

        if (!groupedByDomain[domain]) {
          groupedByDomain[domain] = [];
        }
        groupedByDomain[domain].push(assetInfo);
      }
    }

    const summary = {
      totalExternal: externalAssets.length,
      domains: Object.keys(groupedByDomain).length,
      highPriority: externalAssets.filter((asset) => asset.migrationPriority === 'high').length,
      estimatedTotalSavings: externalAssets.reduce((sum, asset) => sum + (asset.estimatedSavings || 0), 0),
    };

    return createSuccessResponse({
      success: true,
      summary,
      externalAssets,
      groupedByDomain,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to fetch external assets',
    });
  }
}

// Helper functions for external assets
function isExternalAsset(src, pageContext) {
  if (!src) return false;

  const domain = extractDomain(src);
  const siteDomain = pageContext.site ? `${pageContext.site}--${pageContext.org}` : null;

  return domain && !domain.includes(siteDomain);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function categorizeAssetDomain(domain) {
  if (!domain) return 'unknown';

  if (domain.includes('scene7.com')) return 'scene7';
  if (domain.includes('sling.com') || domain.includes('sling.tv')) return 'sling';
  if (domain.includes('dish.com')) return 'dish';
  if (domain.includes('cdn.')) return 'cdn';

  return 'other';
}

function calculateMigrationPriority(domain, category) {
  if (category === 'scene7') return 'high';
  if (category === 'sling' || category === 'dish') return 'medium';
  return 'low';
}

function calculateEstimatedSavings(imageData) {
  // Simple estimation based on file size and usage
  const baseSize = imageData.fileSize || 50000; // 50KB default
  const usageCount = imageData.usageCount || 1;
  return Math.floor(baseSize * usageCount * 0.1); // 10% savings estimate
}

/**
 * Handle internal assets request - returns assets that are NOT external
 */
async function handleInternalAssets(request, env) {
  validateMethod(request, ['GET']);

  const url = new URL(request.url);
  const org = url.searchParams.get('org') || 'da-sites';
  const repo = url.searchParams.get('repo') || 'da-media';

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const internalAssets = [];

    // Process images in parallel
    const imagePromises = keys.map((key) => env.DA_MEDIA_KV.get(key.name, 'json'));
    const images = await Promise.all(imagePromises);

    for (const image of images) {
      if (!image || !image.src) continue;

      const isExternal = isExternalAsset(image.src, { site: repo, org });
      if (!isExternal) {
        // This is an internal asset
        const assetInfo = {
          id: image.id,
          name: image.displayName || extractFilenameFromUrl(image.src),
          path: image.path || `/${image.displayName || 'asset'}`,
          url: image.src,
          type: getAssetTypeFromUrl(image.src),
          size: image.fileSize || null,
          lastModified: image.lastSeen || new Date().toISOString(),
          altText: image.displayName || extractFilenameFromUrl(image.src),
          dimensions: image.dimensions || null,
        };

        internalAssets.push(assetInfo);
      }
    }

    return createSuccessResponse({
      assets: internalAssets,
      total: internalAssets.length,
      page: 1,
      limit: 50,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to fetch internal assets',
    });
  }
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url) {
  if (!url) return 'Unknown';
  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop() || 'Unknown';
    return filename.split('?')[0]; // Remove query parameters
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get asset type from URL
 */
function getAssetTypeFromUrl(url) {
  if (!url) return 'unknown';

  const filename = extractFilenameFromUrl(url);
  const ext = filename.toLowerCase().split('.').pop();

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
    return 'video';
  }
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
    return 'document';
  }

  return 'unknown';
}

// ============================================================================
// ROUTE CONFIGURATION
// ============================================================================

// Debug endpoint for KV inspection
async function handleDebugKV(request, env) {
  validateMethod(request, ['GET']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const prefix = url.searchParams.get('prefix') || 'image:';
    const limit = parseInt(url.searchParams.get('limit') || '10');

    if (key) {
      // Get specific key
      const fullKey = key.startsWith('image:') ? key : `image:${key}`;
      const data = await env.DA_MEDIA_KV.get(fullKey, 'json');

      if (!data) {
        return createErrorResponse(`Key not found: ${fullKey}`, {
          status: CONFIG.HTTP_STATUS.NOT_FOUND,
        });
      }

      return createSuccessResponse({
        key: fullKey,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    // List keys with prefix - check both org-aware and legacy
    let keys = [];

    if (prefix === 'image:') {
      // For image prefix, check org-aware keys first
      const orgKeys = await env.DA_MEDIA_KV.list({ prefix: 'org:', limit: limit * 2 });
      const imageKeys = orgKeys.keys.filter((key) => key.name.includes(':image:'));

      if (imageKeys.length > 0) {
        keys = imageKeys.slice(0, limit);
      } else {
        // Fallback to legacy keys
        const legacyKeys = await env.DA_MEDIA_KV.list({ prefix, limit });
        keys = legacyKeys.keys;
      }
    } else {
      // For other prefixes, use as-is
      const result = await env.DA_MEDIA_KV.list({ prefix, limit });
      keys = result.keys;
    }

    // Get sample data for first few keys
    const samplePromises = keys.slice(0, 5).map(async (keyInfo) => {
      const data = await env.DA_MEDIA_KV.get(keyInfo.name, 'json');
      return {
        key: keyInfo.name,
        id: data?.id,
        src: data?.src,
        displayName: data?.displayName,
        isExternal: data?.isExternal,
        sourceType: data?.sourceType || 'unknown',
      };
    });

    const sampleData = await Promise.all(samplePromises);

    return createSuccessResponse({
      totalKeys: keys.length,
      prefix,
      keys: keys.map((k) => k.name),
      sampleData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Debug KV failed:', error);
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to inspect KV storage',
    });
  }
}

// Health endpoint
router.get('/health', asyncHandler(handleHealthCheck));

// Debug endpoint
router.get('/api/debug/kv', asyncHandler(handleDebugKV));

// Image endpoints with improved naming and quality filtering
router.get('/api/images', asyncHandler(handleGetImages));
router.get('/api/images/high-quality', asyncHandler(handleGetHighQualityImages));

// External assets with improved data quality
router.get('/api/external-assets', asyncHandler(handleGetExternalAssets));
router.post('/api/external-assets/cleanup', asyncHandler(handleCleanJunkAssets));

// Phase 4: Comprehensive Data Cleanup Endpoints
router.post('/api/cleanup/preview', asyncHandler(handleCleanupPreview));
router.post('/api/cleanup/junk-assets', asyncHandler(handleCleanupJunkAssets));
router.post('/api/cleanup/low-quality', asyncHandler(handleCleanLowQuality));
router.post('/api/cleanup/duplicates', asyncHandler(handleCleanDuplicates));
router.get('/api/cleanup/analytics', asyncHandler(handleCleanupAnalytics));

// AI-Powered Context Analysis & Predictive Recommendations
router.post('/api/analyze-context', asyncHandler(handleContextAnalysis));
router.post('/api/personalized-recommendations', asyncHandler(handlePersonalizedRecommendations));

// Legacy endpoint (deprecated but maintained for backwards compatibility)
router.get('/api/analyzed-images-fast', asyncHandler(handleAnalyzedImagesFast));

// Placeholder endpoints that return "coming soon" messages
const comingSoonHandler = (endpointName) => async (request, env) => createSuccessResponse({
  message: `${endpointName} endpoint - refactoring in progress`,
  status: 'coming_soon',
  originalEndpoint: endpointName,
  timestamp: new Date().toISOString(),
});

// Internal assets endpoint
router.get('/api/assets', asyncHandler(handleInternalAssets));
router.get('/api/search', asyncHandler(comingSoonHandler('Search')));
router.post('/api/analyze', asyncHandler(comingSoonHandler('Analyze')));
router.post('/api/track-usage', asyncHandler(comingSoonHandler('Usage Tracking - Future User Analytics')));

router.get('/api/usage-analytics', asyncHandler(comingSoonHandler('Usage Analytics - User Behavior Insights')));
router.post('/api/da-webhook', asyncHandler(comingSoonHandler('DA Webhook')));
router.post('/api/analyze-image', asyncHandler(comingSoonHandler('Image Analysis')));
router.post('/api/upload-image', asyncHandler(comingSoonHandler('Image Upload')));
router.post('/api/scan-preview-content', asyncHandler(handlePreviewContentScan));
router.get('/api/test-responsive-extraction', asyncHandler(comingSoonHandler('Responsive Extraction Test')));
router.get('/api/analyzed-images', asyncHandler(comingSoonHandler('Analyzed Images')));
router.delete('/api/analyzed-images/{id}', asyncHandler(comingSoonHandler('Delete Images')));
router.get('/api/get-analysis/*', asyncHandler(comingSoonHandler('Get Analysis')));
router.post('/api/migrate-ids', asyncHandler(comingSoonHandler('Migrate IDs')));
router.post('/api/migrate-to-12char', asyncHandler(comingSoonHandler('Migrate to 12-char')));
router.get('/api/migration-candidates', asyncHandler(comingSoonHandler('Migration Candidates')));
router.post('/api/import-external-asset', asyncHandler(comingSoonHandler('Import External Asset')));

// ============================================================================
// MAIN WORKER EXPORT
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();

    try {
      const response = await router.handle(request, env, ctx);

      const duration = Date.now() - startTime;
      response.headers.set('X-Response-Time', `${duration}ms`);

      return response;
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }
  },
};

// Export router for testing
export { router };
