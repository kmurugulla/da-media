// tools/da-media-basi./modules/media-processor.js
// Asset processing and utility functions for Media Library

import {
  saveSheetFile,
  loadSheetFile,
  getSheetUrl,
  buildSingleSheet,
  ADMIN_DA_LIVE_BASE,
  parseSheet,
} from './sheet-utils.js';

/**
 * Process scan results and convert to asset objects
 */
function processScanResults(scanResults) {
  const processedAssets = [];
  let runningIndex = 1;
  scanResults.forEach((result) => {
    if (result.assets && Array.isArray(result.assets)) {
      result.assets.forEach((asset) => {
        // Convert file path to content URL for the page field
        const pageUrl = `https://content.da.live${result.file.path}`;
        const processedAsset = {
          id: asset.src, // Use src as unique ID instead of generating one
          src: asset.src,
          name: asset.alt || 'Untitled',
          alt: asset.alt || '',
          type: determineAssetType(asset.src),
          page: pageUrl, // Set the proper page URL
          usedIn: [result.file.path],
          isExternal: typeof asset.isExternal === 'boolean' ? asset.isExternal : false,
          index: runningIndex,
        };
        runningIndex++;
        // Check if asset already exists and merge usedIn paths
        const existingIndex = processedAssets.findIndex((a) => a.src === processedAsset.src);
        if (existingIndex >= 0) {
          processedAssets[existingIndex].usedIn.push(...processedAsset.usedIn);
        } else {
          processedAssets.push(processedAsset);
        }
      });
    }
  });
  return processedAssets;
}

/**
 * Generate unique asset ID from source URL
 */
async function generateAssetId(src) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
  const hex = Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 42);
}

/**
 * Extract asset name from source URL
 */
function extractAssetName(src) {
  return 'Untitled';
}

/**
 * Determine asset type from source URL
 */
function determineAssetType(src) {
  const lowerSrc = src.toLowerCase();

  // Image types
  if (lowerSrc.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) {
    return 'image';
  }

  // Video types
  if (lowerSrc.match(/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/)) {
    return 'video';
  }

  // Document types
  if (lowerSrc.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|ods|odp)$/)) {
    return 'document';
  }

  // Default to image if no clear type
  return 'image';
}

/**
 * Save a flat media sheet to media.json
 */
export async function saveMediaSheet(apiConfig, assets) {
  const normalizedAssets = await Promise.all(assets.map(async (asset) => {
    const src = asset.src || asset.id || '';
    const alt = asset.alt || '';
    const type = determineAssetType(src);
    const name = alt || 'Untitled';
    const id = await generateAssetId(src);
    let usedIn = '';
    if (Array.isArray(asset.usedIn)) {
      usedIn = Array.from(new Set(asset.usedIn)).join(',');
    } else if (typeof asset.usedIn === 'string') {
      usedIn = asset.usedIn;
    }
    return {
      id,
      src,
      alt,
      usedIn,
      type,
      name,
      isExternal: asset.isExternal || false,
    };
  }));

  const mediaSheet = buildSingleSheet(normalizedAssets);
  const url = `${ADMIN_DA_LIVE_BASE}/source/${apiConfig.org}/${apiConfig.repo}/.da/media.json`;

  try {
    await saveSheetFile(url, mediaSheet, apiConfig.token);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console -- needed for debugging
    console.error('[DA] saveMediaSheet: SAVE FAILED:', error);
    throw error;
  }
}

/**
 * Load a flat media sheet from media.json
 */
export async function loadMediaSheet(apiConfig) {
  const url = getSheetUrl(apiConfig, 'media.json');
  const data = await loadSheetFile(url, apiConfig.token);
  const parsed = parseSheet(data);

  // Extract the actual assets array from the parsed structure
  let assets = [];
  if (parsed && parsed.data && parsed.data.data && Array.isArray(parsed.data.data)) {
    assets = parsed.data.data;
  }

  return assets;
}

export {
  processScanResults,
  generateAssetId,
  extractAssetName,
  determineAssetType,
};
