/**
 * Images Handler Module
 * Handles all image-related API endpoints with improved naming and data quality
 */

import { 
  validateMethod, 
  createSuccessResponse, 
  createErrorResponse, 
  CONFIG 
} from '../utils.js';

/**
 * Get all images from the media library with quality filtering
 */
export async function handleGetImages(request, env) {
  validateMethod(request, ['GET']);
  
  const url = new URL(request.url);
  const includeExternal = url.searchParams.get('includeExternal') === 'true' || url.searchParams.get('include_external') === 'true';
  const qualityFilter = url.searchParams.get('quality') || 'all'; // all, high, medium, low
  const priority = url.searchParams.get('priority'); // 'ai-recommended', 'high-priority'
  const context = url.searchParams.get('context'); // document context for AI recommendations
  const limit = parseInt(url.searchParams.get('limit')) || CONFIG.LIMITS.DEFAULT_PAGE_SIZE;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', { 
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR 
      });
    }

    // Try org-aware keys first, then fallback to legacy keys
    let keys = [];
    
    // Try to get org-aware keys (org:*:site:*:image:*)
    const orgKeys = await env.DA_MEDIA_KV.list({ prefix: 'org:' });
    const imageKeys = orgKeys.keys.filter(key => key.name.includes(':image:'));
    
    if (imageKeys.length > 0) {
      keys = imageKeys;
    } else {
      // Fallback to legacy keys
      const legacyKeys = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
      keys = legacyKeys.keys;
    }
    
    const imagePromises = keys.map(key => 
      env.DA_MEDIA_KV.get(key.name, 'json')
    );
    
    const imageResults = await Promise.all(imagePromises);
    let allImages = imageResults.filter(img => img !== null);

    const qualityStats = {
      total: allImages.length,
      beforeFiltering: allImages.length
    };

    if (!includeExternal) {
      allImages = allImages.filter(img => !isExternalAsset(img.src));
      qualityStats.externalFiltered = qualityStats.beforeFiltering - allImages.length;
    }

    allImages = filterByQuality(allImages, qualityFilter);
    qualityStats.afterQualityFilter = allImages.length;

    // Apply AI-powered priority filtering if requested
    if (priority) {
      allImages = await applyPriorityFiltering(allImages, priority, context, env);
      qualityStats.afterPriorityFilter = allImages.length;
    }

    const deduplicatedImages = deduplicateImagesByQuality(allImages);
    qualityStats.afterDeduplication = deduplicatedImages.length;

    const paginatedImages = deduplicatedImages.slice(offset, offset + limit);

    return createSuccessResponse({
      images: paginatedImages,
      pagination: {
        total: deduplicatedImages.length,
        limit,
        offset,
        hasMore: offset + limit < deduplicatedImages.length
      },
      qualityStats,
      filters: {
        includeExternal,
        qualityFilter,
        priority,
        context
      },
      timestamp: new Date().toISOString()
    }, { 
      cache: CONFIG.CACHE_TTL.IMAGES,
      headers: { 'X-Cache': 'MISS' }
    });

  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to load images'
    });
  }
}

/**
 * Get high-quality images only (replacement for analyzed-images-fast)
 */
export async function handleGetHighQualityImages(request, env) {
  validateMethod(request, ['GET']);
  
  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', { 
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR 
      });
    }

    // Try org-aware keys first, then fallback to legacy keys
    let keys = [];
    
    // Try to get org-aware keys (org:*:site:*:image:*)
    const orgKeys = await env.DA_MEDIA_KV.list({ prefix: 'org:' });
    const imageKeys = orgKeys.keys.filter(key => key.name.includes(':image:'));
    
    if (imageKeys.length > 0) {
      keys = imageKeys;
    } else {
      // Fallback to legacy keys
      const legacyKeys = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
      keys = legacyKeys.keys;
    }
    
    const imagePromises = keys.map(key => 
      env.DA_MEDIA_KV.get(key.name, 'json')
    );
    
    const imageResults = await Promise.all(imagePromises);
    const allImages = imageResults.filter(img => img !== null);

    const highQualityImages = allImages.filter(img => {
      const qualityScore = getImageQualityScore(img.src);
      return qualityScore >= 70 && !isJunkAsset(img);
    });

    const deduplicatedImages = deduplicateImagesByQuality(highQualityImages);

    return createSuccessResponse({
      images: deduplicatedImages,
      total: deduplicatedImages.length,
      qualityInfo: {
        totalScanned: allImages.length,
        highQualityFound: highQualityImages.length,
        afterDeduplication: deduplicatedImages.length,
        qualityThreshold: 70
      },
      timestamp: new Date().toISOString()
    }, { 
      cache: CONFIG.CACHE_TTL.IMAGES,
      headers: { 'X-Cache': 'MISS' }
    });

  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to load high-quality images'
    });
  }
}

/**
 * Filter images by quality level
 */
function filterByQuality(images, qualityFilter) {
  if (qualityFilter === 'all') return images;
  
  return images.filter(img => {
    const score = getImageQualityScore(img.src);
    
    switch (qualityFilter) {
      case 'high': return score >= 70;
      case 'medium': return score >= 40 && score < 70;
      case 'low': return score < 40;
      default: return true;
    }
  });
}

/**
 * Check if an asset is considered junk/low quality
 */
function isJunkAsset(image) {
  if (!image || !image.src || !image.displayName) return true;
  
  const src = image.src.toLowerCase();
  const name = image.displayName.toLowerCase();
  
  const junkIndicators = [
    'placeholder',
    'example.com',
    'test-image',
    'sample',
    'dummy',
    'fake',
    'lorem',
    'internal image',
    'broken',
    'missing'
  ];
  
  return junkIndicators.some(indicator => 
    src.includes(indicator) || name.includes(indicator)
  );
}

/**
 * Check if asset is external
 */
function isExternalAsset(src) {
  if (!src) return false;
  
  const internalDomains = [
    'main--da-media--',
    'localhost',
    '127.0.0.1'
  ];
  
  return !internalDomains.some(domain => src.includes(domain));
}

/**
 * Deduplicate images by displayName, prioritizing higher quality URLs
 */
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

/**
 * Determine if candidate image should replace existing based on quality
 */
function shouldReplaceImageForQuality(existing, candidate) {
  const existingScore = getImageQualityScore(existing.src);
  const candidateScore = getImageQualityScore(candidate.src);
  
  return candidateScore > existingScore;
}

/**
 * Calculate quality score for image URL
 */
function getImageQualityScore(src) {
  if (!src) return 0;
  
  let score = 0;
  
  if (src.includes('dish.scene7.com/is/image/dishenterprise/')) {
    score += 100;
  } else if (src.includes('dish.scene7.com/is/image/sling/')) {
    score += 80;
  } else if (src.includes('dish.scene7.com')) {
    score += 70;
  } else if (src.includes('cdn.sling.com')) {
    score += 60;
  } else if (src.includes('assets.sling.tv')) {
    score += 50;
  } else if (src.includes('main--da-media--')) {
    score += 90;
  } else if (src.startsWith('http')) {
    score += 30;
  } else {
    score += 10;
  }
  
  if (src.includes('$transparent-png-desktop$')) {
    score += 20;
  } else if (src.includes('format=webp')) {
    score += 15;
  } else if (src.includes('optimize=medium')) {
    score += 10;
  }
  
  if (src.includes('example.com') || src.includes('placeholder')) {
    score -= 50;
  }
  
  return score;
}

/**
 * Apply AI-powered priority filtering for contextual recommendations
 */
async function applyPriorityFiltering(images, priority, context, env) {
  try {
    if (priority === 'ai-recommended' && context) {
      // Parse context if it's a string
      let parsedContext;
      try {
        parsedContext = typeof context === 'string' ? JSON.parse(context) : context;
      } catch {
        parsedContext = { documentType: context }; // Fallback to simple string context
      }

      // Score images based on context relevance
      const scoredImages = images.map(image => {
        let relevanceScore = 0;
        const name = (image.displayName || '').toLowerCase();
        const tags = image.detectedTags || [];
        
        // Document type specific scoring
        if (parsedContext.documentType === 'blog') {
          if (name.includes('hero') || name.includes('banner')) relevanceScore += 30;
          if (name.includes('poster') || name.includes('thumbnail')) relevanceScore += 25;
          if (tags.includes('hero') || tags.includes('banner')) relevanceScore += 20;
        } else if (parsedContext.documentType === 'team') {
          if (name.includes('team') || name.includes('people')) relevanceScore += 35;
          if (name.includes('professional') || name.includes('headshot')) relevanceScore += 30;
          if (tags.includes('team') || tags.includes('people')) relevanceScore += 25;
        } else if (parsedContext.documentType === 'product') {
          if (name.includes('product') || name.includes('feature')) relevanceScore += 35;
          if (name.includes('demo') || name.includes('showcase')) relevanceScore += 30;
          if (tags.includes('product') || tags.includes('feature')) relevanceScore += 25;
        }

        // General quality and usage boosts
        if (image.usageCount > 0) relevanceScore += Math.min(image.usageCount * 3, 15);
        if (getImageQualityScore(image.src) > 80) relevanceScore += 10;
        if (!isExternalAsset(image.src)) relevanceScore += 5; // Slight preference for internal

        return {
          ...image,
          aiRelevanceScore: relevanceScore,
          recommendationReason: getAIRecommendationReason(image, parsedContext)
        };
      });

      // Return top relevant images
      return scoredImages
        .filter(img => img.aiRelevanceScore > 10) // Only reasonably relevant images
        .sort((a, b) => b.aiRelevanceScore - a.aiRelevanceScore);

    } else if (priority === 'high-priority') {
      // Return high-usage, high-quality images
      return images
        .filter(img => {
          const qualityScore = getImageQualityScore(img.src);
          const usageCount = img.usageCount || 0;
          return qualityScore > 70 || usageCount > 2;
        })
        .sort((a, b) => {
          const scoreA = getImageQualityScore(a.src) + (a.usageCount || 0) * 10;
          const scoreB = getImageQualityScore(b.src) + (b.usageCount || 0) * 10;
          return scoreB - scoreA;
        });
    }

    return images; // No filtering applied
  } catch (error) {
    console.error('Priority filtering failed:', error);
    return images; // Return original images on error
  }
}

/**
 * Generate AI recommendation reason for an image
 */
function getAIRecommendationReason(image, context) {
  const name = (image.displayName || '').toLowerCase();
  const documentType = context.documentType;
  
  if (documentType === 'blog' && (name.includes('hero') || name.includes('banner'))) {
    return 'Perfect for blog headers';
  } else if (documentType === 'team' && (name.includes('team') || name.includes('people'))) {
    return 'Great for team pages';
  } else if (documentType === 'product' && (name.includes('product') || name.includes('feature'))) {
    return 'Ideal for product showcase';
  } else if (name.includes('hero') || name.includes('background')) {
    return 'High-impact visual';
  } else if (image.usageCount > 2) {
    return 'Popular choice';
  } else if (getImageQualityScore(image.src) > 80) {
    return 'High quality asset';
  } else {
    return 'Contextually relevant';
  }
} 