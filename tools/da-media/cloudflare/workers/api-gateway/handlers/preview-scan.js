/**
 * Preview Content Scan Handler
 * Handles scanning of published content for images and assets
 * Called by GitHub Actions when content is published
 */

import {
  validateMethod,
  createSuccessResponse,
  createErrorResponse,
  CONFIG,
} from '../utils.js';

/**
 * Handle preview content scan requests from GitHub Actions
 */
export async function handlePreviewContentScan(request, env) {
  validateMethod(request, ['POST']);

  try {
    const {
      previewUrl, path, site, org, publishedAt, trigger,
    } = await request.json();

    if (!previewUrl || !path || !site || !org) {
      return createErrorResponse('Missing required fields: previewUrl, path, site, org', {
        status: CONFIG.HTTP_STATUS.BAD_REQUEST,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`🔍 Scanning preview content: ${previewUrl}`);

    // Fetch the preview content
    const previewResponse = await fetch(previewUrl, {
      headers: {
        'User-Agent': 'DA-Media-Library-Scanner/1.0',
      },
    });

    if (!previewResponse.ok) {
      return createErrorResponse(`Failed to fetch preview content: ${previewResponse.status}`, {
        status: CONFIG.HTTP_STATUS.BAD_REQUEST,
      });
    }

    const htmlContent = await previewResponse.text();

    // Extract images from the HTML content
    const extractedImages = await extractImagesFromHTML(htmlContent, {
      path,
      site,
      org,
      previewUrl,
      publishedAt,
      trigger,
    });

    // Process and store each image
    const processedImages = [];
    const errors = [];

    for (const imageData of extractedImages) {
      try {
        const processed = await processImageFromPreview(imageData, {
          path,
          site,
          org,
          publishedAt,
          trigger,
        }, env);

        if (processed) {
          processedImages.push(processed);
        }
      } catch (error) {
        errors.push({
          src: imageData.src,
          error: error.message,
        });
      }
    }

    const result = {
      success: true,
      scanned: {
        previewUrl,
        path,
        site,
        org,
        publishedAt,
        trigger,
      },
      results: {
        totalImagesFound: extractedImages.length,
        successfullyProcessed: processedImages.length,
        errors: errors.length,
      },
      processedImages: processedImages.slice(0, 5), // Show first 5 for debugging
      errors: errors.slice(0, 3), // Show first 3 errors
      timestamp: new Date().toISOString(),
    };

    // eslint-disable-next-line no-console
    console.log(`✅ Preview scan complete: ${processedImages.length}/${extractedImages.length} images processed`);

    return createSuccessResponse(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Preview content scan failed:', error);
    return createErrorResponse(error, {
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      message: 'Failed to scan preview content',
    });
  }
}

/**
 * Extract images from HTML content
 */
async function extractImagesFromHTML(htmlContent, pageContext) {
  const images = [];

  // 1. Extract images from img tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const src = match[1];

    // Skip data URLs, SVGs, and very small images
    if (src.startsWith('data:') || src.includes('.svg') || src.includes('1x1')) {
      continue;
    }

    // Extract additional attributes
    const imgTag = match[0];
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
    const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);

    const imageData = {
      src: decodeHtmlEntities(resolveImageUrl(src, pageContext)),
      originalSrc: decodeHtmlEntities(src),
      alt: altMatch ? decodeHtmlEntities(altMatch[1]) : '',
      width: widthMatch ? parseInt(widthMatch[1], 10) : null,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null,
      context: pageContext.path,
      foundAt: new Date().toISOString(),
      sourceType: 'img-tag',
    };

    images.push(imageData);
  }

  // 2. Extract external asset links from anchor tags
  // Pattern: <a href="https://external-domain.com/image-url">filename.ext</a>
  const externalLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*(?:title=["']([^"']*)["'][^>]*)?>(.*?)<\/a>/gi;

  while ((match = externalLinkRegex.exec(htmlContent)) !== null) {
    const href = match[1];
    const title = match[2] || '';
    const linkText = match[3];

    // Only process external image URLs (not internal links)
    if (href.startsWith('http') && isImageUrl(href)) {
      // Check if link text contains an image filename
      const hasImageExtension = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(linkText.trim());

      const imageData = {
        src: decodeHtmlEntities(href),
        originalSrc: decodeHtmlEntities(href),
        alt: decodeHtmlEntities(title) || (hasImageExtension ? linkText.trim() : extractFilenameFromUrl(href)),
        width: null,
        height: null,
        context: pageContext.path,
        foundAt: new Date().toISOString(),
        sourceType: 'external-link',
        linkText: linkText.trim(),
      };

      images.push(imageData);
    }
  }

  // 3. Additional pattern for external links without filename in link text
  // Pattern: <a href="https://external-domain.com/image-url" title="Alt text">...</a>
  const externalLinkRegex2 = /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["'][^>]*>/gi;

  while ((match = externalLinkRegex2.exec(htmlContent)) !== null) {
    const href = match[1];
    const title = match[2];

    // Only process external image URLs that we haven't already captured
    if (href.startsWith('http') && isImageUrl(href) && !images.some((img) => img.src === href)) {
      const imageData = {
        src: decodeHtmlEntities(href),
        originalSrc: decodeHtmlEntities(href),
        alt: decodeHtmlEntities(title) || extractFilenameFromUrl(href),
        width: null,
        height: null,
        context: pageContext.path,
        foundAt: new Date().toISOString(),
        sourceType: 'external-link-titled',
      };

      images.push(imageData);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`🔍 Extracted ${images.length} images: ${
    images.filter((i) => i.sourceType === 'img-tag').length} from img tags, ${
    images.filter((i) => i.sourceType.includes('external')).length} from external links`);

  return images;
}

/**
 * Process image from preview scan
 */
async function processImageFromPreview(imageData, pageContext, env) {
  if (!env.DA_MEDIA_KV) {
    throw new Error('KV storage not available');
  }

  // Generate unique ID for the image
  const imageId = generateImageId(imageData.src);
  // Org-aware key structure: org:site:image:id
  const kvKey = `org:${pageContext.org}:site:${pageContext.site}:${CONFIG.PREFIXES.IMAGE}${imageId}`;

  // Check if image already exists
  const existingImage = await env.DA_MEDIA_KV.get(kvKey, 'json');

  if (existingImage) {
    // Update usage information
    const updatedImage = {
      ...existingImage,
      lastSeen: new Date().toISOString(),
      usageCount: (existingImage.usageCount || 0) + 1,
      usedInPages: [
        ...(existingImage.usedInPages || []),
        {
          path: pageContext.path,
          context: pageContext.trigger,
          scannedAt: pageContext.publishedAt,
        },
      ].slice(-10), // Keep last 10 usage records
      // Update sourceType if missing
      sourceType: existingImage.sourceType || imageData.sourceType || 'img-tag',
    };

    await env.DA_MEDIA_KV.put(kvKey, JSON.stringify(updatedImage));
    return {
      id: imageId,
      action: 'updated',
      displayName: existingImage.displayName,
      src: existingImage.src,
      alt: existingImage.originalAltText || existingImage.displayName,
      isExternal: existingImage.isExternal,
      sourceType: updatedImage.sourceType,
      dimensions: existingImage.dimensions,
    };
  }

  // Create new image record
  const newImage = {
    id: imageId,
    src: imageData.src,
    originalSrc: imageData.originalSrc,
    displayName: generateDisplayName(imageData),
    originalAltText: imageData.alt,
    dimensions: {
      width: imageData.width,
      height: imageData.height,
    },
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    usageCount: 1,
    usedInPages: [{
      path: pageContext.path,
      context: pageContext.trigger,
      scannedAt: pageContext.publishedAt,
    }],
    isExternal: isExternalAsset(imageData.src, pageContext),
    source: 'preview-scan',
    scanMetadata: {
      trigger: pageContext.trigger,
      scannedAt: pageContext.publishedAt,
      previewUrl: pageContext.previewUrl,
    },
    // Add org/site context
    org: pageContext.org,
    site: pageContext.site,
  };

  await env.DA_MEDIA_KV.put(kvKey, JSON.stringify(newImage));
  return {
    id: imageId,
    action: 'created',
    displayName: newImage.displayName,
    src: newImage.src,
    alt: newImage.originalAltText || newImage.displayName,
    isExternal: newImage.isExternal,
    sourceType: imageData.sourceType,
    dimensions: newImage.dimensions,
  };
}

/**
 * Generate image ID from URL
 */
function generateImageId(src) {
  // For internal AEM images, extract the hash from the filename
  if (src.includes('media_') && src.includes('.aem.page')) {
    const match = src.match(/media_([a-f0-9]+)\./);
    if (match && match[1]) {
      return match[1]; // Return just the hash part (40 chars)
    }
  }

  // For external images, generate a consistent 40-character hash
  return generateConsistentHash(src);
}

/**
 * Generate consistent 40-character hash for external assets
 */
function generateConsistentHash(str) {
  // Use multiple hash algorithms to create a 40-char hex string
  const input = str.toLowerCase().trim();
  let hash1 = 0;
  let hash2 = 0;
  let hash3 = 0;
  let hash4 = 0;
  let hash5 = 0;

  // Multiple hash passes for better distribution
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash2 = ((hash2 << 3) + hash2) ^ char;
    hash3 = ((hash3 << 7) + hash3) + (char * 31);
    hash4 = ((hash4 << 2) + hash4) + (char * 17);
    hash5 = ((hash5 << 4) + hash5) ^ (char * 13);
  }

  // Convert to positive integers and create hex strings
  const hex1 = Math.abs(hash1).toString(16).padStart(8, '0').substring(0, 8);
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0').substring(0, 8);
  const hex3 = Math.abs(hash3).toString(16).padStart(8, '0').substring(0, 8);
  const hex4 = Math.abs(hash4).toString(16).padStart(8, '0').substring(0, 8);
  const hex5 = Math.abs(hash5).toString(16).padStart(8, '0').substring(0, 8);

  // Combine to create 40-character hash (same length as AEM hashes)
  return `${hex1}${hex2}${hex3}${hex4}${hex5}`.substring(0, 40);
}

/**
 * Generate display name for image
 */
function generateDisplayName(imageData) {
  // Use alt text if available
  if (imageData.alt && imageData.alt.trim()) {
    return imageData.alt.trim();
  }

  // Extract filename from URL
  try {
    const url = new URL(imageData.src);
    const { pathname } = url;
    const filename = pathname.split('/').pop() || 'image';
    const nameWithoutExt = filename.split('.')[0];

    // Clean up the name
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim() || 'Untitled Image';
  } catch (error) {
    return 'Untitled Image';
  }
}

/**
 * Resolve relative image URLs
 */
function resolveImageUrl(src, pageContext) {
  if (src.startsWith('http')) {
    return src;
  }

  // Handle relative URLs
  if (src.startsWith('./')) {
    const baseUrl = `https://main--${pageContext.site}--${pageContext.org}.aem.page`;
    const pathDir = pageContext.path.split('/').slice(0, -1).join('/');
    return `${baseUrl}${pathDir}/${src.substring(2)}`;
  }

  if (src.startsWith('/')) {
    const baseUrl = `https://main--${pageContext.site}--${pageContext.org}.aem.page`;
    return `${baseUrl}${src}`;
  }

  return src;
}

/**
 * Check if asset is external
 */
function isExternalAsset(src, pageContext) {
  if (!src) return false;

  try {
    const url = new URL(src);
    const expectedDomain = `main--${pageContext.site}--${pageContext.org}.aem.page`;
    return !url.hostname.includes(expectedDomain);
  } catch (error) {
    return false;
  }
}

/**
 * Check if URL appears to be an image
 */
function isImageUrl(url) {
  if (!url) return false;

  // Check for common image extensions in the URL
  const imageExtensions = /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff)(\?|$|#)/i;
  if (imageExtensions.test(url)) return true;

  // Check for common image service patterns
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
 * Extract filename from path
 */
// function extractFilenameFromPath(path) {
//   if (!path) return 'Untitled Image';
//   return path.split('/').pop() || 'Untitled Image';
// }

/**
 * Decode HTML entities in URLs and text
 */
function decodeHtmlEntities(text) {
  if (!text) return text;

  // Common HTML entities that appear in URLs
  const entityMap = {
    '&#x26;': '&',
    '&amp;': '&',
    '&#38;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#39;': "'",
    '&apos;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
    '&#x3D;': '=',
    '&#61;': '=',
    '&#x3F;': '?',
    '&#63;': '?',
    '&#x23;': '#',
    '&#35;': '#',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entityMap)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  return decoded;
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url) {
  if (!url) return 'Untitled Image';

  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop() || 'image';

    // Clean up the name for display
    const nameWithoutExt = filename.split('.')[0];
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim() || 'Untitled Image';
  } catch (error) {
    return 'Untitled Image';
  }
}
