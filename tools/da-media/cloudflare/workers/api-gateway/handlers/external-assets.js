/**
 * External Assets Handler Module
 * Handles external asset analysis with improved data quality and junk filtering
 */

import {
  validateMethod,
  createSuccessResponse,
  createErrorResponse,
  CONFIG,
} from '../utils.js';

/**
 * Get external assets with quality filtering and junk removal
 */
export async function handleGetExternalAssets(request, env) {
  validateMethod(request, ['GET']);

  const url = new URL(request.url);
  const site = url.searchParams.get('site');
  const org = url.searchParams.get('org');
  const cleanJunk = url.searchParams.get('clean') !== 'false'; // Default to true
  const minQuality = parseInt(url.searchParams.get('min_quality'), 10) || 30;
  const groupBy = url.searchParams.get('group_by') || 'domain'; // domain, category, priority

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
    const qualityStats = {
      totalScanned: 0,
      externalFound: 0,
      junkFiltered: 0,
      qualityFiltered: 0,
      finalCount: 0,
    };

    const imagePromises = keys.map((key) => env.DA_MEDIA_KV.get(key.name, 'json'));
    const images = await Promise.all(imagePromises);

    for (const image of images) {
      if (!image || !image.src) continue;

      qualityStats.totalScanned++;

      const isExternal = isExternalAsset(image.src, { site, org });
      if (!isExternal) continue;

      qualityStats.externalFound++;

      if (cleanJunk && isJunkAsset(image)) {
        qualityStats.junkFiltered++;
        continue;
      }

      const qualityScore = calculateQualityScore(image.src);
      if (qualityScore < minQuality) {
        qualityStats.qualityFiltered++;
        continue;
      }

      const domain = extractDomain(image.src);
      const category = categorizeAssetDomain(domain);

      const assetInfo = {
        ...image,
        domain,
        category,
        qualityScore,
        migrationPriority: calculateMigrationPriority(domain, category, qualityScore),
        estimatedSavings: calculateEstimatedSavings(image),
        qualityIssues: identifyQualityIssues(image),
      };

      externalAssets.push(assetInfo);
    }

    qualityStats.finalCount = externalAssets.length;

    const groupedAssets = groupAssets(externalAssets, groupBy);
    const insights = generateInsights(externalAssets, qualityStats);

    return createSuccessResponse({
      success: true,
      summary: {
        totalExternal: externalAssets.length,
        domains: new Set(externalAssets.map((a) => a.domain)).size,
        highPriority: externalAssets.filter((a) => a.migrationPriority === 'high').length,
        estimatedTotalSavings: externalAssets.reduce((sum, asset) => sum + (asset.estimatedSavings || 0), 0),
        averageQualityScore: Math.round(
          externalAssets.reduce((sum, a) => sum + a.qualityScore, 0) / externalAssets.length,
        ),
      },
      qualityStats,
      insights,
      externalAssets,
      groupedAssets,
      filters: {
        cleanJunk,
        minQuality,
        groupBy,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to fetch external assets',
    });
  }
}

/**
 * Clean junk assets from external assets collection
 */
export async function handleCleanJunkAssets(request, env) {
  validateMethod(request, ['POST']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const junkAssets = [];
    const cleanupResults = {
      scanned: 0,
      junkFound: 0,
      deleted: 0,
      errors: [],
    };

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      cleanupResults.scanned++;

      if (isJunkAsset(image)) {
        cleanupResults.junkFound++;
        junkAssets.push({
          id: image.id,
          displayName: image.displayName,
          src: image.src,
          reason: getJunkReason(image),
        });

        try {
          await env.DA_MEDIA_KV.delete(key.name);
          cleanupResults.deleted++;
        } catch (error) {
          cleanupResults.errors.push({
            id: image.id,
            error: error.message,
          });
        }
      }
    }

    return createSuccessResponse({
      message: `Cleaned up ${cleanupResults.deleted} junk assets`,
      cleanupResults,
      junkAssets: junkAssets.slice(0, 10), // Show first 10 for reference
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to clean junk assets',
    });
  }
}

/**
 * Check if asset is external to the specified site
 */
function isExternalAsset(src, pageContext) {
  if (!src) return false;

  const domain = extractDomain(src);
  const siteDomain = pageContext.site ? `${pageContext.site}--${pageContext.org}` : null;

  return domain && !domain.includes(siteDomain);
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if an asset is considered junk
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
    'missing',
    'temp',
    'tmp',
    'default',
    'no-image',
    'blank',
  ];

  return junkIndicators.some((indicator) => src.includes(indicator) || name.includes(indicator));
}

/**
 * Get reason why asset is considered junk
 */
function getJunkReason(image) {
  if (!image.src) return 'Missing source URL';
  if (!image.displayName) return 'Missing display name';

  const src = image.src.toLowerCase();
  const name = image.displayName.toLowerCase();

  const reasons = [
    { indicator: 'placeholder', reason: 'Placeholder image' },
    { indicator: 'example.com', reason: 'Example domain' },
    { indicator: 'test-image', reason: 'Test image' },
    { indicator: 'sample', reason: 'Sample image' },
    { indicator: 'dummy', reason: 'Dummy content' },
    { indicator: 'fake', reason: 'Fake/mock data' },
    { indicator: 'internal image', reason: 'Invalid internal reference' },
  ];

  for (const { indicator, reason } of reasons) {
    if (src.includes(indicator) || name.includes(indicator)) {
      return reason;
    }
  }

  return 'Low quality asset';
}

/**
 * Calculate quality score for asset
 */
function calculateQualityScore(src) {
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

  return Math.max(0, score);
}

/**
 * Categorize asset domain
 */
function categorizeAssetDomain(domain) {
  if (!domain) return 'unknown';

  if (domain.includes('scene7.com')) return 'scene7';
  if (domain.includes('sling.com') || domain.includes('sling.tv')) return 'sling';
  if (domain.includes('dish.com')) return 'dish';
  if (domain.includes('cdn.')) return 'cdn';

  return 'other';
}

/**
 * Calculate migration priority
 */
function calculateMigrationPriority(domain, category, qualityScore) {
  if (qualityScore >= 80 && category === 'scene7') return 'high';
  if (qualityScore >= 60 && (category === 'sling' || category === 'dish')) return 'medium';
  if (qualityScore >= 40) return 'low';
  return 'skip';
}

/**
 * Calculate estimated savings
 */
function calculateEstimatedSavings(imageData) {
  const baseSize = imageData.fileSize || 50000;
  const usageCount = imageData.usageCount || 1;
  return Math.floor(baseSize * usageCount * 0.1);
}

/**
 * Identify quality issues with asset
 */
function identifyQualityIssues(image) {
  const issues = [];

  if (!image.src) issues.push('Missing source URL');
  if (!image.displayName) issues.push('Missing display name');
  if (image.src && image.src.includes('example.com')) issues.push('Example domain');
  if (image.displayName && image.displayName.toLowerCase().includes('placeholder')) issues.push('Placeholder content');
  if (!image.fileSize) issues.push('Unknown file size');
  if (!image.dimensions) issues.push('Unknown dimensions');

  return issues;
}

/**
 * Group assets by specified criteria
 */
function groupAssets(assets, groupBy) {
  const grouped = {};

  for (const asset of assets) {
    let key;
    switch (groupBy) {
      case 'category': key = asset.category; break;
      case 'priority': key = asset.migrationPriority; break;
      case 'domain':
      default: key = asset.domain; break;
    }

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(asset);
  }

  return grouped;
}

/**
 * Generate insights about external assets
 */
function generateInsights(assets, qualityStats) {
  const insights = [];

  const junkPercentage = Math.round((qualityStats.junkFiltered / qualityStats.externalFound) * 100);
  if (junkPercentage > 20) {
    insights.push({
      type: 'warning',
      message: `High junk content detected: ${junkPercentage}% of external assets are low quality`,
      action: 'Consider running cleanup operation',
    });
  }

  const scene7Assets = assets.filter((a) => a.category === 'scene7').length;
  if (scene7Assets > 0) {
    insights.push({
      type: 'opportunity',
      message: `${scene7Assets} high-quality Scene7 assets found`,
      action: 'Priority candidates for migration',
    });
  }

  const lowQualityAssets = assets.filter((a) => a.qualityScore < 40).length;
  if (lowQualityAssets > 10) {
    insights.push({
      type: 'recommendation',
      message: `${lowQualityAssets} assets have low quality scores`,
      action: 'Review and potentially exclude from migration',
    });
  }

  return insights;
}
