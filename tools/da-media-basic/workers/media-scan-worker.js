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

  // Media Scan Worker: Processing batch

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
    // Media Scan Worker: Scanning page

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

    // Media Scan Worker: Scan completed

  } catch (error) {
    // Media Scan Worker: Failed to scan page

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
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const assets = [];

  // Extract different types of assets
  extractImgTags(doc, assets, sourcePath);
  extractPictureSources(doc, assets, sourcePath);
  extractBackgroundImages(doc, assets, sourcePath);
  extractVideoSources(doc, assets, sourcePath);
  extractMediaLinks(doc, assets, sourcePath);
  extractCSSBackgrounds(doc, assets, sourcePath);

  // Deduplicate assets
  return deduplicateAssets(assets);
}

/**
 * Extract img tags
 */
function extractImgTags(doc, assets, sourcePath) {
  const images = doc.querySelectorAll('img[src]');

  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (src && isValidMediaSrc(src)) {
      assets.push(createAssetFromElement(img, sourcePath, 'img-tag'));
    }

    // Handle srcset
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const srcsetAssets = parseSrcset(srcset, sourcePath);
      assets.push(...srcsetAssets);
    }
  });
}

/**
 * Extract picture sources
 */
function extractPictureSources(doc, assets, sourcePath) {
  const sources = doc.querySelectorAll('picture source[srcset]');

  sources.forEach((source) => {
    const srcset = source.getAttribute('srcset');
    if (srcset) {
      const srcsetAssets = parseSrcset(srcset, sourcePath);
      assets.push(...srcsetAssets);
    }
  });
}

/**
 * Extract background images from style attributes
 */
function extractBackgroundImages(doc, assets, sourcePath) {
  const elementsWithStyle = doc.querySelectorAll('[style*="background"]');

  elementsWithStyle.forEach((element) => {
    const style = element.getAttribute('style');
    if (style) {
      const bgAssets = extractBgImagesFromStyle(style, sourcePath);
      assets.push(...bgAssets);
    }
  });
}

/**
 * Extract video sources
 */
function extractVideoSources(doc, assets, sourcePath) {
  const videos = doc.querySelectorAll('video');

  videos.forEach((video) => {
    const poster = video.getAttribute('poster');
    if (poster && isMediaUrl(poster)) {
      assets.push(createAssetFromAttribute(poster, sourcePath, 'video-poster'));
    }

    const src = video.getAttribute('src');
    if (src && isMediaUrl(src)) {
      assets.push(createAssetFromAttribute(src, sourcePath, 'video-src'));
    }

    const sources = video.querySelectorAll('source');
    sources.forEach((source) => {
      const srcValue = source.getAttribute('src');
      if (srcValue && isMediaUrl(srcValue)) {
        assets.push(createAssetFromAttribute(srcValue, sourcePath, 'video-source'));
      }
    });
  });
}

/**
 * Extract media links
 */
function extractMediaLinks(doc, assets, sourcePath) {
  const links = doc.querySelectorAll('a[href]');

  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (href && isMediaUrl(href)) {
      assets.push(createAssetFromAttribute(href, sourcePath, 'media-link'));
    }
  });
}

/**
 * Extract CSS backgrounds from style elements
 */
function extractCSSBackgrounds(doc, assets, sourcePath) {
  const styleElements = doc.querySelectorAll('style');

  styleElements.forEach((styleElement) => {
    const cssText = styleElement.textContent;
    if (cssText) {
      const bgAssets = extractBgImagesFromCSS(cssText, sourcePath);
      assets.push(...bgAssets);
    }
  });
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
      assets.push(createAssetFromAttribute(src, sourcePath, 'bg-style'));
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
      assets.push(createAssetFromAttribute(src, sourcePath, 'bg-css'));
    }
  }

  return assets;
}

/**
 * Create asset from element
 */
function createAssetFromElement(element, sourcePath, context) {
  const src = element.getAttribute('src');
  const alt = element.getAttribute('alt') || '';
  const width = element.getAttribute('width');
  const height = element.getAttribute('height');

  return {
    src: normalizeAssetSrc(src),
    alt,
    usedIn: [sourcePath],
    dimensions: {
      width: width ? parseInt(width, 10) : null,
      height: height ? parseInt(height, 10) : null,
    },
    context,
  };
}

/**
 * Create asset from attribute
 */
function createAssetFromAttribute(src, sourcePath, context) {
  return {
    src: normalizeAssetSrc(src),
    alt: '',
    usedIn: [sourcePath],
    dimensions: {},
    context,
  };
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

  const imageExts = 'jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico';
  const videoExts = 'mp4|webm|ogg|avi|mov|wmv|flv';
  const docExts = 'pdf|doc|docx|xls|xlsx|ppt|pptx';
  const mediaExtensions = new RegExp(`\\.(${imageExts}|${videoExts}|${docExts})`, 'i');
  return mediaExtensions.test(url);
}

/**
 * Parse srcset attribute
 */
function parseSrcset(srcset, sourcePath) {
  return srcset.split(',')
    .map((src) => src.trim().split(/\s+/)[0])
    .filter((src) => src && isValidMediaSrc(src))
    .map((src) => createAssetFromAttribute(src, sourcePath, 'srcset'));
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
        // Media Scan Worker: Unknown message type
      }
    }
  } catch (error) {
    // Media Scan Worker: Error handling message
    postMessage({
      type: 'error',
      data: { error: error.message, originalType: type },
    });
  }
});
