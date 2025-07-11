/**
 * Asset Loader Module
 * Handles loading assets from various sources with caching and error handling
 */
import { Utils } from './utils.js';
import { getApiEndpoint } from './config.js';

/**
 * AssetLoader handles loading and transforming assets from various sources
 */
export class AssetLoader {
  constructor(apiEndpoint = null) {
    this.apiEndpoint = apiEndpoint || getApiEndpoint();
    this.cache = new Map();
  }

  /**
   * Load all assets from available sources
   */
  async loadAllAssets() {
    try {
      const analyzedImages = await this.loadAnalyzedImages();

      const mergedInternalImages = this.mergeAnalyzedWithSource(
        analyzedImages.filter((img) => !img.isExternal),
      );

      const externalImages = analyzedImages.filter((img) => img.isExternal);
      const uniqueExternalImages = this.removeDuplicateExternalImages(externalImages);
      const allAssets = [...mergedInternalImages, ...uniqueExternalImages];

      return allAssets;
    } catch (error) {
      return this.generateMockAssets();
    }
  }

  /**
   * Load analyzed images from Cloudflare Worker
   */
  async loadAnalyzedImages() {
    const cacheKey = 'da-media-analyzed-images';
    const cacheExpiry = 5 * 60 * 1000;

    const cached = this.getFromCache(cacheKey, cacheExpiry);
    if (cached) {
      return this.transformAnalyzedImages(cached.images || []);
    }

    try {

      let response = await fetch(
        `${this.apiEndpoint}/api/images?includeExternal=true&limit=100`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) {
        response = await fetch(`${this.apiEndpoint}/api/analyzed-images-fast`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to load analyzed images: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.setCache(cacheKey, data);
      const images = data.images || data.data?.images || [];

      return this.transformAnalyzedImages(images);
    } catch (error) {
      return [];
    }
  }

  /**
   * Load DA source assets (placeholder for now)
   */
  async loadDASourceAssets() {
    return [];
  }

  /**
   * Transform analyzed images to standardized asset format
   */
  transformAnalyzedImages(analyzedImages) {
    return analyzedImages.map((img) => {
      const isExternal = img.isExternal || false;

      const aiScore = isExternal
        ? this.calculateExternalAssetScore(img)
        : this.calculateAnalyzedImageScore(img);

      // For external assets, try multiple ways to detect type
      let extension = Utils.extractExtensionFromSrc(img.src);

      // If no extension found in URL, try the displayName
      if (!extension && img.displayName) {
        extension = Utils.extractExtensionFromSrc(img.displayName);
      }

      let assetType = Utils.detectTypeFromExtension(extension);

      // For external assets from known image CDNs, assume image type if detection failed
      if (isExternal && assetType === 'unknown') {
        if (img.src && (img.src.includes('scene7.com') || img.src.includes('cloudfront.net')
          || img.src.includes('akamai') || img.src.includes('/image/'))) {
          assetType = 'image';
        }
      }

      const category = isExternal
        ? 'external'
        : this.mapContextToCategory(img.usedInPages?.[0]?.context || 'content');

      let assetUrl;
      let originalUrl;
      if (isExternal) {
        // For external assets, prefer originalSrc over src
        assetUrl = img.originalSrc || img.src;
        originalUrl = img.originalSrc || img.src;

        if (!assetUrl || assetUrl.startsWith('[EXTERNAL]')) {
          assetUrl = null;
          originalUrl = null;
        }
      } else {
        assetUrl = Utils.resolveAssetUrl(img.src);
        originalUrl = assetUrl;
      }

      const transformedAsset = {
        id: img.id,
        name: img.displayName,
        type: assetType,
        category,
        path: img.src,
        url: assetUrl,
        originalUrl: originalUrl,
        aiScore,
        isAIEnhanced: !isExternal,
        isExternal,
        tags: isExternal
          ? this.generateExternalAssetTags(img)
          : this.generateTagsFromAnalysis(img),
        size: (img.dimensions?.width || 0) * (img.dimensions?.height || 0),
        created: img.firstSeen,
        lastUsed: img.lastSeen,
        source: isExternal ? 'external-scan' : 'preview-analysis',
        usageCount: img.usageCount || 0,

        displayName: img.displayName,
        originalAltText: img.originalAltText,
        aiGeneratedAltText: img.aiGeneratedAltText,
        dimensions: img.dimensions,
        usedInPages: img.usedInPages || [],
        aiAnalysis: img.aiAnalysis,

        sourceDomain: img.sourceDomain || null,
        migrationPriority: img.migrationPriority || (isExternal ? 'medium' : 'low'),
        needsMigration: isExternal,
        assetCategory: img.assetCategory || 'unknown',

        description: img.aiAnalysis?.description || img.originalAltText || img.displayName,
        confidence: img.aiAnalysis?.confidence || 0.5,

        lastUsedFormatted: img.lastSeen
          ? new Date(img.lastSeen).toLocaleDateString()
          : 'Never',

        responsivePattern: img.responsivePattern || null,
        originalPictureHTML: null,
        hasResponsive: !!(img.responsivePattern?.hasResponsive),
      };

      return transformedAsset;
    });
  }

  /**
   * Merge analyzed images with DA source assets
   */
  mergeAnalyzedWithSource(analyzedImages) {
    return analyzedImages;
  }

  /**
   * Remove duplicate external images
   */
  removeDuplicateExternalImages(externalImages) {
    const seen = new Map();
    const unique = [];

    externalImages.forEach((img) => {
      const cleanName = this.extractCleanAssetName(img.displayName || img.name || '');
      const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!seen.has(key)) {
        seen.set(key, img);
        unique.push(img);
      } else {
        const existing = seen.get(key);
        if (this.shouldReplaceExternalImage(existing, img)) {
          const index = unique.findIndex((u) => u === existing);
          if (index !== -1) {
            unique[index] = img;
            seen.set(key, img);
          }
        }
      }
    });

    return unique;
  }

  // Helper methods
  getFromCache(key, maxAge) {
    return Utils.getFromCache(key, maxAge);
  }

  setCache(key, data) {
    return Utils.setCache(key, data);
  }

  getCurrentDocumentPath() {
    return Utils.getCurrentDocumentPath();
  }

  isUsedInCurrentDocument(img, currentDocPath) {
    if (!img.usedInPages || !currentDocPath) return false;

    return img.usedInPages.some((page) => {
      const normalizedPagePath = Utils.normalizeDocumentPath(page.path);
      const normalizedCurrentPath = Utils.normalizeDocumentPath(currentDocPath);
      return normalizedPagePath === normalizedCurrentPath;
    });
  }

  calculateAnalyzedImageScore(img) {
    let score = 15;

    if (img.aiAnalysis?.confidence) {
      score += Math.round(img.aiAnalysis.confidence * 30);
    }

    // Note: Document-specific scoring now handled in main application

    const usageCount = img.usageCount || 0;
    if (usageCount > 0) {
      score += Math.min(15, usageCount * 3);
    }

    return Math.max(0, Math.min(100, score));
  }

  calculateExternalAssetScore(asset) {
    let score = 30;

    if (asset.migrationPriority === 'high') {
      score += 25;
    } else if (asset.migrationPriority === 'medium') {
      score += 15;
    } else {
      score += 5;
    }

    const usageCount = asset.usageCount || 0;
    score += Math.min(20, usageCount * 2);

    return Math.max(0, Math.min(100, score));
  }

  extractCleanAssetName(rawName) {
    if (!rawName) return 'Unnamed Asset';

    let cleanName = rawName
      .replace(/^(SLING|Sling)[-_\s]*/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleanName = cleanName.replace(/\b\w/g, (l) => l.toUpperCase());
    return cleanName || 'Unnamed Asset';
  }

  shouldReplaceExternalImage(existing, candidate) {
    const priorityMap = { high: 3, medium: 2, low: 1 };

    const existingPriority = priorityMap[existing.migrationPriority] || 1;
    const candidatePriority = priorityMap[candidate.migrationPriority] || 1;

    if (candidatePriority > existingPriority) return true;
    if (candidatePriority < existingPriority) return false;

    return (candidate.usageCount || 0) > (existing.usageCount || 0);
  }

  generateMockAssets() {
    return [
      {
        id: 'mock-1',
        name: 'Sample Image',
        type: 'image',
        category: 'internal',
        path: '/mock/sample.jpg',
        url: 'https://via.placeholder.com/300x200',
        aiScore: 85,
        isAIEnhanced: true,
        isExternal: false,
        tags: ['sample', 'placeholder'],
        size: 60000,
        created: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        description: 'Sample placeholder image',
      },
    ];
  }

  mapContextToCategory(context) {
    const contextMap = {
      header: 'navigation',
      footer: 'navigation',
      hero: 'hero',
      banner: 'hero',
      content: 'internal',
      sidebar: 'internal',
      article: 'internal',
      gallery: 'gallery',
      carousel: 'gallery',
      thumbnail: 'thumbnail',
    };

    return contextMap[context?.toLowerCase()] || 'internal';
  }

  generateTagsFromAnalysis(img) {
    const tags = [];

    if (img.aiAnalysis?.keywords) {
      tags.push(...img.aiAnalysis.keywords.slice(0, 5));
    }

    if (img.aiAnalysis?.categories) {
      tags.push(...img.aiAnalysis.categories.slice(0, 3));
    }

    if (img.dimensions?.width && img.dimensions?.height) {
      const aspectRatio = img.dimensions.width / img.dimensions.height;
      if (aspectRatio > 1.5) tags.push('landscape');
      else if (aspectRatio < 0.75) tags.push('portrait');
      else tags.push('square');

      if (img.dimensions.width >= 1920) tags.push('high-resolution');
      if (img.dimensions.width <= 300) tags.push('thumbnail');
    }

    if (img.usedInPages) {
      const contexts = img.usedInPages.map((page) => page.context).filter(Boolean);
      tags.push(...new Set(contexts));
    }

    const fileExtension = Utils.extractExtensionFromSrc(img.src);
    if (fileExtension) tags.push(fileExtension);

    return [...new Set(tags.filter(Boolean))].slice(0, 8);
  }

  generateExternalAssetTags(asset) {
    const tags = ['external'];

    if (asset.sourceDomain) {
      tags.push(asset.sourceDomain.replace(/^www\./, ''));
    }

    if (asset.migrationPriority) {
      tags.push(`priority-${asset.migrationPriority}`);
    }

    if (asset.assetCategory && asset.assetCategory !== 'unknown') {
      tags.push(asset.assetCategory);
    }

    const cleanName = this.extractCleanAssetName(asset.displayName || asset.name || '');
    const nameWords = cleanName.toLowerCase().split(/[\s\-_]+/).filter((word) => word.length > 2);
    tags.push(...nameWords.slice(0, 3));

    return [...new Set(tags)].slice(0, 6);
  }
}
