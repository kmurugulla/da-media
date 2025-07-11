/**
 * Media Scan Worker - Processes pages from queue to extract media assets
 * Works with document discovery worker for queue-based scanning
 */

const state = {
  apiConfig: null,
  isRunning: false,
  batchSize: 5,
  concurrentScans: 3,
  processingInterval: 5000, // 5 seconds
};

/**
 * Initialize the media scan worker
 */
function init(config) {
  state.apiConfig = config;
  // Media Scan Worker: Initialized with config
}

/**
 * Start processing pages from queue
 */
async function startQueueProcessing() {
  state.isRunning = true;
  // Media Scan Worker: Starting queue processing

  // Process queue periodically
  const intervalId = setInterval(async () => {
    if (state.isRunning) {
      await processNextBatch();
    } else {
      clearInterval(intervalId);
    }
  }, state.processingInterval);

  postMessage({
    type: 'queueProcessingStarted',
    data: { interval: state.processingInterval },
  });
}

/**
 * Process next batch of pages from queue
 */
async function processNextBatch() {
  try {
    // Request next batch from main thread (which communicates with listing worker)
    postMessage({
      type: 'requestBatch',
      data: { batchSize: state.batchSize },
    });

  } catch (error) {
    // Media Scan Worker: Error requesting batch
    postMessage({
      type: 'batchError',
      data: { error: error.message },
    });
  }
}

/**
 * Process a batch of pages concurrently
 */
async function processBatch(pages) {
  if (!pages || pages.length === 0) {
    return;
  }

  // Process pages in smaller concurrent groups
  const concurrentGroups = createConcurrentGroups(pages, state.concurrentScans);

  for (const group of concurrentGroups) {
    const scanPromises = group.map((page) => scanPageForAssets(page));
    await Promise.all(scanPromises);
  }

  postMessage({
    type: 'batchComplete',
    data: { processedCount: pages.length },
  });
}

/**
 * Scan a single page for assets
 */
async function scanPageForAssets(page) {
  const startTime = Date.now();

  try {
    // Get page content
    const content = await getPageContent(page.path);

    // Extract assets from HTML
    const assets = extractAssetsFromHTML(content, page.path);

    const scanTime = Date.now() - startTime;

    postMessage({
      type: 'pageScanned',
      data: {
        page: page.path,
        assets,
        scanTime,
        assetCount: assets.length,
      },
    });

    // Mark page as scanned (remove from queue)
    postMessage({
      type: 'markPageScanned',
      data: { path: page.path },
    });

  } catch (error) {
    postMessage({
      type: 'pageScanError',
      data: {
        page: page.path,
        error: error.message,
        retryCount: page.retryCount || 0,
      },
    });
  }
}

/**
 * Get page content from DA API
 */
async function getPageContent(path) {
  // Use path as-is - it's the unique identifier
  const url = `${state.apiConfig.baseUrl}/source${path}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Extract assets from HTML content
 */
function extractAssetsFromHTML(html, sourcePath) {
  const assets = [];

  // Extract different types of assets using regex patterns
  extractImgTags(html, assets, sourcePath);
  extractPictureSources(html, assets, sourcePath);
  extractBackgroundImages(html, assets, sourcePath);
  extractVideoSources(html, assets, sourcePath);
  extractMediaLinks(html, assets, sourcePath);
  extractCSSBackgrounds(html, assets, sourcePath);

  // Deduplicate assets
  const deduplicated = deduplicateAssets(assets);
  return deduplicated;
}

/**
 * Extract img tags using regex
 */
function extractImgTags(html, assets, sourcePath) {
  // Match img tags with src attribute
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && isValidMediaSrc(src)) {
      // Extract additional attributes
      const imgTag = match[0];
      const altMatch = imgTag.match(/alt\s*=\s*["']([^"']*)["']/i);
      const widthMatch = imgTag.match(/width\s*=\s*["']?(\d+)["']?/i);
      const heightMatch = imgTag.match(/height\s*=\s*["']?(\d+)["']?/i);
      const srcsetMatch = imgTag.match(/srcset\s*=\s*["']([^"']+)["']/i);

      assets.push({
        src: normalizeAssetSrc(src),
        alt: altMatch ? altMatch[1] : '',
        usedIn: [sourcePath],
        dimensions: {
          width: widthMatch ? parseInt(widthMatch[1], 10) : null,
          height: heightMatch ? parseInt(heightMatch[1], 10) : null,
        },
        context: 'img-tag',
      });

      // Handle srcset
      if (srcsetMatch) {
        const srcsetAssets = parseSrcset(srcsetMatch[1], sourcePath);
        assets.push(...srcsetAssets);
      }
    }
  }
}

/**
 * Extract picture sources using regex
 */
function extractPictureSources(html, assets, sourcePath) {
  // Match picture source tags with srcset attribute
  const sourceRegex = /<source[^>]+srcset\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = sourceRegex.exec(html)) !== null) {
    const srcset = match[1];
    if (srcset) {
      const srcsetAssets = parseSrcset(srcset, sourcePath);
      assets.push(...srcsetAssets);
    }
  }
}

/**
 * Extract background images from style attributes using regex
 */
function extractBackgroundImages(html, assets, sourcePath) {
  // Match elements with style attributes containing background
  const styleRegex = /<[^>]+style\s*=\s*["'][^"']*background[^"']*["'][^>]*>/gi;
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    const element = match[0];
    const styleMatch = element.match(/style\s*=\s*["']([^"']+)["']/i);

    if (styleMatch) {
      const style = styleMatch[1];
      const bgAssets = extractBgImagesFromStyle(style, sourcePath);
      assets.push(...bgAssets);
    }
  }
}

/**
 * Extract video sources using regex
 */
function extractVideoSources(html, assets, sourcePath) {
  // Match video tags
  const videoRegex = /<video[^>]*>.*?<\/video>/gis;
  let videoMatch;

  while ((videoMatch = videoRegex.exec(html)) !== null) {
    const videoTag = videoMatch[0];

    // Extract poster attribute
    const posterMatch = videoTag.match(/poster\s*=\s*["']([^"']+)["']/i);
    if (posterMatch && isMediaUrl(posterMatch[1])) {
      assets.push({
        src: normalizeAssetSrc(posterMatch[1]),
        alt: '',
        usedIn: [sourcePath],
        dimensions: {},
        context: 'video-poster',
      });
    }

    // Extract src attribute
    const srcMatch = videoTag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && isMediaUrl(srcMatch[1])) {
      assets.push({
        src: normalizeAssetSrc(srcMatch[1]),
        alt: '',
        usedIn: [sourcePath],
        dimensions: {},
        context: 'video-src',
      });
    }

    // Extract source tags within video
    const sourceRegex = /<source[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let sourceMatch;
    while ((sourceMatch = sourceRegex.exec(videoTag)) !== null) {
      const src = sourceMatch[1];
      if (isMediaUrl(src)) {
        assets.push({
          src: normalizeAssetSrc(src),
          alt: '',
          usedIn: [sourcePath],
          dimensions: {},
          context: 'video-source',
        });
      }
    }
  }
}

/**
 * Extract media links using regex
 */
function extractMediaLinks(html, assets, sourcePath) {

  // More flexible regex to match anchor tags with href
  const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];

    if (href && isMediaUrl(href)) {
      // Extract title attribute if present
      const titleMatch = match[0].match(/title\s*=\s*["']([^"']*)["']/i);
      const title = titleMatch ? titleMatch[1] : '';

      // Extract link text (content between <a> and </a>)
      const fullMatch = match[0];
      const linkStart = match.index + fullMatch.length;
      const linkEnd = html.indexOf('</a>', linkStart);
      const linkText = linkEnd > linkStart ? html.substring(linkStart, linkEnd).trim() : '';

      // Check if this is an external image link
      const isExternal = isExternalAsset(href);

      assets.push({
        src: href, // Store the original href as src for external assets
        alt: title || linkText || extractFilenameFromUrl(href),
        usedIn: [sourcePath],
        dimensions: {},
        context: isExternal ? 'external-link' : 'media-link',
        isExternal: isExternal,
        originalHref: href, // Keep original href for external assets
      });

    }
  }

}

/**
 * Extract CSS backgrounds from style elements using regex
 */
function extractCSSBackgrounds(html, assets, sourcePath) {
  // Match style elements
  const styleRegex = /<style[^>]*>(.*?)<\/style>/gis;
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    const cssText = match[1];
    if (cssText) {
      const bgAssets = extractBgImagesFromCSS(cssText, sourcePath);
      assets.push(...bgAssets);
    }
  }
}

/**
 * Extract background images from style attribute
 */
function extractBgImagesFromStyle(style, sourcePath) {
  const bgImageRegex = /background(?:-image)?:\s*url\(['"]?([^'")]+)['"]?\)/gi;
  const assets = [];
  let match;

  while ((match = bgImageRegex.exec(style)) !== null) {
    const src = match[1];
    if (isValidMediaSrc(src)) {
      assets.push({
        src: normalizeAssetSrc(src),
        alt: '',
        usedIn: [sourcePath],
        dimensions: {},
        context: 'bg-style',
      });
    }
  }

  return assets;
}

/**
 * Extract background images from CSS text
 */
function extractBgImagesFromCSS(cssText, sourcePath) {
  const bgImageRegex = /background(?:-image)?:\s*url\(['"]?([^'")]+)['"]?\)/gi;
  const assets = [];
  let match;

  while ((match = bgImageRegex.exec(cssText)) !== null) {
    const src = match[1];
    if (isValidMediaSrc(src)) {
      assets.push({
        src: normalizeAssetSrc(src),
        alt: '',
        usedIn: [sourcePath],
        dimensions: {},
        context: 'bg-css',
      });
    }
  }

  return assets;
}

/**
 * Normalize asset source URL
 */
function normalizeAssetSrc(src) {
  if (!src) return '';

  if (src.startsWith('/')) {
    return src;
  } if (src.startsWith('./')) {
    return src.substring(1);
  } if (!src.startsWith('http')) {
    return '/' + src;
  }

  return src;
}

/**
 * Check if source is valid media
 */
function isValidMediaSrc(src) {
  return src
         && typeof src === 'string'
         && src.trim() !== ''
         && !src.startsWith('data:')
         && !src.startsWith('#');
}

/**
 * Check if URL is media
 */
function isMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Check for common image extensions
  const imageExts = 'jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico';
  const videoExts = 'mp4|webm|ogg|avi|mov|wmv|flv';
  const docExts = 'pdf|doc|docx|xls|xlsx|ppt|pptx';
  const mediaExtensions = new RegExp(`\\.(${imageExts}|${videoExts}|${docExts})`, 'i');

  // Check for extensions in URL
  if (mediaExtensions.test(url)) return true;

  // Check for image service patterns (like scene7.com)
  const imageServicePatterns = [
    /scene7\.com.*\/is\/image/i,
    /cloudinary\.com/i,
    /imagekit\.io/i,
    /cdn\.shopify\.com/i,
    /images\.unsplash\.com/i,
    /amazonaws\.com.*\.(png|jpg|jpeg|gif|webp)/i,
  ];

  return imageServicePatterns.some((pattern) => pattern.test(url));
}

/**
 * Check if asset is external
 */
function isExternalAsset(src) {
  if (!src) return false;

  try {
    const url = new URL(src);
    const hostname = url.hostname;

    // Check for external patterns
    const externalPatterns = [
      'scene7.com', 'akamai.net', 'cloudfront.net', 's3.amazonaws.com',
      'cdn.', 'static.', 'media.', 'sling.com', 'dish.com',
    ];

    return externalPatterns.some((pattern) => hostname.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url) {
  if (!url) return 'Untitled Asset';

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'asset';

    // Clean up the name for display
    const nameWithoutExt = filename.split('.')[0];
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim() || 'Untitled Asset';
  } catch (error) {
    return 'Untitled Asset';
  }
}

/**
 * Parse srcset attribute
 */
function parseSrcset(srcset, sourcePath) {
  return srcset.split(',')
    .map((src) => src.trim().split(/\s+/)[0])
    .filter((src) => src && isValidMediaSrc(src))
    .map((src) => ({
      src: normalizeAssetSrc(src),
      alt: '',
      usedIn: [sourcePath],
      dimensions: {},
      context: 'srcset',
    }));
}

/**
 * Deduplicate assets
 */
function deduplicateAssets(assets) {
  const seen = new Set();

  return assets.filter((asset) => {
    const key = `${asset.src}-${asset.usedIn[0]}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Create concurrent groups for processing
 */
function createConcurrentGroups(array, groupSize) {
  const groups = [];
  for (let i = 0; i < array.length; i += groupSize) {
    groups.push(array.slice(i, i + groupSize));
  }
  return groups;
}

/**
 * Stop queue processing
 */
function stopQueueProcessing() {
  state.isRunning = false;
  // Media Scan Worker: Stopped queue processing

  postMessage({
    type: 'queueProcessingStopped',
    data: {},
  });
}

// Message handler
// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'init': {
        init(data.apiConfig);
        postMessage({ type: 'initialized' });
        break;
      }

      case 'startQueueProcessing': {
        await startQueueProcessing();
        break;
      }

      case 'stopQueueProcessing': {
        stopQueueProcessing();
        break;
      }

      case 'processBatch': {
        await processBatch(data.pages);
        break;
      }

      default: {
        // eslint-disable-next-line no-console
        console.warn('[DA] media-scan-worker: Unknown message type', type);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DA] media-scan-worker: Error handling message', type, error);
    postMessage({
      type: 'error',
      data: { error: error.message, originalType: type },
    });
  }
});
