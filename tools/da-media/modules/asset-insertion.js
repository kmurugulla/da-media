export class AssetInsertion {
  constructor() {
    this.actions = null;
  }

  init(actions) {
    this.actions = actions;
  }

  async selectAsset(asset) {
    return this.insertAsset(asset);
  }

  async insertAsset(asset) {
    try {
      if (!this.actions) {
        // Fallback for when DA SDK is not available (development/testing)
        // eslint-disable-next-line no-console
        console.warn('DA SDK not available - Asset would be inserted:', asset.name);
        return;
      }

      // Handle different insertion types
      if (asset.insertType === 'link') {
        // Insert as hyperlink (for external assets)
        this.actions.sendHTML(asset.html);
      } else if (asset.type === 'image') {
        await this.insertImageHTML(asset);
      } else {
        const assetUrl = asset.url || asset.src;
        this.actions.sendText(`[${asset.name}](${assetUrl})`);
      }

      this.trackAssetUsage(asset);
      this.actions.closeLibrary();
    } catch (error) {
      throw error;
    }
  }

  async insertImageHTML(asset) {
    try {
      const imageUrl = this.getBestImageUrlForInsertion(asset);
      const altText = asset.originalAltText || asset.name || 'Image';

      if (asset.responsivePattern?.hasResponsive || asset.originalPictureHTML) {
        const pictureHTML = this.createResponsivePictureHTML(asset, imageUrl, altText);
        this.actions.sendHTML(pictureHTML);
        return;
      }

      if (this.canCreateOptimizedPicture(imageUrl)) {
        const optimizedPictureHTML = this.createOptimizedPictureHTML(imageUrl, altText);
        this.actions.sendHTML(optimizedPictureHTML);
        return;
      }

      const imgHTML = `<img src="${imageUrl}" alt="${altText}" loading="lazy">`;
      this.actions.sendHTML(imgHTML);
    } catch (error) {
      try {
        const imageUrl = this.getBestImageUrlForInsertion(asset);
        const altText = asset.originalAltText || asset.name || 'Image';
        this.actions.sendText(`![${altText}](${imageUrl})`);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  createResponsivePictureHTML(asset, imageUrl, altText) {
    if (asset.originalPictureHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = asset.originalPictureHTML;
      const picture = tempDiv.querySelector('picture');

      if (picture) {
        const img = picture.querySelector('img');
        if (img) {
          img.setAttribute('alt', altText);
          img.setAttribute('loading', 'lazy');
        }
        return picture.outerHTML;
      }
    }

    if (asset.responsivePattern?.hasResponsive) {
      let pictureHTML = '<picture>';

      if (asset.responsivePattern.sources) {
        asset.responsivePattern.sources.forEach((source) => {
          if (source.media && source.srcset) {
            pictureHTML += `<source media="${source.media}" srcset="${source.srcset}">`;
          }
        });
      }

      if (asset.responsivePattern.srcset) {
        pictureHTML += `<source srcset="${asset.responsivePattern.srcset}">`;
      }

      pictureHTML += `<img src="${imageUrl}" alt="${altText}" loading="lazy">`;
      pictureHTML += '</picture>';

      return pictureHTML;
    }

    return this.createOptimizedPictureHTML(imageUrl, altText);
  }

  createOptimizedPictureHTML(imageUrl, altText) {
    const baseUrl = imageUrl.split('?')[0];
    const webpUrl = `${baseUrl}?format=webply&optimize=medium`;
    const jpegUrl = `${baseUrl}?format=jpeg&optimize=medium`;

    return `<picture>
  <source type="image/webp" srcset="${webpUrl}">
  <source type="image/jpeg" srcset="${jpegUrl}">
  <img loading="lazy" src="${imageUrl}" alt="${altText}">
</picture>`;
  }

  canCreateOptimizedPicture(imageUrl) {
    return imageUrl.includes('aem.page') || imageUrl.includes('aem.live');
  }

  getBestImageUrlForInsertion(asset) {
    const device = 'desktop';

    if (asset.responsivePattern?.hasResponsive) {
      const desktopUrl = this.getImageUrlForDevice(asset, device);
      if (desktopUrl) {
        return desktopUrl;
      }
    }

    return asset.src || asset.url || asset.path;
  }

  getImageUrlForDevice(asset, device) {
    const deviceViewports = {
      desktop: 2000,
      tablet: 750,
      mobile: 480,
    };

    const targetWidth = deviceViewports[device] || deviceViewports.desktop;

    if (asset.responsivePattern?.hasResponsive) {
      const pattern = asset.responsivePattern;

      if (pattern.sources && pattern.sources.length > 0) {
        const matchingSource = pattern.sources.find((source) =>
          this.sourceMatchesDevice(source.media, device, deviceViewports));

        if (matchingSource && matchingSource.srcset) {
          return this.extractBestUrlFromSrcset(matchingSource.srcset, targetWidth);
        }
      }

      if (pattern.srcset) {
        return this.extractBestUrlFromSrcset(pattern.srcset, targetWidth);
      }
    }

    return asset.src || asset.url || asset.path;
  }

  sourceMatchesDevice(mediaQuery, device, deviceViewports) {
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

  extractBestUrlFromSrcset(srcset, targetWidth) {
    if (!srcset) return null;

    const sources = srcset.split(',').map((s) => s.trim());
    let bestMatch = null;
    let bestWidth = 0;

    for (const source of sources) {
      const urlMatch = source.match(/width=(\d+)/);
      const widthMatch = source.match(/(\d+)w/);

      let width = 0;
      if (urlMatch) {
        width = parseInt(urlMatch[1], 10);
      } else if (widthMatch) {
        width = parseInt(widthMatch[1], 10);
      }

      if (width >= targetWidth && (bestWidth === 0 || width < bestWidth)) {
        bestMatch = source.split(' ')[0];
        bestWidth = width;
      } else if (width > bestWidth && bestWidth < targetWidth) {
        bestMatch = source.split(' ')[0];
        bestWidth = width;
      }
    }

    return bestMatch || sources[0]?.split(' ')[0];
  }

  async trackAssetUsage(asset) {
    try {
      if (!asset) return;

      const usageData = {
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.type,
        isExternal: asset.isExternal,
        timestamp: new Date().toISOString(),
        context: 'insertion',
      };

      const cacheKey = `usage_${asset.id}`;
      const existingUsage = this.getFromCache(cacheKey, 24 * 60 * 60 * 1000);

      if (!existingUsage) {
        this.setCache(cacheKey, usageData);
      }
    } catch (error) {
      // Silent fail for tracking
    }
  }

  getFromCache(key, maxAge) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const data = JSON.parse(item);
      const now = Date.now();

      if (now - data.timestamp > maxAge) {
        localStorage.removeItem(key);
        return null;
      }

      return data.value;
    } catch (error) {
      return null;
    }
  }

  setCache(key, data) {
    try {
      const item = {
        value: data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      // Silent fail for caching
    }
  }
}
