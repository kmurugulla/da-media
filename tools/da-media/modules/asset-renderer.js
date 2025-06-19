/**
 * Asset Renderer Module
 * Handles DOM creation and image preview logic with error handling
 */
import { PreviewModalManager } from './preview-modal.js';

export class AssetRenderer {
  constructor() {
    this.iconMap = {
      image: '🖼️',
      video: '🎬',
      document: '📄',
      icon: '⭐',
      audio: '🎵',
      pdf: '📋'
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

    // Add main card click handler for asset insertion
    div.onclick = async () => {
      if (this.assetInsertion) {
        try {
          await this.assetInsertion.selectAsset(asset);
        } catch (error) {
          alert(`Failed to insert asset: ${error.message}`);
        }
      }
    };

    if (isListView) {
      this.createListViewStructure(div, asset);
    } else {
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
    // Column 1: Name (preview + name)
    const nameColumn = document.createElement('div');
    nameColumn.className = 'asset-name-column';
    
    const preview = this.createAssetPreview(asset);
    const info = document.createElement('div');
    info.className = 'asset-info';
    
    const name = document.createElement('p');
    name.className = 'asset-name';
    name.textContent = asset.name;
    
    info.appendChild(name);
    nameColumn.appendChild(preview);
    nameColumn.appendChild(info);
    
    // Column 2: Type
    const type = document.createElement('div');
    type.className = 'asset-type';
    const prefix = asset.isExternal ? 'EXT' : 'INT';
    type.textContent = `${asset.type.toUpperCase()} (${prefix})`;
    
    // Column 3: Actions
    const actions = document.createElement('div');
    actions.className = 'asset-actions';
    
    this.addActionElements(actions, asset);
    
    div.appendChild(nameColumn);
    div.appendChild(type);
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

    // Action button
    if (asset.type === 'image') {
      const actionBtn = document.createElement('button');
      actionBtn.className = asset.isExternal ? 'action-btn primary-action' : 'action-btn eye-icon';
      
      if (asset.isExternal) {
        actionBtn.innerHTML = '↗';
        actionBtn.title = 'Open external image';
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          this.openExternalAsset(asset);
        };
      } else {
        actionBtn.innerHTML = '👁';
        actionBtn.title = 'Preview image';
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          this.showAssetPreview(asset);
        };
      }
      actions.appendChild(actionBtn);
    }
  }

  /**
   * Create asset preview with sophisticated error handling (exact copy from working version)
   */
  createAssetPreview(asset) {
    const preview = document.createElement('div');
    preview.className = 'asset-preview';
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
        if (imageUrl.includes('undefined') || imageUrl.includes('[EXTERNAL]') || imageUrl.includes('https___')) {
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
        
        // Add crossorigin for external images to handle CORS
        if (asset.isExternal) {
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
   * Open external asset in new window
   */
  openExternalAsset(asset) {
    const actualUrl = asset.originalUrl || asset.url;
    if (actualUrl && actualUrl.startsWith('http') && !actualUrl.includes('https___') && !actualUrl.includes('[EXTERNAL]')) {
      window.open(actualUrl, '_blank');
    } else {
      alert(`No valid URL available for this external asset.\n\nAsset: ${asset.name}\nURL: ${actualUrl || 'None'}`);
    }
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
    } else {
      container.classList.remove('list-view');
    }
    
    assets.forEach(asset => {
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