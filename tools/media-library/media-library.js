// tools/media-library/media-library.js

import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { createDAApiService } from './services/da-api.js';
import { createMetadataManager } from './services/metadata-manager.js';
import { createAssetBrowser } from './modules/media-browser.js';
import { createAssetInsertion } from './modules/media-insert.js';
import { createQueueManager } from './modules/queue-manager.js';
import { initSelectiveRescan } from './modules/rescan.js';
import { createStateManager } from './services/state-manager.js';
import { fetchSheetJson, CONTENT_DA_LIVE_BASE } from './modules/sheet-utils.js';
import {
  loadAssetsFromMediaJson,
  setAssetBrowser as setAssetLoaderAssetBrowser,
  setAssetsRef as setAssetLoaderAssetsRef,
  setContext as setAssetLoaderContext,
} from './modules/media-loader.js';
import { initUIEvents } from './modules/ui-events.js';
import { updateSidebarCounts } from './modules/sidebar.js';
import { showToast, showError } from './modules/toast.js';
import { processScanResults } from './modules/media-processor.js';
import { showUsageInfo } from './modules/usage-modal.js';
import {
  handleDiscoveryComplete,
  handlePageScanned,
  handleScanningStarted,
  handleScanningStopped,
  handleQueueSizeUpdate,
  handleWorkerError,
  handleResumingFromQueue,
  handleDocumentsSkipped,
} from './modules/event-handlers.js';

// Constants
const POLLING_INTERVAL = 10000;
const ASSET_POLLING_INTERVAL = 5000;
const PLACEHOLDER_COUNT = 6;
const HOURS_IN_DAY = 24;

// State management
let daContext = null;
let daActions = null;
let daApi = null;
let metadataManager = null;
let assetBrowser = null;
let assetInsertion = null;
let queueManager = null;
const assets = [];

if (typeof setAssetLoaderAssetsRef === 'function') setAssetLoaderAssetsRef(assets);

let isScanning = false;
const useQueueBasedScanning = true;
let elements = {};
let stateManager = null;
let mediaPollingInterval = null;

// Event handler wrappers
const handleDiscoveryCompleteWrapper = (data) =>
  handleDiscoveryComplete(data, updateLoadingText);
const handlePageScannedWrapper = (data) =>
  handlePageScanned(
    data,
    assets,
    assetBrowser,
    metadataManager,
    processScanResults,
    updateLoadingText,
    updateScanProgressHeader,
  );
const handleScanningStartedWrapper = (data) => {
  handleScanningStarted(
    data,
    isScanning,
    showScanProgress,
    updateLoadingText,
    updateScanProgressHeader,
  );
  // Button state is managed in showScanProgress, no need to set it here
};
const handleScanningStoppedWrapper = (data) => {
  handleScanningStopped(data, assets, isScanning, hideScanProgress);
  // Show 100% and green on complete
  if (typeof window.hideScanIndicator === 'function') {
    window.hideScanIndicator();
  } else {
    try {
      import('./modules/scan-indicator.js').then((mod) => mod.hideScanIndicator());
    } catch (e) { /* intentionally empty: scan indicator is non-critical */ }
  }
  // setForceRescanButtonState(false); // Always enable after scan complete
};
const handleQueueSizeUpdateWrapper = (data) =>
  handleQueueSizeUpdate(data, updateScanProgressHeader);
const handleResumingFromQueueWrapper = (data) =>
  handleResumingFromQueue(data, updateLoadingText);

// Status text mapping
const STATUS_TEXT_MAP = {
  connected: 'Connected',
  error: 'Connection Error',
  'local-dev': 'Local Development',
  'local-dev-connected': 'Local Development (Connected)',
  default: 'Connecting...',
};

async function init() {
  try {
    initializeElements();
    updateLoadingText('Initializing DA SDK...');
    updateLoadingStep('connect', 'active');

    if (typeof DA_SDK === 'undefined') {
      throw new Error('DA SDK not available. Make sure you are running this plugin within the DA Admin environment.');
    }

    const { context, actions, token } = await DA_SDK;
    if (!context || !actions || !token) {
      throw new Error('Failed to get DA context, actions, or token from SDK');
    }

    daContext = { ...context, token };
    daActions = actions;

    updateConnectionStatus('connected');
    updateLoadingStep('connect', 'completed');

    // Initialize core services first
    await initializeCoreServices();

    // Load and render assets immediately
    await loadAndRenderAssets();

    // Setup scanning after assets are loaded
    await initializeScanning();

    showToast('Media Library loaded successfully', 'success');
    document.body.classList.add('loaded');
    document.body.style.opacity = '1';
    setInterval(checkScanAndStartPolling, POLLING_INTERVAL);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize:', error);
    updateConnectionStatus('error');
    document.body.classList.add('loaded');
    document.body.style.opacity = '1';
    showError('Failed to initialize Media Library', error);
  }
}

async function initializeCoreServices() {
  updateLoadingText('Initializing core services...');

  daApi = createDAApiService();
  await daApi.init(daContext);

  // Set context for asset loader
  if (typeof setAssetLoaderContext === 'function') {
    setAssetLoaderContext(daContext);
  }

  const metadataPath = `/${daContext.org}/${daContext.repo}/.da/media.json`;
  metadataManager = createMetadataManager(daApi, metadataPath);

  assetBrowser = createAssetBrowser(elements.assetsGrid);
  assetBrowser.on('assetSelected', handleAssetSelection);
  assetBrowser.on('assetPreview', handleAssetPreview);
  assetBrowser.on('assetInsertAsLink', handleAssetInsertAsLink);
  assetBrowser.on('assetLinkCopied', handleAssetLinkCopied);
  assetBrowser.on('assetUsage', handleAssetUsage);

  if (typeof setAssetLoaderAssetBrowser === 'function') {
    setAssetLoaderAssetBrowser(assetBrowser);
  }

  assetInsertion = createAssetInsertion();
  assetInsertion.init(daActions, daContext);

  initUIEvents({
    assetBrowser,
    handleSearch,
    handleViewChange,
    handleAssetSelection,
  });
}

async function loadAndRenderAssets() {
  updateLoadingText('Loading assets...');

  // Load assets from media.json
  await loadAssetsFromMediaJson();

  // The assets should now be loaded into the main assets array
  // Let's ensure the asset browser has the latest assets
  if (assetBrowser && assets.length > 0) {
    assetBrowser.setAssets(assets);
  }

  // Render assets immediately
  if (typeof renderAssets === 'function') renderAssets(assets);
  if (typeof updateSidebarCounts === 'function') updateSidebarCounts(assets, getCurrentPageUrl());

  updateLoadingText(`Assets loaded successfully (${assets.length} assets)`);
}

async function initializeScanning() {
  updateLoadingText('Setting up scanning system...');

  if (useQueueBasedScanning) await initializeQueueManager();

  if (queueManager?.getConfig) {
    const queueConfig = queueManager.getConfig();
    await initSelectiveRescan(queueConfig, queueManager, metadataManager);
  }

  try {
    await checkScanStatus();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to check scan status, continuing:', error);
  }

  try {
    await stateManager?.forceClearStaleScanLock();
    await stateManager?.forceClearAllScanLocks();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to clear scan lock, continuing:', error);
  }

  try {
    await startFullScan();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to start full scan, continuing:', error);
  }

  // Note: showScanProgress() is called in startFullScan(), so we don't call it here
  try {
    await queueManager?.startQueueScanning();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to start queue-based scan:', error);
  }
}

async function initializeQueueManager() {
  try {
    updateLoadingText('Initializing queue-based scanning system...');

    queueManager = createQueueManager();

    // Setup event listeners
    const eventHandlers = {
      discoveryComplete: handleDiscoveryCompleteWrapper,
      pageScanned: handlePageScannedWrapper,
      scanningStarted: handleScanningStartedWrapper,
      scanningStopped: handleScanningStoppedWrapper,
      queueSizeUpdate: handleQueueSizeUpdateWrapper,
      workerError: handleWorkerError,
      resumingFromQueue: handleResumingFromQueueWrapper,
      documentsSkipped: handleDocumentsSkipped,
    };

    Object.entries(eventHandlers).forEach(([event, handler]) => {
      queueManager.on(event, handler);
    });

    const apiConfig = daApi.getConfig();
    await queueManager.init(apiConfig);

    stateManager = createStateManager();
    await stateManager.init(apiConfig);

    try {
      await stateManager.ensureStorageStructure();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to ensure storage structure, continuing:', error);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize queue manager:', error);
    throw new Error(`Queue Manager initialization failed: ${error.message}`);
  }
}

async function checkScanStatus() {
  if (!useQueueBasedScanning || !queueManager) return;

  try {
    const [isActive, persistentStats] = await Promise.all([
      queueManager.isScanActive(),
      queueManager.getPersistentStats(),
    ]);

    if (isActive && !persistentStats.currentSession) {
      updateLoadingText('Scan in progress by another user. Please wait...');

      if (persistentStats.lastScanTime) {
        const lastScanDate = new Date(persistentStats.lastScanTime).toLocaleString();
        updateLoadingText(`Last scan: ${lastScanDate}. Another user is scanning...`);
      }
      return;
    }

    if (persistentStats.lastScanTime) {
      const lastScanDate = new Date(persistentStats.lastScanTime).toLocaleString();
      const timeSinceLastScan = Date.now() - persistentStats.lastScanTime;
      const hoursSinceLastScan = Math.floor(timeSinceLastScan / (1000 * 60 * 60));

      if (hoursSinceLastScan < HOURS_IN_DAY) {
        updateLoadingText(`Last scan: ${lastScanDate} (${hoursSinceLastScan}h ago)`);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to check scan status:', error);
  }
}

async function startFullScan(forceRescan = false) {
  try {
    isScanning = true;
    showScanProgress(); // This will set the button state
    updateLoadingText('Starting full content scan...');
    await queueManager.startQueueScanning(forceRescan);
  } catch (error) {
    showError('Full scan failed', error);
    isScanning = false;
    // setForceRescanButtonState(false); // Always enable after scan complete
    hideScanProgress();
  }
}

/**
 * Force a rescan of all documents
 */
async function forceRescan() {
  try {
    showToast('Force rescan started...', 'info');
    await startFullScan(true); // true = force rescan
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to force rescan:', error);
    showError('Failed to force rescan', error);
  }
}


const handleAssetSelection = async (asset) => {
  try {
    await assetInsertion.selectAsset(asset);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to insert asset:', error);
  }
};

const handleAssetInsertAsLink = async (asset) => {
  try {
    await assetInsertion.insertAssetAsLink(asset);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to insert asset as link:', error);
  }
};

const handleAssetLinkCopied = async (asset) => {
  try {
    const assetUrl = asset.url || asset.src;
    window.open(assetUrl, '_blank');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to open link:', error);
    showError('Failed to open link', error);
  }
};

const handleAssetUsage = (asset) => {
  try {
    showUsageInfo(asset, null, daContext);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to show usage info:', error);
    showError('Failed to show usage info', error);
  }
};

function handleAssetPreview(asset) {
  const modal = document.getElementById('previewModal');
  const {
    previewTitle: title,
    previewBody: body,
    previewInsert: insertBtn,
    previewClose: closeBtn,
  } = {
    previewTitle: document.getElementById('previewTitle'),
    previewBody: document.getElementById('previewBody'),
    previewInsert: document.getElementById('previewInsert'),
    previewClose: document.getElementById('previewClose'),
  };

  title.textContent = asset.name;

  let previewContent;
  if (asset.type === 'image') {
    previewContent = `<img src="${asset.src}" alt="${asset.alt}" style="max-width: 100%; height: auto;">`;
    // Add alt warning note if alt is missing or is fallback
    const fallbackName = (asset.src || '').split('?')[0].split('/').pop();
    if (!asset.alt || asset.alt === fallbackName) {
      previewContent += '<div class="alt-warning-note"><strong>Note:</strong> Please add a descriptive alt text for this image for accessibility.</div>';
    }
  } else if (asset.type === 'video') {
    previewContent = `<video controls style="max-width: 100%; height: auto;">
      <source src="${asset.src}" type="video/mp4">
      Your browser does not support the video tag.
    </video>`;
  } else {
    previewContent = `
      <div class="document-preview">
        <div class="document-icon">📄</div>
        <h4>${asset.name}</h4>
        <p>Document: ${asset.src}</p>
      </div>
    `;
  }

  body.innerHTML = previewContent;

  const insertHandler = () => {
    insertAsset(asset.id);
    modal.style.display = 'none';
  };

  const insertAsLinkHandler = () => {
    handleAssetInsertAsLink(asset);
    modal.style.display = 'none';
  };

  const closeHandler = () => {
    modal.style.display = 'none';
  };

  closeBtn.onclick = closeHandler;
  insertBtn.onclick = insertHandler;

  // Add "Insert as Link" button for external assets
  if (asset.isExternal) {
    // Change the insert button text for external assets
    insertBtn.textContent = 'Insert as Image';

    // Add "Insert as Link" button
    const insertAsLinkBtn = document.createElement('button');
    insertAsLinkBtn.textContent = 'Insert as Link';
    insertAsLinkBtn.className = 'btn btn-secondary';
    insertAsLinkBtn.onclick = insertAsLinkHandler;

    // Insert the new button after the insert button
    insertBtn.parentNode.insertBefore(insertAsLinkBtn, insertBtn.nextSibling);
  } else {
    // Reset button text for internal assets
    insertBtn.textContent = 'Insert';
  }

  modal.onclick = (e) => {
    if (e.target === modal) closeHandler();
  };

  modal.style.display = 'flex';
}

function initializeElements() {
  const elementIds = [
    'connectionStatus', 'refreshBtn', 'searchInput', 'assetsGrid', 'loadingState',
    'emptyState', 'toastContainer', 'loadingText', 'loadingSteps', 'scanProgress',
  ];

  elements = Object.fromEntries(
    elementIds.map((id) => [id, document.getElementById(id)]),
  );
}

function updateConnectionStatus(status) {
  if (!elements.connectionStatus) return;

  const [statusDot, statusText] = [
    elements.connectionStatus.querySelector('.status-dot'),
    elements.connectionStatus.querySelector('.status-text'),
  ];

  if (statusDot) statusDot.className = `status-dot ${status}`;
  if (statusText) statusText.textContent = STATUS_TEXT_MAP[status] || STATUS_TEXT_MAP.default;
}

function updateLoadingText(text) {
  if (elements.loadingText) elements.loadingText.textContent = text;
}

function updateLoadingStep(stepName, status) {
  if (!elements.loadingSteps) return;

  const stepElement = elements.loadingSteps.querySelector(`[data-step="${stepName}"]`);
  if (stepElement) stepElement.className = `step-item ${status}`;
}

function handleSearch(query) {
  const queryLower = query.toLowerCase();
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(queryLower)
    || asset.alt.toLowerCase().includes(queryLower),
  );
  renderAssets(filteredAssets);
}

function showPlaceholderCards() {
  const [grid, loadingMsg] = [
    document.getElementById('assetsGrid'),
    document.getElementById('assetsLoadingMessage'),
  ];

  if (grid) {
    grid.style.display = '';
    grid.innerHTML = '';

    const placeholderTemplate = `
      <div class="asset-placeholder">
        <div class="placeholder-preview"></div>
        <div class="placeholder-info">
          <div class="placeholder-name"></div>
          <div class="placeholder-pills">
            <div class="placeholder-pill"></div>
            <div class="placeholder-pill"></div>
          </div>
        </div>
        <div class="placeholder-actions">
          <div class="placeholder-action"></div>
          <div class="placeholder-action"></div>
          <div class="placeholder-action"></div>
        </div>
      </div>
    `;

    Array.from({ length: PLACEHOLDER_COUNT }, (_, _i) => {
      const placeholder = document.createElement('div');
      placeholder.className = 'asset-placeholder';
      placeholder.innerHTML = placeholderTemplate;
      grid.appendChild(placeholder);
      return placeholder;
    });
  }

  if (loadingMsg) loadingMsg.style.display = 'none';
}

function renderAssets(assetsToRender = assets) {
  if (assetBrowser) assetBrowser.setAssets(assetsToRender);

  const [grid, empty, loadingMsg] = [
    document.getElementById('assetsGrid'),
    document.getElementById('emptyState'),
    document.getElementById('assetsLoadingMessage'),
  ];

  if (assetsToRender?.length > 0) {
    if (grid) grid.style.display = '';
    if (empty) empty.style.display = 'none';
    if (loadingMsg) loadingMsg.style.display = 'none';

    const placeholders = grid?.querySelectorAll('.asset-placeholder');
    placeholders?.forEach((p) => p.remove());
    return;
  }

  if (grid) grid.style.display = 'none';
  if (empty) empty.style.display = 'block';
  if (loadingMsg) loadingMsg.style.display = 'none';
}

function insertAsset(assetId) {
  const asset = assets.find((a) => a.id === assetId);
  if (asset) handleAssetSelection(asset);
}

function handleViewChange(view) {
  const viewBtns = document.querySelectorAll('.view-btn');
  viewBtns.forEach((btn) => btn.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-view="${view}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (assetBrowser) assetBrowser.setView(view);
}

async function checkScanAndStartPolling() {
  if (!stateManager?.state?.apiConfig) return;

  const data = await fetchSheetJson(
    stateManager.state.apiConfig,
    'media-scan-state.json',
  );
  const isActive = data?.state?.data?.[0]?.isActive === 'true'
    || data?.state?.data?.[0]?.isActive === true;

  if (isActive) {
    if (!mediaPollingInterval) {
      mediaPollingInterval = setInterval(loadAssetsFromMediaJson, ASSET_POLLING_INTERVAL);
    }
    return;
  }

  if (mediaPollingInterval) {
    clearInterval(mediaPollingInterval);
    mediaPollingInterval = null;
  }

  loadAssetsFromMediaJson();
}

function getCurrentPageUrl() {
  if (daContext?.org && daContext?.repo && daContext?.path) {
    let pagePath = daContext.path;
    if (!pagePath.endsWith('.html')) {
      pagePath += '.html';
    }
    return `${CONTENT_DA_LIVE_BASE}/${daContext.org}/${daContext.repo}${pagePath}`;
  }
  return null;
}

window.insertAsset = insertAsset;

function showScanProgress() {
  const progressContainer = document.getElementById('scanProgress');
  if (progressContainer) progressContainer.style.display = 'block';
  // Show spinner/loading state
  if (typeof window.showScanIndicator === 'function') {
    window.showScanIndicator();
  } else {
    try {
      import('./modules/scan-indicator.js').then((mod) => mod.showScanIndicator());
    } catch (e) { /* intentionally empty: scan indicator is non-critical */ }
  }
  // setForceRescanButtonState(true); // Button state is managed by scan progress functions
}

function hideScanProgress() {
  const progressContainer = document.getElementById('scanProgress');
  if (progressContainer) progressContainer.style.display = 'none';
  if (typeof window.hideScanIndicator === 'function') {
    window.hideScanIndicator();
  } else {
    try {
      import('./modules/scan-indicator.js').then((mod) => mod.hideScanIndicator());
    } catch (e) { /* intentionally empty: scan indicator is non-critical */ }
  }
}

function updateScanProgressHeader(_scanned, _total) {
  // No longer showing percent or progress state
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.opacity = '1';
  document.body.classList.add('loaded');
  showPlaceholderCards();
  // Set scan indicator to spinner/loading state on load
  if (typeof window.showScanIndicator === 'function') {
    window.showScanIndicator();
  } else {
    try {
      import('./modules/scan-indicator.js').then((mod) => mod.showScanIndicator());
    } catch (e) { /* intentionally empty: scan indicator is non-critical */ }
  }
  // Button state will be managed by scan progress functions

  // Sidebar filter wiring
  document.querySelectorAll('.folder-item[data-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      const filter = el.getAttribute('data-filter');
      // Always start from a default filter state
      const defaultFilter = {
        types: ['image', 'video', 'document'],
        isExternal: undefined,
        usedOnPage: false,
        missingAlt: undefined,
        search: '',
      };
      let filterObj = {};
      switch (filter) {
        case 'all':
          filterObj = { types: ['image', 'video', 'document'], isExternal: undefined, usedOnPage: false };
          break;
        case 'internal':
          filterObj = { isExternal: false, types: ['image', 'video', 'document'], usedOnPage: false };
          break;
        case 'external':
          filterObj = { isExternal: true, types: ['image', 'video', 'document'], usedOnPage: false };
          break;
        case 'image':
          filterObj = { types: ['image'], isExternal: undefined, usedOnPage: false };
          break;
        case 'video':
          filterObj = { types: ['video'], isExternal: undefined, usedOnPage: false };
          break;
        case 'document':
          filterObj = { types: ['document'], isExternal: undefined, usedOnPage: false };
          break;
        case 'used-on-page':
          filterObj = { usedOnPage: true, isExternal: undefined, types: ['image', 'video', 'document'] };
          break;
        case 'used-internal':
          filterObj = { usedOnPage: true, isExternal: false, types: ['image', 'video', 'document'] };
          break;
        case 'used-external':
          filterObj = { usedOnPage: true, isExternal: true, types: ['image', 'video', 'document'] };
          break;
        case 'missing-alt':
          filterObj = { missingAlt: true };
          break;
        case 'used-missing-alt':
          filterObj = { usedOnPage: true, missingAlt: true };
          break;
        default:
          filterObj = { types: ['image', 'video', 'document'], isExternal: undefined, usedOnPage: false };
      }
      // Reset filter state to default, then apply the specific filter
      assetBrowser.setFilter({
        ...defaultFilter,
        ...filterObj,
      });
      document.querySelectorAll('.folder-item').forEach((item) => item.classList.remove('active'));
      el.classList.add('active');
    });
  });

  // Add Sync icons to section headers
  function addSectionSyncIcon(sectionSelector, iconId, tooltip, onClick) {
    const sectionHeader = document.querySelector(sectionSelector);
    if (sectionHeader && !document.getElementById(iconId)) {
      const syncIcon = document.createElement('span');
      syncIcon.id = iconId;
      syncIcon.className = 'sidebar-action';
      syncIcon.title = tooltip;
      syncIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor" style="vertical-align:middle;">
          <path d="M370.9 133.3C346.6 110.1 311.7 96 272 96c-79.5 0-144 64.5-144 144h48l-80 80-80-80h48c0-114.9 93.1-208 208-208
          54.5 0 104.1 20.9 142.1 55.1l-53.2 53.2zM464 256c0 79.5-64.5 144-144 144-39.7 0-74.6-14.1-98.9-37.3l53.2-53.2C217.9 401.1
          272 416 320 416c79.5 0 144-64.5 144-144h-48l80-80 80 80h-48z"/>
        </svg>
      `;
      syncIcon.style.cursor = 'pointer';
      syncIcon.style.marginLeft = '8px';
      syncIcon.addEventListener('click', onClick);
      sectionHeader.appendChild(syncIcon);
    }
  }

  // Remove sync icon from filter row if present
  const oldSyncIcon = document.getElementById('sync-current-page');
  if (oldSyncIcon && oldSyncIcon.parentNode) {
    oldSyncIcon.parentNode.removeChild(oldSyncIcon);
  }

  // Add to ALL ASSETS section header (Full Scan)
  addSectionSyncIcon(
    '#all-assets-header',
    'sync-full-scan',
    'Full Scan',
    async (e) => {
      e.stopPropagation();
      try {
        // Call your full scan logic (forceRescan)
        if (typeof forceRescan === 'function') {
          forceRescan();
          if (window.showToast) window.showToast('Full scan started.', 'info');
        } else {
          alert('Full scan function not found.');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Full scan failed.', 'error');
      }
    },
  );

  // Add to USED ON THIS PAGE section header (Sync Current Page)
  addSectionSyncIcon(
    '#used-on-page-header',
    'sync-current-page',
    'Sync Current Page',
    async (e) => {
      e.stopPropagation();
      // Use daContext.path for current page path
      let pagePath = daContext && daContext.path;
      if (pagePath && !pagePath.endsWith('.html')) {
        pagePath += '.html';
      }
      if (!pagePath) {
        if (window.showToast) window.showToast('Current page path not found in context.', 'error');
        // eslint-disable-next-line no-console -- needed for debugging context issues
        console.error('Sync Current Page: daContext.path not found', daContext);
        return;
      }
      try {
        const { handleSelectiveRescan } = await import('./modules/rescan.js');
        await handleSelectiveRescan('rescanPage', { pagePath });
        if (window.showToast) window.showToast('Scan complete for current page.', 'success');
      } catch (err) {
        if (window.showToast) window.showToast('Scan failed for current page.', 'error');
      }
    },
  );

  init().catch((error) => {
    // eslint-disable-next-line no-console -- initialization errors should be logged
    console.error('Initialization failed:', error);
  });
});
