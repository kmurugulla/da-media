export class Utils {
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static normalizeDocumentPath(path) {
    if (!path) return null;
    return path.startsWith('/') ? path : '/' + path;
  }

  static extractFilenameFromUrl(url) {
    if (!url) return 'Unknown';
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'Unknown';
      return filename.split('?')[0];
    } catch (error) {
      return 'Unknown';
    }
  }

  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatDate(dateString) {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return 'Invalid Date';
    }
  }

  static extractExtensionFromSrc(src) {
    const match = src.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  static detectTypeFromExtension(extension) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const vectorExts = ['svg'];
    
    if (imageExts.includes(extension)) return 'image';
    if (vectorExts.includes(extension)) return 'icon';
    
    return 'image';
  }

  static resolveAssetUrl(src) {
    if (!src) return null;
    
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    
    if (src.startsWith('./')) {
      const org = 'kmurugulla';
      const site = 'da-media';
      return `https://main--${site}--${org}.aem.page${src.substring(1)}`;
    }
    
    if (src.startsWith('/')) {
      const org = 'kmurugulla';
      const site = 'da-media';
      return `https://main--${site}--${org}.aem.page${src}`;
    }
    
    return Utils.resolveAssetUrl('./' + src);
  }

  static getCurrentDocumentPath() {
    if (window.daSDK?.context?.path) {
      return Utils.normalizeDocumentPath(window.daSDK.context.path);
    }
    
    const currentPath = window.location.pathname;
    if (currentPath && !currentPath.includes('/tools/da-media/')) {
      return Utils.normalizeDocumentPath(currentPath);
    }
    
    return null;
  }

  static detectDocumentType(path = null) {
    const docPath = path || Utils.getCurrentDocumentPath() || '';
    const pathLower = docPath.toLowerCase();
    
    if (pathLower.includes('demo')) return 'Demo Page';
    if (pathLower.includes('blog')) return 'Blog Post';
    if (pathLower.includes('product')) return 'Product Page';
    if (pathLower.includes('about')) return 'About Page';
    if (pathLower.includes('contact')) return 'Contact Page';
    if (pathLower.includes('home') || pathLower === '/' || pathLower === '') return 'Home Page';
    
    return 'Content Page';
  }

  static getFromCache(key, maxAge) {
    try {
      const cached = localStorage.getItem(`da-media-cache-${key}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < maxAge) {
          return data.data;
        }
      }
    } catch (error) {
      // Silent fail
    }
    return null;
  }

  static setCache(key, data) {
    try {
      const cacheData = { data, timestamp: Date.now() };
      localStorage.setItem(`da-media-cache-${key}`, JSON.stringify(cacheData));
    } catch (error) {
      // Silent fail
    }
  }

  static getImageDimensionsForDevice(asset, device) {
    if (asset.responsivePattern?.sources) {
      for (const sourceData of asset.responsivePattern.sources) {
        const isDesktopSource = sourceData.media && sourceData.media.includes('min-width: 600px');
        const isMobileSource = !sourceData.media || sourceData.media === null;
        
        if ((device === 'desktop' && isDesktopSource) || 
            ((device === 'tablet' || device === 'mobile') && isMobileSource)) {
          
          if (sourceData.pattern?.width && asset.dimensions?.height && asset.dimensions?.width) {
            const ratio = asset.dimensions.height / asset.dimensions.width;
            const newHeight = Math.round(sourceData.pattern.width * ratio);
            return `${sourceData.pattern.width} × ${newHeight}px`;
          }
        }
      }
    }
    
    if (asset.originalPictureHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = asset.originalPictureHTML;
      const sources = Array.from(tempDiv.querySelectorAll('source'));
      
      for (const source of sources) {
        const srcset = source.getAttribute('srcset');
        const media = source.getAttribute('media');
        
        if (Utils.sourceMatchesDevice(media, device, { desktop: 1200, tablet: 768, mobile: 480 })) {
          const extractedWidth = Utils.extractWidthFromSrcset(srcset);
          if (extractedWidth && asset.dimensions?.width && asset.dimensions?.height) {
            const ratio = asset.dimensions.height / asset.dimensions.width;
            const newHeight = Math.round(extractedWidth * ratio);
            return `${extractedWidth} × ${newHeight}px`;
          }
        }
      }
    }
    
    if (!asset.dimensions?.width || !asset.dimensions?.height) {
      return 'Unknown dimensions';
    }

    const deviceScaleFactors = {
      desktop: 1.0,
      tablet: 0.64,
      mobile: 0.4
    };
    
    const scaleFactor = deviceScaleFactors[device] || 1.0;
    const scaledWidth = Math.round(asset.dimensions.width * scaleFactor);
    const scaledHeight = Math.round(asset.dimensions.height * scaleFactor);
    
    return `${scaledWidth} × ${scaledHeight}px`;
  }

  static getFileSizeForDevice(asset, device) {
    if (asset.responsivePattern?.sources) {
      for (const sourceData of asset.responsivePattern.sources) {
        const isDesktopSource = sourceData.media && sourceData.media.includes('min-width: 600px');
        const isMobileSource = !sourceData.media || sourceData.media === null;
        
        if ((device === 'desktop' && isDesktopSource) || 
            ((device === 'tablet' || device === 'mobile') && isMobileSource)) {
          
          if (sourceData.pattern?.fileSizeFormatted) {
            return sourceData.pattern.fileSizeFormatted;
          }
          if (sourceData.pattern?.fileSize) {
            return Utils.formatFileSize(sourceData.pattern.fileSize);
          }
        }
      }
    }
    
    if (asset.originalPictureHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = asset.originalPictureHTML;
      const sources = Array.from(tempDiv.querySelectorAll('source'));
      
      for (const source of sources) {
        const media = source.getAttribute('media');
        
        if (Utils.sourceMatchesDevice(media, device, { desktop: 1200, tablet: 768, mobile: 480 })) {
          const fileSize = Utils.getFileSizeFromResponsivePattern(asset, media, device);
          if (fileSize) {
            return fileSize;
          }
        }
      }
    }
    
    return Utils.estimateFileSize(asset, device);
  }

  static sourceMatchesDevice(mediaQuery, device, deviceViewports) {
    if (!mediaQuery) {
      return device === 'desktop';
    }
    
    const minWidthMatch = mediaQuery.match(/min-width:\s*(\d+)px/);
    const maxWidthMatch = mediaQuery.match(/max-width:\s*(\d+)px/);
    
    const currentViewport = deviceViewports[device];
    
    if (minWidthMatch) {
      const minWidth = parseInt(minWidthMatch[1]);
      if (device === 'desktop' && currentViewport >= minWidth) return true;
      if (device === 'tablet' && currentViewport >= minWidth && minWidth <= 600) return true;
      if (device === 'mobile' && minWidth <= 480) return true;
    }
    
    if (maxWidthMatch) {
      const maxWidth = parseInt(maxWidthMatch[1]);
      if (device === 'mobile' && currentViewport <= maxWidth) return true;
      if (device === 'tablet' && currentViewport <= maxWidth && maxWidth >= 480) return true;
    }
    
    if (device === 'desktop' && (!minWidthMatch || parseInt(minWidthMatch[1]) <= 600)) return true;
    if (device === 'mobile' && (maxWidthMatch && parseInt(maxWidthMatch[1]) < 600)) return true;
    if (device === 'tablet') return true;
    
    return false;
  }

  static extractWidthFromSrcset(srcset) {
    if (!srcset) return null;
    
    const urlMatch = srcset.match(/width=(\d+)/);
    if (urlMatch) {
      return parseInt(urlMatch[1]);
    }
    
    const widthMatch = srcset.match(/(\d+)w/);
    if (widthMatch) {
      return parseInt(widthMatch[1]);
    }
    
    return null;
  }

  static getFileSizeFromResponsivePattern(asset, media, device) {
    if (!asset.responsivePattern?.sources) return null;
    
    for (const sourceData of asset.responsivePattern.sources) {
      if (sourceData.media === media && sourceData.pattern?.fileSizeFormatted) {
        return sourceData.pattern.fileSizeFormatted;
      }
    }
    
    return null;
  }

  static estimateFileSize(asset, device) {
    if (!asset.dimensions?.width || !asset.dimensions?.height) {
      const fallbackSizes = {
        desktop: 250 * 1024,
        tablet: 120 * 1024,
        mobile: 45 * 1024
      };
      return Utils.formatFileSize(fallbackSizes[device] || fallbackSizes.desktop);
    }

    const deviceScaleFactors = {
      desktop: 1.0,
      tablet: 0.64,
      mobile: 0.4
    };
    
    const scaleFactor = deviceScaleFactors[device] || 1.0;
    
    const scaledWidth = Math.round(asset.dimensions.width * scaleFactor);
    const scaledHeight = Math.round(asset.dimensions.height * scaleFactor);
    const scaledPixels = scaledWidth * scaledHeight;
    
    const bytesPerPixel = 0.4;
    const estimatedBytes = scaledPixels * bytesPerPixel;
    
    return Utils.formatFileSize(estimatedBytes);
  }

  static extractOrgRepo() {
    if (window.daSDK?.context?.org && window.daSDK?.context?.repo) {
      return {
        org: window.daSDK.context.org,
        repo: window.daSDK.context.repo
      };
    }
    
    const hostname = window.location.hostname;
    if (hostname.includes('aem.page') || hostname.includes('aem.live')) {
      const parts = hostname.split('--');
      if (parts.length >= 3) {
        const org = parts[2].split('.')[0];
        const repo = parts[1];
        if (org && repo) {
          return { org, repo };
        }
      }
    }
    
    const error = 'Unable to determine organization and repository. Please ensure you are running in a proper AEM environment.';
    console.error(error);
    throw new Error(error);
  }
} 