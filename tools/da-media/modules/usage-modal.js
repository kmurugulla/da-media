import { Utils } from './utils.js';

let currentUsagePopup = null;

export function showUsageInfo(asset, triggerElement) {
  const existingPopup = document.querySelector('.usage-info-popup');
  if (existingPopup) {
    existingPopup.remove();
    return;
  }

  const popup = document.createElement('div');
  popup.className = 'usage-info-popup';
  
  const usedInPages = asset.usedInPages || [];
  
  let pagesHtml = '';
  if (usedInPages.length === 0) {
    pagesHtml = '<div class="usage-page-item no-pages">No pages found</div>';
  } else {
    pagesHtml = usedInPages.map(page => {
      const pagePath = page.path || 'Unknown path';
      const pageContext = page.context || 'content';
      const lastUsed = page.firstUsed ? new Date(page.firstUsed).toLocaleDateString() : 'Unknown';
      
      const previewUrl = buildPreviewUrl(page);
      
      return `
        <div class="usage-page-item clickable-page" data-url="${previewUrl}">
          <div class="usage-page-path">${pagePath}</div>
          <div class="usage-page-details">
            <span class="usage-context">${pageContext}</span>
            <span class="usage-date">Added: ${lastUsed}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  popup.innerHTML = `
    <div class="usage-info-header">
      <strong>Used in ${usedInPages.length} page${usedInPages.length !== 1 ? 's' : ''}</strong>
      <button class="usage-close-btn">×</button>
    </div>
    <div class="usage-pages-list">
      ${pagesHtml}
    </div>
  `;
  
  const modal = document.querySelector('.image-preview-modal');
  if (modal) {
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10001';
  } else {
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10001';
  }
  
  document.body.appendChild(popup);
  currentUsagePopup = popup;
  
  const closeBtn = popup.querySelector('.usage-close-btn');
  closeBtn.addEventListener('click', () => closeUsagePopup());
  
  const pageItems = popup.querySelectorAll('.clickable-page');
  pageItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const url = item.getAttribute('data-url');
      if (url && url !== 'null' && url !== 'undefined') {
        window.open(url, '_blank');
      }
    });
  });
  
  const closeOnOutsideClick = (e) => {
    if (!popup.contains(e.target) && e.target !== triggerElement) {
      closeUsagePopup();
      document.removeEventListener('click', closeOnOutsideClick);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeOnOutsideClick);
  }, 100);
}

function buildPreviewUrl(page) {
  try {
    const orgRepo = Utils.extractOrgRepo();
    const org = page.org || orgRepo.org;
    const repo = page.site || orgRepo.repo;
    const branch = 'main';
    
    let cleanPath = page.path || '';
    if (cleanPath.endsWith('.md')) {
      cleanPath = cleanPath.slice(0, -3);
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }
    
    if (cleanPath === '/index' || cleanPath === '/home') {
      cleanPath = '/';
    }
    
    const baseUrl = `https://${branch}--${repo}--${org}.aem.page`;
    return baseUrl + cleanPath;
  } catch (error) {
    console.error('Failed to build preview URL:', error);
    return '#';
  }
}

export function closeUsagePopup() {
  if (currentUsagePopup) {
    currentUsagePopup.remove();
    currentUsagePopup = null;
  }
} 