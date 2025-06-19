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
    if (!path) return '';
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  }

  static extractFilenameFromUrl(url) {
    if (!url) return 'Unknown';

    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const filename = path.substring(path.lastIndexOf('/') + 1);
      return filename || 'Unknown';
    } catch {
      const parts = url.split('/');
      return parts[parts.length - 1] || 'Unknown';
    }
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / (k ** i)).toFixed(1)} ${sizes[i]}`;
  }

  static formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  }

  static extractExtensionFromSrc(src) {
    if (!src) return '';
    const match = src.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : '';
  }

  static detectTypeFromExtension(extension) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'wmv'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];

    if (imageExts.includes(extension)) return 'image';
    if (videoExts.includes(extension)) return 'video';
    if (docExts.includes(extension)) return 'document';
    return 'unknown';
  }

  static resolveAssetUrl(src) {
    if (!src) return null;

    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }

    if (src.startsWith('//')) {
      return `https:${src}`;
    }

    if (src.startsWith('/')) {
      return `${window.location.origin}${src}`;
    }

    const currentPath = window.location.pathname;
    const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    return `${window.location.origin}${basePath}${src}`;
  }

  static getCurrentDocumentPath() {
    try {
      const path = window.location.pathname;
      return path.endsWith('/') ? path.slice(0, -1) : path;
    } catch {
      return '';
    }
  }

  static detectDocumentType(path = null) {
    const currentPath = path || Utils.getCurrentDocumentPath();

    if (currentPath.includes('/docs/')) return 'documentation';
    if (currentPath.includes('/blog/')) return 'blog';
    if (currentPath.includes('/news/')) return 'news';
    if (currentPath.includes('/products/')) return 'product';
    if (currentPath.includes('/about/')) return 'about';
    if (currentPath === '' || currentPath === '/') return 'homepage';

    return 'page';
  }

  static getFromCache(key, maxAge) {
    try {
      const item = localStorage.getItem(`da_media_${key}`);
      if (!item) return null;

      const { data, timestamp } = JSON.parse(item);
      if (Date.now() - timestamp > maxAge) {
        localStorage.removeItem(`da_media_${key}`);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  static setCache(key, data) {
    try {
      const item = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(`da_media_${key}`, JSON.stringify(item));
    } catch {
      // Ignore cache errors
    }
  }

  static getImageDimensionsForDevice(asset, device) {
    if (asset.responsivePattern?.sources) {
      const { sources } = asset.responsivePattern;
      for (let i = 0; i < sources.length; i += 1) {
        const sourceData = sources[i];
        const isDesktopSource = sourceData.media
          && sourceData.media.includes('min-width: 600px');
        const isMobileSource = !sourceData.media || sourceData.media === null;

        if ((device === 'desktop' && isDesktopSource)
            || ((device === 'tablet' || device === 'mobile') && isMobileSource)) {
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

      sources.forEach((source) => {
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
      });
    }

    if (!asset.dimensions?.width || !asset.dimensions?.height) {
      return 'Unknown dimensions';
    }

    const deviceScaleFactors = {
      desktop: 1.0,
      tablet: 0.64,
      mobile: 0.4,
    };

    const scaleFactor = deviceScaleFactors[device] || 1.0;
    const scaledWidth = Math.round(asset.dimensions.width * scaleFactor);
    const scaledHeight = Math.round(asset.dimensions.height * scaleFactor);

    return `${scaledWidth} × ${scaledHeight}px`;
  }

  static getFileSizeForDevice(asset, device) {
    if (asset.responsivePattern?.sources) {
      const { sources } = asset.responsivePattern;
      for (let i = 0; i < sources.length; i += 1) {
        const sourceData = sources[i];
        const isDesktopSource = sourceData.media
          && sourceData.media.includes('min-width: 600px');
        const isMobileSource = !sourceData.media || sourceData.media === null;

        if ((device === 'desktop' && isDesktopSource)
            || ((device === 'tablet' || device === 'mobile') && isMobileSource)) {
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

      sources.forEach((source) => {
        const media = source.getAttribute('media');

        if (Utils.sourceMatchesDevice(media, device, { desktop: 1200, tablet: 768, mobile: 480 })) {
          const fileSize = Utils.getFileSizeFromResponsivePattern(asset, media);
          if (fileSize) {
            return fileSize;
          }
        }
      });
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
      const minWidth = parseInt(minWidthMatch[1], 10);
      if (device === 'desktop' && currentViewport >= minWidth) return true;
      if (device === 'tablet' && currentViewport >= minWidth && minWidth <= 600) return true;
      if (device === 'mobile' && minWidth <= 480) return true;
    }

    if (maxWidthMatch) {
      const maxWidth = parseInt(maxWidthMatch[1], 10);
      if (device === 'mobile' && currentViewport <= maxWidth) return true;
      if (device === 'tablet' && currentViewport <= maxWidth && maxWidth >= 480) return true;
    }

    if (device === 'desktop' && (!minWidthMatch || parseInt(minWidthMatch[1], 10) <= 600)) return true;
    if (device === 'mobile' && (maxWidthMatch && parseInt(maxWidthMatch[1], 10) < 600)) return true;
    if (device === 'tablet') return true;

    return false;
  }

  static extractWidthFromSrcset(srcset) {
    if (!srcset) return null;

    const urlMatch = srcset.match(/width=(\d+)/);
    if (urlMatch) {
      return parseInt(urlMatch[1], 10);
    }

    const widthMatch = srcset.match(/(\d+)w/);
    if (widthMatch) {
      return parseInt(widthMatch[1], 10);
    }

    return null;
  }

  static getFileSizeFromResponsivePattern(asset, media) {
    if (!asset.responsivePattern?.sources) return null;

    const { sources } = asset.responsivePattern;
    for (let i = 0; i < sources.length; i += 1) {
      const sourceData = sources[i];
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
        mobile: 45 * 1024,
      };
      return Utils.formatFileSize(fallbackSizes[device] || fallbackSizes.desktop);
    }

    const deviceScaleFactors = {
      desktop: 1.0,
      tablet: 0.64,
      mobile: 0.4,
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
      const { org, repo } = window.daSDK.context;
      return { org, repo };
    }

    const { hostname } = window.location;
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
    throw new Error(error);
  }
}
