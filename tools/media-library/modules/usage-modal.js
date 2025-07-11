// tools/media-library/modules/usage-modal.js

let currentUsagePopup = null;

function buildPreviewUrlFromPath(pagePath) {
  const parts = pagePath.split('/');
  const org = parts[1];
  const repo = parts[2];
  let rest = parts.slice(3).join('/');
  rest = rest.replace(/\.html$/, '');
  if (!rest.startsWith('/') && rest.length > 0) rest = '/' + rest;
  if (rest === '/index') rest = '/';
  return `https://main--${repo}--${org}.aem.page${rest}`;
}

function buildLiveUrlFromPath(pagePath) {
  const parts = pagePath.split('/');
  const org = parts[1];
  const repo = parts[2];
  let rest = parts.slice(3).join('/');
  rest = rest.replace(/\.html$/, '');
  if (!rest.startsWith('/') && rest.length > 0) rest = '/' + rest;
  if (rest === '/index') rest = '/';
  return `https://main--${repo}--${org}.aem.live${rest}`;
}

export function showUsageInfo(asset, triggerElement) {
  const existingPopup = document.querySelector('.usage-info-popup');
  if (existingPopup) {
    existingPopup.remove();
    return;
  }

  const popup = document.createElement('div');
  popup.className = 'usage-info-popup';

  // Always parse usedIn as a comma-delimited string of paths
  const usedInPages = asset.usedIn
    ? asset.usedIn.split(',').map((p) => p.trim()).filter(Boolean)
    : [];

  let pagesHtml = '';
  if (usedInPages.length === 0) {
    pagesHtml = '<div class="usage-page-item no-pages">No pages found</div>';
  } else {
    pagesHtml = `
      <div class="usage-table-wrapper">
        <table class="usage-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Preview URL</th>
              <th>Live URL</th>
            </tr>
          </thead>
          <tbody>
            ${usedInPages.map((pagePath) => {
    let displayPath = pagePath;
    if (displayPath.includes('index.html')) {
      displayPath = '/';
    }
    const previewUrl = buildPreviewUrlFromPath(pagePath);
    const liveUrl = buildLiveUrlFromPath(pagePath);
    const editUrl = `https://da.live/edit#${pagePath}`;
    return `
      <tr>
        <td><a href="${editUrl}" target="_blank" rel="noopener">${editUrl}</a></td>
        <td><a href="${previewUrl}" target="_blank" rel="noopener">${previewUrl}</a></td>
        <td><a href="${liveUrl}" target="_blank" rel="noopener">${liveUrl}</a></td>
      </tr>
    `;
  }).join('')}
          </tbody>
        </table>
      </div>
    `;
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

  document.body.appendChild(popup);
  currentUsagePopup = popup;

  const closeBtn = popup.querySelector('.usage-close-btn');
  closeBtn.addEventListener('click', () => closeUsagePopup());

  const actionButtons = popup.querySelectorAll('.page-action-btn');

  actionButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = button.getAttribute('data-url');

      if (url && url !== 'null' && url !== 'undefined' && url !== '#') {
        window.open(url, '_blank');
      } else {
        // eslint-disable-next-line no-console
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

export function closeUsagePopup() {
  if (currentUsagePopup) {
    currentUsagePopup.remove();
    currentUsagePopup = null;
  }
}
