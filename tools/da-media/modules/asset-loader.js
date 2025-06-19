/**
 * Asset Loader Module
 * Handles loading assets from various sources with caching and error handling
 */
import { Utils } from './utils.js';

export class AssetLoader {
  constructor(apiEndpoint = 'http://localhost:8787') {
    this.apiEndpoint = apiEndpoint;
    this.cache = new Map();
  }

  /**
   * Load all assets using the working da-media.js approach
   */
  async loadAllAssets() {
    try {
      // Load analyzed images (which contains both internal and external)
      const allAnalyzedImages = await this.loadAnalyzedImages();
      
      // Also load DA source assets to get complete internal asset library
      const daSourceAssets = await this.loadDASourceAssets();
      
      // Separate internal and external images from analyzed data
      const analyzedInternalImages = allAnalyzedImages.filter(img => !img.isExternal);
      const externalImages = allAnalyzedImages.filter(img => img.isExternal);
      
      // Merge analyzed internal images with DA source assets (avoid duplicates)
      const mergedInternalImages = this.mergeAnalyzedWithSource(analyzedInternalImages, daSourceAssets);
      
      // Remove duplicates from external images (same image from different domains)
      const uniqueExternalImages = this.removeDuplicateExternalImages(externalImages);
      
      // Combine all internal and unique external assets
      const allAssets = [...mergedInternalImages, ...uniqueExternalImages];
      
      return allAssets;
    } catch (error) {
      console.warn('Failed to load assets, using fallback:', error);
      return this.generateMockAssets();
    }
  }

  /**
   * Load analyzed images from Cloudflare Worker
   */
  async loadAnalyzedImages() {
    const cacheKey = 'da-media-analyzed-images';
    const cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Check cache first
    const cached = this.getFromCache(cacheKey, cacheExpiry);
    if (cached) {
      return this.transformAnalyzedImages(cached.images || []);
    }
    
    try {
      // Try new org-aware endpoint first
      let response = await fetch(`${this.apiEndpoint}/api/images?includeExternal=true&limit=100`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        // Fallback to legacy endpoint
        response = await fetch(`${this.apiEndpoint}/api/analyzed-images-fast`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (!response.ok) {
        throw new Error(`Failed to load analyzed images: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the response
      this.setCache(cacheKey, data);
      
      // Handle both new and legacy response formats
      const images = data.images || data.data?.images || [];
      
      return this.transformAnalyzedImages(images);
    } catch (error) {
      console.warn('Failed to load analyzed images:', error);
      return [];
    }
  }

  /**
   * Load DA source assets (placeholder for now)
   */
  async loadDASourceAssets() {
    // Mock implementation - in full version this would load from DA
    return [];
  }

  /**
   * Transform analyzed images to standardized asset format (exact copy from working version)
   */
  transformAnalyzedImages(analyzedImages) {
    const currentDocPath = this.getCurrentDocumentPath();
    
    return analyzedImages.map(img => {
      // Check if used in current document
      const usedInCurrentDocument = currentDocPath && this.isUsedInCurrentDocument(img, currentDocPath);
      
      // Determine if this is an external or internal image
      const isExternal = img.isExternal || false;
      
      // Calculate AI score based on analysis quality and usage
      const aiScore = isExternal ? this.calculateExternalAssetScore(img) : this.calculateAnalyzedImageScore(img);
      
      // Extract file extension from src
      const extension = Utils.extractExtensionFromSrc(img.src);
      const assetType = Utils.detectTypeFromExtension(extension);
      
      // Determine category based on internal vs external
      const category = isExternal ? 'external' : this.mapContextToCategory(img.usedInPages?.[0]?.context || 'content');
      
      // Fix URL handling for external vs internal assets
      let assetUrl;
      if (isExternal) {
        // For external assets, the backend stores the Scene7 URL in the src field
        assetUrl = img.src;
        
        // Only warn if we have a placeholder that wasn't resolved
        if (!assetUrl || assetUrl.startsWith('[EXTERNAL]')) {
          console.warn(`❌ Backend did not provide Scene7 URL for external asset: ${img.displayName}`);
          assetUrl = null; // Let the UI show an icon instead
        }
        
        console.log(`🔍 External asset "${img.displayName}":`, {
          src: img.src,
          originalUrl: img.originalUrl,
          actualUrl: img.actualUrl,
          externalUrl: img.externalUrl,
          url: img.url,
          finalUrl: assetUrl,
          fullImageData: img
        });
              } else {
          // For internal assets, use the standard URL resolution
          assetUrl = Utils.resolveAssetUrl(img.src);
        }
      
      const transformedAsset = {
        id: img.id,
        name: img.displayName,
        type: assetType,
        category: category,
        path: img.src,
        url: assetUrl,
        originalUrl: assetUrl, // Store the same URL for consistency
        aiScore,
        isAIEnhanced: !isExternal, // Internal images are AI enhanced, external are not
        isExternal: isExternal,
        tags: isExternal ? this.generateExternalAssetTags(img) : this.generateTagsFromAnalysis(img),
        size: img.dimensions?.width * img.dimensions?.height || 0,
        created: img.firstSeen,
        lastUsed: img.lastSeen,
        source: isExternal ? 'external-scan' : 'preview-analysis',
        usageCount: img.usageCount || 0,
        
        // Rich metadata from our analysis
        displayName: img.displayName,
        originalAltText: img.originalAltText,
        aiGeneratedAltText: img.aiGeneratedAltText,
        dimensions: img.dimensions,
        usedInPages: img.usedInPages || [],
        aiAnalysis: img.aiAnalysis,
        
        // External asset specific properties
        sourceDomain: img.sourceDomain || null,
        migrationPriority: img.migrationPriority || (isExternal ? 'medium' : 'low'),
        needsMigration: isExternal,
        assetCategory: img.assetCategory || 'unknown',
        
        // Current document context
        usedInCurrentDocument,
        
        // UI enhancements
        description: img.aiAnalysis?.description || img.originalAltText || img.displayName,
        confidence: img.aiAnalysis?.confidence || 0.5,
        
        // Usage analytics for sorting
        lastUsedFormatted: img.lastSeen ? new Date(img.lastSeen).toLocaleDateString() : 'Never',
        
        // Responsive data
        responsivePattern: img.responsivePattern || null,
        originalPictureHTML: null, // Will be found lazily when needed
        hasResponsive: !!(img.responsivePattern?.hasResponsive)
      };

      // Debug logging for external assets
      if (isExternal) {
        console.log(`🔧 Transformed external asset "${img.displayName}":`, {
          originalSrc: img.src,
          calculatedAssetUrl: assetUrl,
          finalAssetUrl: transformedAsset.url,
          fullTransformedAsset: transformedAsset
        });
      }

      return transformedAsset;
    });
  }

  /**
   * Merge analyzed images with DA source assets
   */
  mergeAnalyzedWithSource(analyzedImages, sourceAssets) {
    // For now, just return analyzed images
    return analyzedImages;
  }

  /**
   * Remove duplicate external images
   */
  removeDuplicateExternalImages(externalImages) {
    const seen = new Map();
    const unique = [];
    
    for (const img of externalImages) {
      const cleanName = this.extractCleanAssetName(img.displayName || img.name || '');
      const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (!seen.has(key)) {
        seen.set(key, img);
        unique.push(img);
      } else {
        const existing = seen.get(key);
        if (this.shouldReplaceExternalImage(existing, img)) {
          const index = unique.findIndex(u => u === existing);
          if (index !== -1) {
            unique[index] = img;
            seen.set(key, img);
          }
        }
      }
    }
    
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
    
    return img.usedInPages.some(page => {
      const normalizedPagePath = Utils.normalizeDocumentPath(page.path);
      const normalizedCurrentPath = Utils.normalizeDocumentPath(currentDocPath);
      return normalizedPagePath === normalizedCurrentPath;
    });
  }

  calculateAnalyzedImageScore(img) {
    let score = 15; // Base score
    
    if (img.aiAnalysis?.confidence) {
      score += Math.round(img.aiAnalysis.confidence * 30);
    }
    
    if (img.usedInCurrentDocument) {
      score += 40;
    }
    
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
    
    cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
    return cleanName || 'Unnamed Asset';
  }

  shouldReplaceExternalImage(existing, candidate) {
    const priorityMap = { 'high': 3, 'medium': 2, 'low': 1 };
    
    const existingPriority = priorityMap[existing.migrationPriority] || 0;
    const candidatePriority = priorityMap[candidate.migrationPriority] || 0;
    
    if (existingPriority === candidatePriority) {
      return (candidate.usageCount || 0) > (existing.usageCount || 0);
    }
    
    return candidatePriority > existingPriority;
  }



  generateMockAssets() {
    return [
      {
        id: 'mock-1',
        name: 'Sample Hero Image',
        type: 'image',
        category: 'hero',
        url: 'https://via.placeholder.com/1200x600/1473e6/ffffff?text=Hero+Image',
        isExternal: false,
        aiScore: 85,
        usageCount: 3,
        altText: 'Sample hero image',
        dimensions: '1200 × 600px',
        fileSize: '245 KB'
      }
    ];
  }

  /**
   * Map context to category (from working version)
   */
  mapContextToCategory(context) {
    const contextMap = {
      'hero': 'hero',
      'feature': 'feature', 
      'gallery': 'gallery',
      'content': 'image',
      'team': 'team',
      'product': 'product'
    };
    
    return contextMap[context] || 'image';
  }

  /**
   * Generate tags from analysis (from working version)
   */
  generateTagsFromAnalysis(img) {
    const tags = [];
    
    // Add tags from AI analysis
    if (img.aiAnalysis?.tags) {
      tags.push(...img.aiAnalysis.tags);
    }
    
    // Add tags from display name
    const name = img.displayName?.toLowerCase() || '';
    if (name.includes('hero')) tags.push('hero');
    if (name.includes('team')) tags.push('team', 'people');
    if (name.includes('product')) tags.push('product', 'feature');
    if (name.includes('logo')) tags.push('logo', 'brand');
    if (name.includes('background')) tags.push('background', 'texture');
    
    // Add tags from usage context
    if (img.usedInPages) {
      img.usedInPages.forEach(page => {
        if (page.context) tags.push(page.context);
      });
    }
    
    // Add quality indicators
    if (img.aiAnalysis?.confidence > 0.8) tags.push('high-quality');
    if (img.usageCount > 2) tags.push('popular');
    if (img.originalAltText) tags.push('accessible');
    
    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Generate external asset tags (from working version)
   */
  generateExternalAssetTags(asset) {
    const tags = [];
    
    // Add source domain tag
    if (asset.sourceDomain) {
      tags.push(asset.sourceDomain);
    }
    
    // Add migration priority tag
    if (asset.migrationPriority) {
      tags.push(`${asset.migrationPriority}-priority`);
    }
    
    // Add performance tag
    if (asset.performanceImpact >= 80) {
      tags.push('performance-critical');
    } else if (asset.performanceImpact >= 60) {
      tags.push('performance-impact');
    }
    
    // Add type-based tags
    if (asset.type === 'image') {
      tags.push('external-image');
    }
    
    // Add generic external tag
    tags.push('external', 'migration-candidate');
    
    return tags;
  }
} 