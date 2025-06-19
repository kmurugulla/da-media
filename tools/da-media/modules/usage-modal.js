import { Utils } from './utils.js';

let currentUsagePopup = null;

export function showUsageInfo(asset, triggerElement, context = null) {
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
    pagesHtml = usedInPages.map((page) => {
      const pagePath = page.path || 'Unknown path';
      // Remove .md extension for display
      const displayPath = pagePath.endsWith('.md') ? pagePath.slice(0, -3) : pagePath;

      const previewUrl = buildPreviewUrl(page, context);
      const liveUrl = buildLiveUrl(page, context);

      console.log('Generated URLs for page:', page.path, 'Preview:', previewUrl, 'Live:', liveUrl);

      return `
        <div class="usage-page-item">
          <div class="usage-page-path">${displayPath}</div>
          <div class="usage-page-actions">
            <button class="page-action-btn preview-btn" data-url="${previewUrl}">Preview</button>
            <button class="page-action-btn live-btn" data-url="${liveUrl}">Live</button>
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

  const actionButtons = popup.querySelectorAll('.page-action-btn');
  console.log('Found action buttons:', actionButtons.length);

  actionButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = button.getAttribute('data-url');
      console.log('Button clicked, URL:', url);

      if (url && url !== 'null' && url !== 'undefined' && url !== '#') {
        console.log('Opening URL in new tab:', url);
        window.open(url, '_blank');
      } else {
        console.error('Invalid URL:', url);
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

function getOrgRepo(context) {
  // First try to use passed context
  if (context?.org && context?.repo) {
    return { org: context.org, repo: context.repo };
  }

  // Try to get from localStorage
  try {
    const stored = localStorage.getItem('da_media_context');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.org && parsed.repo) {
        return { org: parsed.org, repo: parsed.repo };
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored context');
  }

  // Try to extract from Utils
  try {
    return Utils.extractOrgRepo();
  } catch (e) {
    console.warn('Utils.extractOrgRepo failed');
  }

  // Final fallback - extract from current URL
  try {
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
  } catch (e) {
    console.warn('URL parsing failed');
  }

  throw new Error('Unable to determine org and repo');
}

function buildPreviewUrl(page, context) {
  try {
    const { org, repo } = getOrgRepo(context);
    const branch = 'main'; // Hard-coded as requested

    let cleanPath = page.path || '';
    if (cleanPath.endsWith('.md')) {
      cleanPath = cleanPath.slice(0, -3);
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    if (cleanPath === '/index' || cleanPath === '/home') {
      cleanPath = '/';
    }

    const previewUrl = `https://${branch}--${repo}--${org}.aem.page${cleanPath}`;
    console.log('Built preview URL:', previewUrl);
    return previewUrl;
  } catch (error) {
    console.error('Error building preview URL:', error);
    return '#';
  }
}

function buildLiveUrl(page, context) {
  try {
    const { org, repo } = getOrgRepo(context);
    const branch = 'main'; // Hard-coded as requested - same branch for live

    let cleanPath = page.path || '';
    if (cleanPath.endsWith('.md')) {
      cleanPath = cleanPath.slice(0, -3);
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    if (cleanPath === '/index' || cleanPath === '/home') {
      cleanPath = '/';
    }

    const liveUrl = `https://${branch}--${repo}--${org}.aem.live${cleanPath}`;
    console.log('Built live URL:', liveUrl);
    return liveUrl;
  } catch (error) {
    console.error('Error building live URL:', error);
    return '#';
  }
}

export function closeUsagePopup() {
  if (currentUsagePopup) {
    currentUsagePopup.remove();
    currentUsagePopup = null;
  }
}
