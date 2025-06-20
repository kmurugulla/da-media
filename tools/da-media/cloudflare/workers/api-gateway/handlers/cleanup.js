/**
 * Phase 4: Comprehensive Data Cleanup Handler
 * Permanent junk data removal from Cloudflare KV storage
 */

import {
  validateMethod, createSuccessResponse, createErrorResponse, CONFIG,
} from '../utils.js';

export async function handleCleanupPreview(request, env) {
  validateMethod(request, ['POST']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const body = await request.json().catch(() => ({}));
    const options = {
      includeJunk: body.includeJunk !== false,
      includeLowQuality: body.includeLowQuality !== false,
      includeDuplicates: body.includeDuplicates !== false,
      qualityThreshold: body.qualityThreshold || 30,
      maxPreview: body.maxPreview || 50,
    };

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const previewResults = {
      totalScanned: 0,
      junkAssets: [],
      lowQualityAssets: [],
      duplicateAssets: [],
      estimatedDeletions: 0,
      estimatedStorageSaved: 0,
    };

    const seenAssets = new Map();

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      previewResults.totalScanned++;

      if (options.includeJunk && isJunkAsset(image)) {
        if (previewResults.junkAssets.length < options.maxPreview) {
          previewResults.junkAssets.push({
            id: image.id,
            displayName: image.displayName,
            src: image.src,
            reason: getJunkReason(image),
            keyName: key.name,
            estimatedSize: estimateAssetSize(image),
          });
        }
        previewResults.estimatedDeletions++;
        previewResults.estimatedStorageSaved += estimateAssetSize(image);
      }

      if (options.includeLowQuality && !isJunkAsset(image)) {
        const qualityScore = calculateQualityScore(image.src);
        if (qualityScore < options.qualityThreshold) {
          if (previewResults.lowQualityAssets.length < options.maxPreview) {
            previewResults.lowQualityAssets.push({
              id: image.id,
              displayName: image.displayName,
              src: image.src,
              qualityScore,
              reason: `Quality score ${qualityScore} below threshold ${options.qualityThreshold}`,
              keyName: key.name,
              estimatedSize: estimateAssetSize(image),
            });
          }
          previewResults.estimatedDeletions++;
          previewResults.estimatedStorageSaved += estimateAssetSize(image);
        }
      }

      if (options.includeDuplicates) {
        const assetSignature = generateAssetSignature(image);
        if (seenAssets.has(assetSignature)) {
          const original = seenAssets.get(assetSignature);
          if (previewResults.duplicateAssets.length < options.maxPreview) {
            previewResults.duplicateAssets.push({
              id: image.id,
              displayName: image.displayName,
              src: image.src,
              reason: `Duplicate of ${original.displayName}`,
              originalId: original.id,
              keyName: key.name,
              estimatedSize: estimateAssetSize(image),
            });
          }
          previewResults.estimatedDeletions++;
          previewResults.estimatedStorageSaved += estimateAssetSize(image);
        } else {
          seenAssets.set(assetSignature, image);
        }
      }
    }

    return createSuccessResponse({
      message: `Found ${previewResults.estimatedDeletions} assets for cleanup`,
      options,
      previewResults,
      recommendations: generateCleanupRecommendations(previewResults),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to preview cleanup',
    });
  }
}

export async function handleCleanJunkAssets(request, env) {
  validateMethod(request, ['POST']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const body = await request.json().catch(() => ({}));
    const options = {
      dryRun: body.dryRun === true,
      maxDeletions: body.maxDeletions || 1000,
      batchSize: body.batchSize || 50,
    };

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const cleanupResults = {
      scanned: 0,
      junkFound: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
      deletedAssets: [],
      storageSaved: 0,
    };

    let deletionCount = 0;
    const deletionPromises = [];

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      cleanupResults.scanned++;

      if (isJunkAsset(image)) {
        cleanupResults.junkFound++;

        if (deletionCount >= options.maxDeletions) {
          cleanupResults.skipped++;
          continue;
        }

        const assetInfo = {
          id: image.id,
          displayName: image.displayName,
          src: image.src,
          reason: getJunkReason(image),
          keyName: key.name,
          estimatedSize: estimateAssetSize(image),
        };

        if (!options.dryRun) {
          deletionPromises.push(
            env.DA_MEDIA_KV.delete(key.name)
              .then(() => {
                cleanupResults.deleted++;
                cleanupResults.deletedAssets.push(assetInfo);
                cleanupResults.storageSaved += assetInfo.estimatedSize;
              })
              .catch((error) => {
                cleanupResults.errors.push({
                  id: image.id,
                  keyName: key.name,
                  error: error.message,
                });
              }),
          );
        } else {
          cleanupResults.deletedAssets.push(assetInfo);
          cleanupResults.storageSaved += assetInfo.estimatedSize;
        }

        deletionCount++;

        if (deletionPromises.length >= options.batchSize) {
          await Promise.all(deletionPromises);
          deletionPromises.length = 0;
        }
      }
    }

    if (deletionPromises.length > 0) {
      await Promise.all(deletionPromises);
    }

    if (options.dryRun) {
      cleanupResults.deleted = cleanupResults.deletedAssets.length;
    }

    return createSuccessResponse({
      message: options.dryRun
        ? `Would delete ${cleanupResults.deleted} junk assets (dry run)`
        : `Successfully deleted ${cleanupResults.deleted} junk assets`,
      dryRun: options.dryRun,
      cleanupResults,
      performance: {
        storageSaved: formatBytes(cleanupResults.storageSaved),
        deletionRate: Math.round((cleanupResults.deleted / cleanupResults.scanned) * 100),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to clean junk assets',
    });
  }
}

export async function handleCleanLowQuality(request, env) {
  validateMethod(request, ['POST']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const body = await request.json().catch(() => ({}));
    const options = {
      qualityThreshold: body.qualityThreshold || 30,
      dryRun: body.dryRun === true,
      maxDeletions: body.maxDeletions || 500,
      excludeJunk: body.excludeJunk !== false,
    };

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const cleanupResults = {
      scanned: 0,
      lowQualityFound: 0,
      deleted: 0,
      errors: [],
      deletedAssets: [],
      storageSaved: 0,
    };

    let deletionCount = 0;

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      cleanupResults.scanned++;

      if (options.excludeJunk && isJunkAsset(image)) {
        continue;
      }

      const qualityScore = calculateQualityScore(image.src);
      if (qualityScore < options.qualityThreshold) {
        cleanupResults.lowQualityFound++;

        if (deletionCount >= options.maxDeletions) {
          continue;
        }

        const assetInfo = {
          id: image.id,
          displayName: image.displayName,
          src: image.src,
          qualityScore,
          reason: `Quality score ${qualityScore} below threshold ${options.qualityThreshold}`,
          keyName: key.name,
          estimatedSize: estimateAssetSize(image),
        };

        if (!options.dryRun) {
          try {
            await env.DA_MEDIA_KV.delete(key.name);
            cleanupResults.deleted++;
            cleanupResults.deletedAssets.push(assetInfo);
            cleanupResults.storageSaved += assetInfo.estimatedSize;
          } catch (error) {
            cleanupResults.errors.push({
              id: image.id,
              keyName: key.name,
              error: error.message,
            });
          }
        } else {
          cleanupResults.deletedAssets.push(assetInfo);
          cleanupResults.storageSaved += assetInfo.estimatedSize;
        }

        deletionCount++;
      }
    }

    if (options.dryRun) {
      cleanupResults.deleted = cleanupResults.deletedAssets.length;
    }

    return createSuccessResponse({
      message: options.dryRun
        ? `Would delete ${cleanupResults.deleted} low-quality assets (dry run)`
        : `Successfully deleted ${cleanupResults.deleted} low-quality assets`,
      dryRun: options.dryRun,
      options,
      cleanupResults,
      performance: {
        storageSaved: formatBytes(cleanupResults.storageSaved),
        deletionRate: Math.round((cleanupResults.deleted / cleanupResults.scanned) * 100),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to clean low-quality assets',
    });
  }
}

export async function handleCleanDuplicates(request, env) {
  validateMethod(request, ['POST']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const body = await request.json().catch(() => ({}));
    const options = {
      dryRun: body.dryRun === true,
      keepStrategy: body.keepStrategy || 'highest_quality',
      maxDeletions: body.maxDeletions || 300,
    };

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const seenAssets = new Map();
    const duplicateGroups = new Map();

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      const signature = generateAssetSignature(image);

      if (seenAssets.has(signature)) {
        if (!duplicateGroups.has(signature)) {
          duplicateGroups.set(signature, [seenAssets.get(signature)]);
        }
        duplicateGroups.get(signature).push({ ...image, keyName: key.name });
      } else {
        seenAssets.set(signature, { ...image, keyName: key.name });
      }
    }

    const cleanupResults = {
      scanned: keys.length,
      duplicateGroupsFound: duplicateGroups.size,
      duplicatesFound: 0,
      deleted: 0,
      kept: 0,
      errors: [],
      deletedAssets: [],
      storageSaved: 0,
    };

    let deletionCount = 0;

    for (const [, duplicates] of duplicateGroups) {
      if (duplicates.length < 2) continue;

      cleanupResults.duplicatesFound += duplicates.length - 1;

      const keeper = selectKeeperAsset(duplicates, options.keepStrategy);
      const toDelete = duplicates.filter((d) => d.id !== keeper.id);

      for (const duplicate of toDelete) {
        if (deletionCount >= options.maxDeletions) break;

        const assetInfo = {
          id: duplicate.id,
          displayName: duplicate.displayName,
          src: duplicate.src,
          reason: `Duplicate of ${keeper.displayName} (kept: ${keeper.id})`,
          keyName: duplicate.keyName,
          estimatedSize: estimateAssetSize(duplicate),
        };

        if (!options.dryRun) {
          try {
            await env.DA_MEDIA_KV.delete(duplicate.keyName);
            cleanupResults.deleted++;
            cleanupResults.deletedAssets.push(assetInfo);
            cleanupResults.storageSaved += assetInfo.estimatedSize;
          } catch (error) {
            cleanupResults.errors.push({
              id: duplicate.id,
              keyName: duplicate.keyName,
              error: error.message,
            });
          }
        } else {
          cleanupResults.deletedAssets.push(assetInfo);
          cleanupResults.storageSaved += assetInfo.estimatedSize;
        }

        deletionCount++;
      }

      cleanupResults.kept++;
    }

    if (options.dryRun) {
      cleanupResults.deleted = cleanupResults.deletedAssets.length;
    }

    return createSuccessResponse({
      message: options.dryRun
        ? `Would delete ${cleanupResults.deleted} duplicate assets (dry run)`
        : `Successfully deleted ${cleanupResults.deleted} duplicate assets`,
      dryRun: options.dryRun,
      options,
      cleanupResults,
      performance: {
        storageSaved: formatBytes(cleanupResults.storageSaved),
        deduplicationRate: Math.round((cleanupResults.deleted / cleanupResults.duplicatesFound) * 100),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to clean duplicate assets',
    });
  }
}

export async function handleCleanupAnalytics(request, env) {
  validateMethod(request, ['GET']);

  try {
    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const { keys } = await env.DA_MEDIA_KV.list({ prefix: CONFIG.PREFIXES.IMAGE });
    const analytics = {
      totalAssets: 0,
      junkAssets: 0,
      lowQualityAssets: 0,
      duplicateAssets: 0,
      highQualityAssets: 0,
      qualityDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        junk: 0,
      },
      domainDistribution: {},
      estimatedWaste: {
        junkStorage: 0,
        lowQualityStorage: 0,
        duplicateStorage: 0,
        totalWaste: 0,
      },
      recommendations: [],
    };

    const seenAssets = new Map();

    for (const key of keys) {
      const image = await env.DA_MEDIA_KV.get(key.name, 'json');
      if (!image) continue;

      analytics.totalAssets++;
      const estimatedSize = estimateAssetSize(image);

      if (isJunkAsset(image)) {
        analytics.junkAssets++;
        analytics.qualityDistribution.junk++;
        analytics.estimatedWaste.junkStorage += estimatedSize;
      } else {
        const qualityScore = calculateQualityScore(image.src);

        if (qualityScore >= 80) {
          analytics.highQualityAssets++;
          analytics.qualityDistribution.excellent++;
        } else if (qualityScore >= 60) {
          analytics.qualityDistribution.good++;
        } else if (qualityScore >= 40) {
          analytics.qualityDistribution.fair++;
        } else {
          analytics.lowQualityAssets++;
          analytics.qualityDistribution.poor++;
          analytics.estimatedWaste.lowQualityStorage += estimatedSize;
        }

        const signature = generateAssetSignature(image);
        if (seenAssets.has(signature)) {
          analytics.duplicateAssets++;
          analytics.estimatedWaste.duplicateStorage += estimatedSize;
        } else {
          seenAssets.set(signature, true);
        }

        const domain = extractDomain(image.src);
        if (domain) {
          analytics.domainDistribution[domain] = (analytics.domainDistribution[domain] || 0) + 1;
        }
      }
    }

    analytics.estimatedWaste.totalWaste = analytics.estimatedWaste.junkStorage
      + analytics.estimatedWaste.lowQualityStorage
      + analytics.estimatedWaste.duplicateStorage;

    analytics.recommendations = generateAnalyticsRecommendations(analytics);

    return createSuccessResponse({
      analytics: {
        ...analytics,
        estimatedWaste: {
          ...analytics.estimatedWaste,
          junkStorage: formatBytes(analytics.estimatedWaste.junkStorage),
          lowQualityStorage: formatBytes(analytics.estimatedWaste.lowQualityStorage),
          duplicateStorage: formatBytes(analytics.estimatedWaste.duplicateStorage),
          totalWaste: formatBytes(analytics.estimatedWaste.totalWaste),
        },
      },
      cleanupPotential: {
        junkCleanup: `${analytics.junkAssets} assets, ${
          formatBytes(analytics.estimatedWaste.junkStorage)}`,
        qualityCleanup: `${analytics.lowQualityAssets} assets, ${
          formatBytes(analytics.estimatedWaste.lowQualityStorage)}`,
        duplicateCleanup: `${analytics.duplicateAssets} assets, ${
          formatBytes(analytics.estimatedWaste.duplicateStorage)}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to generate cleanup analytics',
    });
  }
}

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
    'null',
    'undefined',
    'error',
    '404',
    'not-found',
  ];

  return junkIndicators.some((indicator) => src.includes(indicator) || name.includes(indicator));
}

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
    { indicator: 'broken', reason: 'Broken image reference' },
    { indicator: 'missing', reason: 'Missing image file' },
    { indicator: '404', reason: '404 error image' },
    { indicator: 'not-found', reason: 'Not found image' },
  ];

  for (const { indicator, reason } of reasons) {
    if (src.includes(indicator) || name.includes(indicator)) {
      return reason;
    }
  }

  return 'Low quality asset';
}

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

  return Math.max(0, score);
}

function generateAssetSignature(image) {
  const cleanName = image.displayName?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  const cleanSrc = image.src?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  return `${cleanName}-${cleanSrc}`.substring(0, 50);
}

function estimateAssetSize(image) {
  if (image.fileSize) return image.fileSize;
  if (image.dimensions) {
    const { width, height } = image.dimensions;
    return Math.floor((width * height * 3) / 2);
  }
  return 25000;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function selectKeeperAsset(duplicates, strategy) {
  switch (strategy) {
    case 'highest_quality':
      return duplicates.reduce((best, current) => (calculateQualityScore(current.src)
        > calculateQualityScore(best.src) ? current : best));
    case 'most_recent':
      return duplicates.reduce((best, current) => ((current.lastModified || current.createdAt || 0)
        > (best.lastModified || best.createdAt || 0) ? current : best));
    case 'smallest_size':
      return duplicates.reduce((best, current) => (estimateAssetSize(current)
        < estimateAssetSize(best) ? current : best));
    default:
      return duplicates[0];
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function generateCleanupRecommendations(results) {
  const recommendations = [];

  if (results.junkAssets.length > 0) {
    recommendations.push({
      type: 'critical',
      action: 'cleanup_junk',
      message: `${results.junkAssets.length} junk assets found - immediate cleanup recommended`,
      impact: 'high',
      estimatedSavings: formatBytes(results.junkAssets.reduce((sum, asset) => sum + asset.estimatedSize, 0)),
    });
  }

  if (results.lowQualityAssets.length > 10) {
    recommendations.push({
      type: 'warning',
      action: 'review_quality',
      message: `${results.lowQualityAssets.length} low-quality assets found - review recommended`,
      impact: 'medium',
      estimatedSavings: formatBytes(results.lowQualityAssets.reduce((sum, asset) => sum + asset.estimatedSize, 0)),
    });
  }

  if (results.duplicateAssets.length > 5) {
    recommendations.push({
      type: 'optimization',
      action: 'deduplicate',
      message: `${results.duplicateAssets.length} duplicate assets found - deduplication recommended`,
      impact: 'medium',
      estimatedSavings: formatBytes(results.duplicateAssets.reduce((sum, asset) => sum + asset.estimatedSize, 0)),
    });
  }

  return recommendations;
}

function generateAnalyticsRecommendations(analytics) {
  const recommendations = [];

  const junkPercentage = Math.round((analytics.junkAssets / analytics.totalAssets) * 100);
  if (junkPercentage > 10) {
    recommendations.push({
      type: 'critical',
      message: `${junkPercentage}% of assets are junk - immediate cleanup required`,
      action: 'Run junk asset cleanup',
      priority: 'high',
    });
  }

  const lowQualityPercentage = Math.round((analytics.lowQualityAssets / analytics.totalAssets) * 100);
  if (lowQualityPercentage > 15) {
    recommendations.push({
      type: 'warning',
      message: `${lowQualityPercentage}% of assets are low quality - review recommended`,
      action: 'Review and clean low-quality assets',
      priority: 'medium',
    });
  }

  const duplicatePercentage = Math.round((analytics.duplicateAssets / analytics.totalAssets) * 100);
  if (duplicatePercentage > 5) {
    recommendations.push({
      type: 'optimization',
      message: `${duplicatePercentage}% of assets are duplicates - deduplication recommended`,
      action: 'Run duplicate cleanup',
      priority: 'medium',
    });
  }

  if (analytics.estimatedWaste.totalWaste > 10 * 1024 * 1024) {
    recommendations.push({
      type: 'storage',
      message: `${formatBytes(analytics.estimatedWaste.totalWaste)} storage can be saved through cleanup`,
      action: 'Comprehensive cleanup recommended',
      priority: 'high',
    });
  }

  return recommendations;
}
