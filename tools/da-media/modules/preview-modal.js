import { Utils } from './utils.js';
import { showUsageInfo } from './usage-modal.js';

export class PreviewModalManager {
  constructor() {
    this.currentModal = null;
  }

  showImagePreview(asset) {
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    overlay.onclick = () => this.closeModal();

    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.onclick = (e) => e.stopPropagation();

    const header = document.createElement('div');
    header.className = 'preview-header';
    header.innerHTML = `
      <h3>${asset.name || asset.displayName}</h3>
      <button class="close-btn" onclick="document.body.removeChild(document.querySelector('.image-preview-overlay'))">×</button>
    `;

    const tabs = document.createElement('div');
    tabs.className = 'device-tabs';
    tabs.innerHTML = `
      <button class="device-tab active" data-device="desktop" title="Show desktop responsive variant">🖥️ Desktop</button>
      <button class="device-tab" data-device="tablet" title="Show tablet responsive variant">📟 Tablet</button>
      <button class="device-tab" data-device="mobile" title="Show mobile responsive variant">📱 Mobile</button>
    `;

    const imageContainer = document.createElement('div');
    imageContainer.className = 'preview-image-container desktop';
    
    const viewportIndicator = document.createElement('div');
    viewportIndicator.className = 'viewport-indicator';
    viewportIndicator.innerHTML = '<span class="viewport-label">DESKTOP VIEW</span>';
    imageContainer.appendChild(viewportIndicator);

    const imageElement = this.createPreviewImage(asset);
    imageElement.style.cursor = 'pointer';
    imageElement.title = 'Click to open image in new tab';
    imageElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const activeTab = modal.querySelector('.device-tab.active');
      const currentDevice = activeTab ? activeTab.dataset.device : 'desktop';
      const imageUrl = asset.url || asset.originalUrl;
      if (imageUrl) {
        window.open(imageUrl, '_blank');
      }
    });
    
    imageContainer.appendChild(imageElement);

    const imageInfo = document.createElement('div');
    imageInfo.className = 'preview-info';
    
    const initialDimensions = Utils.getImageDimensionsForDevice(asset, 'desktop');
    const initialFileSize = Utils.getFileSizeForDevice(asset, 'desktop');
    
    imageInfo.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <strong>Dimensions:</strong> <span id="current-dimensions">${initialDimensions}</span>
        </div>
        <div class="info-item">
          <strong>File Size:</strong> <span id="current-file-size">${initialFileSize}</span>
        </div>
        <div class="info-item">
          <strong>Alt Text:</strong> ${asset.originalAltText || asset.description || 'None'}
        </div>
        <div class="info-item">
          <strong>Usage Count:</strong> ${asset.usageCount || 0} pages 
          <span class="usage-info-icon" id="usage-info-btn" title="Show pages where this image is used">ⓘ</span>
        </div>
        <div class="info-item">
          <strong>AI Score:</strong> ${Math.round(asset.aiScore || 0)}%
        </div>
        <div class="info-item">
          <strong>Type:</strong> ${asset.isExternal ? 'External' : 'Internal'}
        </div>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(tabs);
    modal.appendChild(imageContainer);
    modal.appendChild(imageInfo);
    overlay.appendChild(modal);

    tabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('device-tab')) {
        tabs.querySelectorAll('.device-tab').forEach(tab => tab.classList.remove('active'));
        e.target.classList.add('active');
        
        imageElement.classList.add('switching');
        imageContainer.classList.add('switching');
        
        const device = e.target.dataset.device;
        imageContainer.className = `preview-image-container ${device} switching`;
        
        const viewportLabel = modal.querySelector('.viewport-label');
        if (viewportLabel) {
          viewportLabel.textContent = `${device.toUpperCase()} VIEW`;
        }
        
        setTimeout(() => {
          const dimensionsSpan = modal.querySelector('#current-dimensions');
          if (dimensionsSpan) {
            const newDimensions = Utils.getImageDimensionsForDevice(asset, device);
            dimensionsSpan.textContent = newDimensions;
          }
          
          const fileSizeSpan = modal.querySelector('#current-file-size');
          if (fileSizeSpan) {
            const newFileSize = Utils.getFileSizeForDevice(asset, device);
            fileSizeSpan.textContent = newFileSize;
          }
          
          setTimeout(() => {
            imageElement.classList.remove('switching');
            imageContainer.className = `preview-image-container ${device}`;
          }, 300);
        }, 100);
      }
    });

    const usageInfoBtn = modal.querySelector('#usage-info-btn');
    if (usageInfoBtn) {
      usageInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showUsageInfo(asset, e.target);
      });
    }

    this.currentModal = overlay;
    document.body.appendChild(overlay);
    
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  createPreviewImage(asset) {
    const img = document.createElement('img');
    img.className = 'preview-image desktop';
    img.src = asset.url || asset.originalUrl || asset.path;
    img.alt = asset.originalAltText || asset.description || asset.name;
    
    img.onerror = () => {
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
      img.alt = 'Image not available';
    };
    
    return img;
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' && this.currentModal) {
      this.closeModal();
    }
  }

  closeModal() {
    if (this.currentModal) {
      document.body.removeChild(this.currentModal);
      this.currentModal = null;
      document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
  }
} 