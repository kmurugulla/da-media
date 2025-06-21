/**
 * Create Scan Worker
 * Background HTML parsing to prevent UI blocking
 */
function createScanWorker() {
  const state = {
    apiConfig: null,
    isProcessing: false,
  };

  const api = {
    init,
    startScan,
    processBatch,
    scanFile,
    extractImagesFromHTML,
  };

  function init(config) {
    state.apiConfig = config;
  }

  async function startScan(data) {
    const { files, batchSize = 5 } = data;
    state.isProcessing = true;

    // eslint-disable-next-line no-console
    console.log('Worker: Starting scan with', files.length, 'files');

    try {
      const batches = createBatches(files, batchSize);
      const results = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchResults = await processBatch(batch);

        results.push(...batchResults);

        postMessage({
          type: 'progress',
          data: {
            completed: (i + 1) * batchSize,
            total: files.length,
            currentBatch: i + 1,
            totalBatches: batches.length,
          },
        });

        if (i < batches.length - 1) {
          await delay(100);
        }
      }

      postMessage({
        type: 'complete',
        data: results,
      });

    } catch (error) {
      postMessage({
        type: 'error',
        data: { error: error.message },
      });
    } finally {
      state.isProcessing = false;
    }
  }

  async function processBatch(files) {
    const results = await Promise.allSettled(
      files.map((file) => scanFile(file)),
    );

    return results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  async function scanFile(file) {
    try {
      // eslint-disable-next-line no-console
      console.log('Worker: Scanning file', file.path);

      const content = await getFileContent(file.path);

      // eslint-disable-next-line no-console
      console.log('Worker: Got content for', file.path, 'length:', content.length);

      const assets = extractImagesFromHTML(content, file.path);

      // eslint-disable-next-line no-console
      console.log('Worker: Found', assets.length, 'assets in', file.path);

      return {
        file,
        assets,
        scannedAt: Date.now(),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Worker: Failed to scan', file.path, error);
      throw new Error(`Failed to scan ${file.path}: ${error.message}`);
    }
  }

  async function getFileContent(path) {
    if (!state.apiConfig) {
      throw new Error('API not configured');
    }

    // Use the exact path from DA API - it's already correct
    const url = `${state.apiConfig.baseUrl}/source${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${state.apiConfig.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  function extractImagesFromHTML(html, sourcePath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const assets = [];

    extractImgTags(doc, assets, sourcePath);
    extractPictureSources(doc, assets, sourcePath);
    extractBackgroundImages(doc, assets, sourcePath);
    extractVideoSources(doc, assets, sourcePath);
    extractMediaLinks(doc, assets, sourcePath);
    extractCSSBackgrounds(doc, assets, sourcePath);

    return deduplicateAssets(assets);
  }

  function extractImgTags(doc, assets, sourcePath) {
    const imgElements = doc.querySelectorAll('img');

    imgElements.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && isValidMediaSrc(src)) {
        assets.push(createAssetFromElement(img, sourcePath, 'img'));
      }

      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const srcsetAssets = parseSrcset(srcset, sourcePath);
        assets.push(...srcsetAssets);
      }
    });
  }

  function extractPictureSources(doc, assets, sourcePath) {
    const pictureElements = doc.querySelectorAll('picture');

    pictureElements.forEach((picture) => {
      const sources = picture.querySelectorAll('source');

      sources.forEach((source) => {
        const srcset = source.getAttribute('srcset');
        if (srcset) {
          const srcsetAssets = parseSrcset(srcset, sourcePath);
          assets.push(...srcsetAssets);
        }
      });

      const img = picture.querySelector('img');
      if (img) {
        const src = img.getAttribute('src');
        if (src && isValidMediaSrc(src)) {
          assets.push(createAssetFromElement(img, sourcePath, 'picture-img'));
        }
      }
    });
  }

  function extractBackgroundImages(doc, assets, sourcePath) {
    const elementsWithStyle = doc.querySelectorAll('[style]');

    elementsWithStyle.forEach((element) => {
      const style = element.getAttribute('style');
      const bgAssets = extractBgImagesFromStyle(style, sourcePath);
      assets.push(...bgAssets);
    });
  }

  function extractVideoSources(doc, assets, sourcePath) {
    const videoElements = doc.querySelectorAll('video');

    videoElements.forEach((video) => {
      const poster = video.getAttribute('poster');
      if (poster && isValidMediaSrc(poster)) {
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

  function extractMediaLinks(doc, assets, sourcePath) {
    const links = doc.querySelectorAll('a[href]');

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (href && isMediaUrl(href)) {
        assets.push(createAssetFromAttribute(href, sourcePath, 'media-link'));
      }
    });
  }

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

  function createAssetFromAttribute(src, sourcePath, context) {
    return {
      src: normalizeAssetSrc(src),
      alt: '',
      usedIn: [sourcePath],
      dimensions: {},
      context,
    };
  }

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

  function isValidMediaSrc(src) {
    return src
           && typeof src === 'string'
           && src.trim() !== ''
           && !src.startsWith('data:')
           && !src.startsWith('#');
  }

  function isMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;

    const imageExts = 'jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico';
    const videoExts = 'mp4|webm|ogg|avi|mov|wmv|flv';
    const docExts = 'pdf|doc|docx|xls|xlsx|ppt|pptx';
    const mediaExtensions = new RegExp(`\\.(${imageExts}|${videoExts}|${docExts})`, 'i');
    return mediaExtensions.test(url);
  }


  function parseSrcset(srcset, sourcePath) {
    return srcset.split(',')
      .map((src) => src.trim().split(/\s+/)[0])
      .filter((src) => src && isValidMediaSrc(src))
      .map((src) => createAssetFromAttribute(src, sourcePath, 'srcset'));
  }

  function createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  function delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  return api;
}

const workerInstance = createScanWorker();

// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', async (event) => {
  const { type, ...data } = event.data;

  switch (type) {
    case 'scan':
      workerInstance.init(data.apiConfig);
      await workerInstance.startScan(data);
      break;
    default:
      // Unknown message type
  }
});

