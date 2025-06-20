/**
 * Asset Renderer Module
 * Handles DOM creation and image preview logic with error handling
 */
import { PreviewModalManager } from './preview-modal.js';
import { showUsageInfo } from './usage-modal.js';

export class AssetRenderer {
  constructor() {
    this.iconMap = {
      image: '🖼️',
      video: '🎬',
      document: '📄',
      icon: '⭐',
      audio: '🎵',
      pdf: '📋',
    };
    this.previewModal = new PreviewModalManager();
    this.assetInsertion = null;
  }

  init(assetInsertion) {
    this.assetInsertion = assetInsertion;
  }

  /**
   * Create asset element using working da-media.js approach
   */
  createAssetElement(asset, isListView = false) {
    const div = document.createElement('div');
    div.className = `asset-item ${asset.isExternal ? 'external-asset' : 'internal-asset'}`;
    div.setAttribute('data-asset-id', asset.id);

    // Add hover tooltip
    if (asset.altText || asset.description) {
      div.title = asset.altText || asset.description;
    }

    if (isListView) {
      // In list view, don't add main row click handler
      this.createListViewStructure(div, asset);
    } else {
      // Add main card click handler for asset insertion only in grid view
      div.onclick = async () => {
        if (this.assetInsertion) {
          try {
            await this.assetInsertion.selectAsset(asset);
          } catch (error) {
            alert(`Failed to insert asset: ${error.message}`);
          }
        }
      };
      this.createGridViewStructure(div, asset);
    }

    return div;
  }

  /**
   * Create grid view structure
   */
  createGridViewStructure(div, asset) {
    const preview = this.createAssetPreview(asset);
    const info = document.createElement('div');
    info.className = 'asset-info';

    const name = document.createElement('p');
    name.className = 'asset-name';
    name.textContent = asset.name;

    const metaRow = document.createElement('div');
    metaRow.className = 'asset-meta-row';
    metaRow.style.display = 'flex';
    metaRow.style.justifyContent = 'space-between';
    metaRow.style.alignItems = 'center';
    metaRow.style.marginTop = '8px';

    const typeContainer = document.createElement('div');
    typeContainer.className = 'asset-type-container';
    typeContainer.style.display = 'flex';
    typeContainer.style.gap = '4px';

    const typeToken = document.createElement('span');
    typeToken.className = 'asset-type-token';
    typeToken.textContent = asset.type.toUpperCase();
    typeToken.style.cssText = `
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    `;

    const sourceToken = document.createElement('span');
    sourceToken.className = 'asset-source-token';
    sourceToken.textContent = asset.isExternal ? 'EXT' : 'INT';
    sourceToken.style.cssText = asset.isExternal ? `
      background: #fff3e0;
      color: #f57c00;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    ` : `
      background: #e8f5e8;
      color: #388e3c;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    `;

    typeContainer.appendChild(typeToken);
    typeContainer.appendChild(sourceToken);

    const actions = document.createElement('div');
    actions.className = 'asset-actions';
    actions.style.display = 'flex';
    actions.style.gap = '4px';
    actions.style.alignItems = 'center';

    this.addActionElements(actions, asset);

    metaRow.appendChild(typeContainer);
    metaRow.appendChild(actions);

    info.appendChild(name);
    info.appendChild(metaRow);

    div.appendChild(preview);
    div.appendChild(info);
  }

  /**
   * Create list view structure
   */
  createListViewStructure(div, asset) {
    // Column 1: Preview - clickable for asset insertion
    const preview = this.createAssetPreview(asset);
    preview.style.width = '48px';
    preview.style.height = '48px';
    preview.style.cursor = 'pointer';
    preview.title = 'Click to insert asset';

    // Add click handler to preview for asset insertion
    preview.onclick = async (e) => {
      e.stopPropagation();
      if (this.assetInsertion) {
        try {
          await this.assetInsertion.selectAsset(asset);
        } catch (error) {
          alert(`Failed to insert asset: ${error.message}`);
        }
      }
    };

    // Column 2: Name
    const nameColumn = document.createElement('div');
    nameColumn.className = 'asset-name-column';
    const name = document.createElement('p');
    name.className = 'asset-name';
    name.textContent = asset.name;
    nameColumn.appendChild(name);

    // Column 3: Type
    const type = document.createElement('div');
    type.className = 'asset-type';
    type.textContent = asset.type.toUpperCase();

    // Column 4: Source
    const source = document.createElement('div');
    source.className = 'asset-source';
    source.textContent = asset.isExternal ? 'External' : 'Internal';

    // Column 5: Actions
    const actions = document.createElement('div');
    actions.className = 'asset-actions';
    this.addActionElements(actions, asset);

    div.appendChild(preview);
    div.appendChild(nameColumn);
    div.appendChild(type);
    div.appendChild(source);
    div.appendChild(actions);
  }

  /**
   * Add action elements (AI score and buttons)
   */
  addActionElements(actions, asset) {
    // AI Match percentage
    if (asset.aiScore && asset.aiScore > 0) {
      const aiMatch = document.createElement('span');
      aiMatch.className = 'ai-match';
      aiMatch.textContent = `${Math.round(asset.aiScore)}%`;
      aiMatch.title = `AI Match Score: ${Math.round(asset.aiScore)}%`;
      actions.appendChild(aiMatch);
    }

    // Action buttons for images
    if (asset.type === 'image') {
      // Preview button (for all images)
      const previewBtn = document.createElement('button');
      previewBtn.className = 'action-btn responsive-preview-icon';
      previewBtn.innerHTML = '';
      previewBtn.title = 'Preview responsive variants (mobile, tablet, desktop)';
      previewBtn.onclick = (e) => {
        e.stopPropagation();
        this.showAssetPreview(asset);
      };
      actions.appendChild(previewBtn);

      // Usage info button (for all images)
      const usageBtn = document.createElement('button');
      usageBtn.className = 'action-btn usage-icon';
      usageBtn.innerHTML = 'ℹ️';
      usageBtn.title = 'Usage information';
      usageBtn.onclick = (e) => {
        e.stopPropagation();
        this.showUsageInfo(asset);
      };
      actions.appendChild(usageBtn);

      if (asset.isExternal) {
        // Insert as Link button (for external images)
        const linkBtn = document.createElement('button');
        linkBtn.className = 'action-btn link-action';
        linkBtn.innerHTML = '🔗';
        linkBtn.title = 'Insert as Link';
        linkBtn.onclick = (e) => {
          e.stopPropagation();
          this.insertAsLink(asset);
        };
        actions.appendChild(linkBtn);
      }

      // Open in new window button (for all images)
      const openBtn = document.createElement('button');
      openBtn.className = 'action-btn primary-action';
      openBtn.innerHTML = '↗';
      openBtn.title = asset.isExternal ? 'Open external image' : 'Open image in new window';
      openBtn.onclick = (e) => {
        e.stopPropagation();
        this.openAssetInNewWindow(asset);
      };
      actions.appendChild(openBtn);
    }
  }

  /**
   * Create asset preview with sophisticated error handling (exact copy from working version)
   */
  createAssetPreview(asset) {
    const preview = document.createElement('div');
    preview.className = `asset-preview ${asset.isExternal ? 'external' : 'internal'}`;
    preview.setAttribute('data-type', asset.type);

    // Only show image previews for image type assets
    if (asset.type === 'image') {
      // For external assets, try to use the best available URL
      let imageUrl = null;
      if (asset.isExternal) {
        // Priority: originalUrl > url > fallback
        imageUrl = asset.originalUrl || asset.url;
      } else {
        // For internal assets, use the standard URL
        imageUrl = asset.url;
      }

      // Check if we have a valid URL to display
      if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
        // Skip obviously broken URLs
        if (imageUrl.includes('undefined') || imageUrl.includes('[EXTERNAL]')
          || imageUrl.includes('https___') || imageUrl === 'null' || imageUrl === null) {
          this.createIconPreview(preview, asset);
          return preview;
        }


        const img = document.createElement('img');

        // Use the determined URL
        img.src = imageUrl;
        img.alt = asset.description || asset.name;
        img.style.width = '100%';
        img.style.height = '220px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        img.style.opacity = '0.3';
        img.style.transition = 'opacity 0.3s ease';

        // Add crossorigin for external images to handle CORS, but skip Scene7 and other CDNs that don't support it
        if (asset.isExternal && !imageUrl.includes('aem.page')
          && !imageUrl.includes('scene7.com') && !imageUrl.includes('cloudfront.net')) {
          img.crossOrigin = 'anonymous';
        }

        // Success callback
        img.onload = () => {
          img.style.opacity = '1';
        };

        // Error callback - fallback to icon
        img.onerror = () => {
          this.createIconPreview(preview, asset);
        };

        preview.appendChild(img);
      } else {
        this.createIconPreview(preview, asset);
      }
    } else {
      // Non-image assets get icon preview
      this.createIconPreview(preview, asset);
    }

    return preview;
  }

  /**
   * Create icon preview fallback
   */
  createIconPreview(container, asset) {
    container.innerHTML = ''; // Clear existing content

    const iconDiv = document.createElement('div');
    iconDiv.style.fontSize = '32px';
    iconDiv.style.textAlign = 'center';
    iconDiv.style.lineHeight = '220px';
    iconDiv.style.height = '220px';
    iconDiv.style.backgroundColor = '#f5f5f5';
    iconDiv.style.borderRadius = '4px';
    iconDiv.style.color = '#666';
    iconDiv.style.filter = 'grayscale(100%)';

    const icon = this.iconMap[asset.type] || '📁';
    iconDiv.textContent = icon;

    container.appendChild(iconDiv);

    // Add category label for external assets
    if (asset.isExternal) {
      const categoryLabel = document.createElement('div');
      categoryLabel.style.fontSize = '10px';
      categoryLabel.style.marginTop = '4px';
      categoryLabel.style.color = '#666';
      categoryLabel.style.textTransform = 'uppercase';
      categoryLabel.style.letterSpacing = '0.5px';
      categoryLabel.style.textAlign = 'center';
      categoryLabel.textContent = 'external';
      container.appendChild(categoryLabel);
    }
  }

  /**
   * Insert external asset as hyperlink
   */
  insertAsLink(asset) {
    const actualUrl = asset.originalUrl || asset.url;
    if (!actualUrl || !actualUrl.startsWith('http') || actualUrl.includes('https___')
      || actualUrl.includes('[EXTERNAL]')) {
      // eslint-disable-next-line no-console
      console.error('No valid URL available for external asset:', asset.name, actualUrl);
      return;
    }

    // Create hyperlink HTML
    const altText = asset.description || asset.displayName || asset.name;
    const fileName = asset.displayName || asset.name;
    const linkHtml = `<a href="${actualUrl}" title="${altText}">${fileName}</a>`;

    // Use asset insertion to insert the link
    if (this.assetInsertion && this.assetInsertion.insertAsset) {
      // Create a modified asset object for link insertion
      const linkAsset = {
        ...asset,
        html: linkHtml,
        insertType: 'link',
      };
      this.assetInsertion.insertAsset(linkAsset);
    } else {
      // eslint-disable-next-line no-console
      console.warn('Asset insertion not available - would insert:', linkHtml);
    }
  }

  /**
   * Open asset in new window (works for both internal and external)
   */
  openAssetInNewWindow(asset) {
    let assetUrl;

    if (asset.isExternal) {
      assetUrl = asset.originalUrl || asset.url;
      if (!assetUrl || !assetUrl.startsWith('http') || assetUrl.includes('https___')
        || assetUrl.includes('[EXTERNAL]')) {
        // eslint-disable-next-line no-console
        console.error('No valid URL available for external asset:', asset.name, assetUrl);
        return;
      }
    } else {
      // For internal assets, use the standard URL
      assetUrl = asset.url || asset.src;
      if (!assetUrl) {
        // eslint-disable-next-line no-console
        console.error('No URL available for asset:', asset.name);
        return;
      }
    }

    window.open(assetUrl, '_blank');
  }

  /**
   * Show usage information modal
   */
  showUsageInfo(asset) {
    // Get context from the global DA Media Library instance
    const context = window.daMediaLibrary?.context || null;
    showUsageInfo(asset, null, context);
  }

  /**
   * Show asset preview modal
   */
  showAssetPreview(asset) {
    this.previewModal.showImagePreview(asset);
  }

  /**
   * Render assets to container
   */
  renderAssets(assets, container, isListView = false) {
    container.innerHTML = '';

    if (isListView) {
      container.classList.add('list-view');

      // Add list header
      const listHeader = document.createElement('div');
      listHeader.className = 'list-header';
      listHeader.innerHTML = `
        <div class="header-cell">Preview</div>
        <div class="header-cell">Name</div>
        <div class="header-cell">Type</div>
        <div class="header-cell">Source</div>
        <div class="header-cell">Actions</div>
      `;
      container.appendChild(listHeader);
    } else {
      container.classList.remove('list-view');
    }

    assets.forEach((asset) => {
      const assetElement = this.createAssetElement(asset, isListView);
      container.appendChild(assetElement);
    });
  }

  /**
   * Show loading state
   */
  showLoadingState(container) {
    if (container) {
      container.innerHTML = '<div class="loading">Loading assets...</div>';
    }
  }
}
