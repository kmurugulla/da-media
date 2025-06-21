// tools/da-media-basic/da-media-basic.js
// DA Media Basic - using queue-based scanning architecture with web workers

// eslint-disable-next-line import/no-unresolved, no-unused-vars
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { createDAApiService } from './services/da-api.js';
import { createMetadataManager } from './services/metadata-manager.js';
import { createAssetBrowser } from './modules/asset-browser.js';
import { createAssetInsertion } from './modules/asset-insertion.js';
import { createQueueManager } from './modules/queue-manager.js';
import { createSelectiveRescan } from './modules/selective-rescan.js';
import { createUtils } from './modules/utils.js';
import { createFolderTree } from './modules/folder-tree.js';

// Global state
let daContext = null;
let daActions = null;
let daApi = null;
let metadataManager = null;
let assetBrowser = null;
let assetInsertion = null;
let queueManager = null;
let selectiveRescan = null;
let utils = null;
let folderTree = null;
let assets = [];
// eslint-disable-next-line no-unused-vars
let isScanning = false;
const useQueueBasedScanning = true;

// DOM elements
let elements = {};

/**
 * Initialize DA Media Basic
 */
async function init() {
  try {
    initializeElements();

    updateLoadingText('Initializing DA SDK...');
    updateLoadingStep('connect', 'active');

    const { context, actions, token } = await DA_SDK;

    daContext = { ...context, token };
    daActions = actions;

    // eslint-disable-next-line no-console
    console.log('DA SDK loaded:', {
      context: daContext,
      actions,
      hasToken: !!token,
      org: daContext.org,
      repo: daContext.repo,
      contextKeys: Object.keys(daContext),
    });

    updateConnectionStatus('connected');
    updateLoadingStep('connect', 'completed');

    await initializeServices();
    await loadExistingAssets();
    await checkScanStatus();
    await startFullScan();

    showToast('DA Media Basic loaded successfully', 'success');

    document.body.classList.add('loaded');
    document.body.style.opacity = '1';

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize:', error);

    updateConnectionStatus('error');
    document.body.classList.add('loaded');
    document.body.style.opacity = '1';
    showError('Failed to initialize DA Media Basic', error);
  }
}

/**
 * Initialize services and modules
 */
async function initializeServices() {
  updateLoadingText('Initializing services...');

  daApi = createDAApiService();
  await daApi.init(daContext);

  // Construct full metadata path with org/repo prefix
  const metadataPath = `/${daContext.org}/${daContext.repo}/.da/media.json`;
  metadataManager = createMetadataManager(daApi, metadataPath);

  assetBrowser = createAssetBrowser(elements.assetsGrid);
  assetBrowser.on('assetSelected', handleAssetSelection);
  assetBrowser.on('assetPreview', handleAssetPreview);

  assetInsertion = createAssetInsertion();
  assetInsertion.init(daActions, daContext);

  // Initialize queue manager if using queue-based scanning
  if (useQueueBasedScanning) {
    await initializeQueueManager();
  }

  // Initialize selective rescan module
  selectiveRescan = createSelectiveRescan();
  await selectiveRescan.init(daApi.getConfig(), queueManager, metadataManager);

  utils = createUtils();
  folderTree = createFolderTree(elements.folderTree);

  // Setup folder tree event listener
  folderTree.on('folderSelected', handleFolderSelection);

  setupEventListeners();
}

/**
 * Initialize queue manager for enterprise-scale scanning
 */
async function initializeQueueManager() {
  try {
    updateLoadingText('Initializing queue-based scanning system...');

    queueManager = createQueueManager();

    // Setup queue manager event listeners
    queueManager.on('discoveryComplete', handleDiscoveryComplete);
    queueManager.on('pageScanned', handlePageScanned);
    queueManager.on('scanningStarted', handleScanningStarted);
    queueManager.on('scanningStopped', handleScanningStopped);
    queueManager.on('queueSizeUpdate', handleQueueSizeUpdate);
    queueManager.on('workerError', handleWorkerError);
    queueManager.on('resumingFromQueue', handleResumingFromQueue);
    queueManager.on('documentsSkipped', handleDocumentsSkipped);

    // Initialize with API configuration
    const apiConfig = daApi.getConfig();

    // Debug: Log the API configuration being passed to queue manager
    // eslint-disable-next-line no-console
    console.log('Queue Manager API Config:', {
      ...apiConfig,
      token: apiConfig.token ? `${apiConfig.token.substring(0, 10)}...` : 'MISSING',
    });

    await queueManager.init(apiConfig);

    // eslint-disable-next-line no-console
    console.log('Queue Manager initialized successfully');

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize queue manager:', error);

    // TEMPORARILY DISABLED: Don't fallback to traditional scanning
    // This will help us debug the queue system issues
    // useQueueBasedScanning = false;
    // showToast('Queue system unavailable, using traditional scanning', 'warning');

    // Instead, throw the error so we can see what's wrong
    throw new Error(`Queue Manager initialization failed: ${error.message}`);
  }
}

/**
 * Load existing assets from metadata
 */
async function loadExistingAssets() {
  try {
    updateLoadingText('Loading existing assets...');
    updateLoadingStep('metadata', 'active');

    const metadata = await metadataManager.getMetadata();

    if (metadata.assets && metadata.assets.data && metadata.assets.data.length > 0) {
      assets = metadata.assets.data;
      assetBrowser.setAssets(assets);
      updateAssetCounts();

      // eslint-disable-next-line no-console
      console.log(`Loaded ${assets.length} existing assets from metadata`);

      showToast(`Loaded ${assets.length} existing assets`, 'success');
    }

    updateLoadingStep('metadata', 'completed');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load existing assets:', error);
    updateLoadingStep('metadata', 'completed');
  }
}

/**
 * Check scan status and handle resumption or conflicts
 */
async function checkScanStatus() {
  if (!useQueueBasedScanning || !queueManager) {
    return;
  }

  try {
    updateLoadingText('Checking scan status...');

    const isActive = await queueManager.isScanActive();
    const persistentStats = await queueManager.getPersistentStats();

    if (isActive && !persistentStats.currentSession) {
      // Another user is scanning
      showToast('Scan in progress by another user. Waiting...', 'warning');
      updateLoadingText('Scan in progress by another user. Please wait...');

      // Show scan status from other user
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

      // eslint-disable-next-line no-console
      console.log('Previous scan statistics:', {
        totalDocuments: persistentStats.totalDocuments,
        totalAssets: persistentStats.totalAssets,
        lastScanTime: lastScanDate,
        hoursSinceLastScan,
      });

      if (hoursSinceLastScan < 24) {
        showToast(`Last scan: ${lastScanDate} (${hoursSinceLastScan}h ago)`, 'info');
      }
    }

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to check scan status:', error);
  }
}

/**
 * Start full scan of all HTML files
 */
async function startFullScan(forceRescan = false) {
  try {
    isScanning = true;
    showScanProgress();

    updateLoadingText('Starting full content scan...');

    // Start queue-based scanning
    await queueManager.startQueueScanning(forceRescan);

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Full scan failed:', error);
    showError('Full scan failed', error);
    isScanning = false;
    hideScanProgress();
  }
}


/**
 * Process scan results and create asset objects
 */
function processScanResults(scanResults) {
  const discoveredAssets = [];
  const existingAssetUrls = new Set(assets.map((asset) => asset.src));

  scanResults.forEach((result) => {
    if (result.assets && result.assets.length > 0) {
      result.assets.forEach((asset) => {
        if (!existingAssetUrls.has(asset.src)) {
          const processedAsset = {
            id: generateAssetId(asset.src),
            src: asset.src,
            name: extractAssetName(asset.src),
            type: determineAssetType(asset.src),
            alt: asset.alt || '',
            usedIn: asset.usedIn || [result.file.path],
            isExternal: daApi.isExternalAsset(asset.src),
            dimensions: asset.dimensions || {},
            context: asset.context || 'unknown',
            lastSeen: Date.now(),
          };

          discoveredAssets.push(processedAsset);
          existingAssetUrls.add(asset.src);
        }
      });
    }
  });

  return discoveredAssets;
}


/**
 * Generate unique asset ID
 */
function generateAssetId(src) {
  return btoa(src).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16) + Date.now().toString(36);
}

/**
 * Extract asset name from URL
 */
function extractAssetName(src) {
  try {
    const url = new URL(src, window.location.origin);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop();
    return filename || 'Untitled Asset';
  } catch {
    return src.split('/').pop() || 'Untitled Asset';
  }
}

/**
 * Determine asset type from URL
 */
function determineAssetType(src) {
  const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)(\?|$|#)/i;
  const videoExts = /\.(mp4|webm|ogg|avi|mov|wmv|flv)(\?|$|#)/i;
  const docExts = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?|$|#)/i;

  if (imageExts.test(src)) return 'image';
  if (videoExts.test(src)) return 'video';
  if (docExts.test(src)) return 'document';

  return 'unknown';
}

/**
 * Update progress bar
 */
function updateProgressBar(percentage) {
  const progressBar = document.getElementById('progressBar');
  const progressPercentage = document.getElementById('progressPercentage');

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }

  if (progressPercentage) {
    progressPercentage.textContent = `${percentage}%`;
  }
}

/**
 * Handle asset selection for insertion
 */
async function handleAssetSelection(asset) {
  try {
    await assetInsertion.selectAsset(asset);
    showToast(`Inserted ${asset.name}`, 'success');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to insert asset:', error);
    showToast(`Failed to insert ${asset.name}`, 'error');
  }
}

/**
 * Handle asset preview
 */
function handleAssetPreview(asset) {
  // TODO: Implement asset preview modal
  // eslint-disable-next-line no-console
  console.log('Preview asset:', asset);
}

/**
 * Get DOM element references
 */
function initializeElements() {
  elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    refreshBtn: document.getElementById('refreshBtn'),
    searchInput: document.getElementById('searchInput'),
    assetsGrid: document.getElementById('assetsGrid'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    toastContainer: document.getElementById('toastContainer'),
    loadingText: document.getElementById('loadingText'),
    loadingSteps: document.getElementById('loadingSteps'),
    scanProgress: document.getElementById('scanProgress'),
    folderTree: document.getElementById('folderTree'),
  };
}

/**
 * Update connection status in header
 */
function updateConnectionStatus(status) {
  if (!elements.connectionStatus) return;

  const statusDot = elements.connectionStatus.querySelector('.status-dot');
  const statusText = elements.connectionStatus.querySelector('.status-text');

  if (statusDot) statusDot.className = `status-dot ${status}`;

  if (statusText) {
    switch (status) {
      case 'connected':
        statusText.textContent = 'Connected';
        break;
      case 'error':
        statusText.textContent = 'Connection Error';
        break;
      default:
        statusText.textContent = 'Connecting...';
    }
  }
}

/**
 * Update loading text
 */
function updateLoadingText(text) {
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

/**
 * Update loading step status
 */
function updateLoadingStep(stepName, status) {
  if (!elements.loadingSteps) return;

  const stepElement = elements.loadingSteps.querySelector(`[data-step="${stepName}"]`);
  if (stepElement) {
    stepElement.className = `step-item ${status}`;
  }
}

/**
 * Show empty state (no assets found)
 */
function showEmptyState() {
  if (elements.loadingState) elements.loadingState.style.display = 'none';
  if (elements.emptyState) elements.emptyState.style.display = 'flex';
  if (elements.assetsGrid) elements.assetsGrid.style.display = 'none';
}


/**
 * Set up event listeners
 */
function setupEventListeners() {
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', refreshAssets);
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', utils.debounce((e) => {
      handleSearch(e.target.value);
    }, 300));
  }

  // View toggle buttons
  const viewBtns = document.querySelectorAll('.view-btn');
  viewBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const view = e.target.closest('.view-btn').dataset.view;
      handleViewChange(view);
    });
  });
}

/**
 * Handle refresh with selective rescan options
 */
function refreshAssets() {
  if (!selectiveRescan) {
    // Fallback to full scan if selective rescan not available
    showToast('Refreshing assets...', 'info');
    assets = [];
    startFullScan();
    return;
  }

  // Show rescan options modal
  showRescanOptionsModal();
}

/**
 * Show rescan options modal
 */
function showRescanOptionsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Rescan Options</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="rescan-options">
          <button class="rescan-option" data-action="full">
            <div class="option-icon">🔄</div>
            <div class="option-content">
              <strong>Full Rescan</strong>
              <p>Scan all content files for assets</p>
            </div>
          </button>
          
          <button class="rescan-option" data-action="modified">
            <div class="option-icon">📝</div>
            <div class="option-content">
              <strong>Modified Since Last Week</strong>
              <p>Scan only files modified in the last 7 days</p>
            </div>
          </button>
          
          <button class="rescan-option" data-action="folder">
            <div class="option-icon">📁</div>
            <div class="option-content">
              <strong>Specific Folder</strong>
              <p>Choose a folder to rescan</p>
            </div>
          </button>
          
          <button class="rescan-option" data-action="suggestions">
            <div class="option-icon">💡</div>
            <div class="option-content">
              <strong>Smart Suggestions</strong>
              <p>Get AI-powered rescan recommendations</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  modal.querySelector('.modal-close').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  modal.querySelectorAll('.rescan-option').forEach((option) => {
    option.addEventListener('click', () => {
      const action = option.dataset.action;
      modal.remove();
      handleRescanAction(action);
    });
  });
}

/**
 * Handle rescan action selection
 */
async function handleRescanAction(action) {
  try {
    switch (action) {
      case 'full':
        showToast('Starting full rescan...', 'info');
        assets = [];
        await startFullScan(true);
        break;

      case 'modified': {
        showToast('Scanning modified files...', 'info');
        const weekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
        const modifiedResults = await selectiveRescan.rescanModifiedSince(weekAgo);
        const message = `Rescanned ${modifiedResults.documentsProcessed} modified files, `
                     + `found ${modifiedResults.assetsFound} assets`;
        showToast(message, 'success');
        break;
      }

      case 'folder':
        showFolderSelectionModal();
        break;

      case 'suggestions':
        await showRescanSuggestions();
        break;

      default:
        showToast('Unknown rescan option', 'error');
    }
  } catch (error) {
    showError('Rescan failed', error);
  }
}

/**
 * Show folder selection modal
 */
function showFolderSelectionModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Select Folder to Rescan</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="folder-input-section">
          <label for="folderPath">Folder Path:</label>
          <input type="text" id="folderPath" placeholder="/path/to/folder" value="/">
          <div class="folder-options">
            <label>
              <input type="checkbox" id="recursiveRescan" checked>
              Include subfolders
            </label>
            <label>
              <input type="checkbox" id="forceRescan">
              Force rescan (ignore cache)
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-primary">Start Rescan</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  modal.querySelector('.modal-close').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('.btn-secondary').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('.btn-primary').addEventListener('click', async () => {
    const folderPath = modal.querySelector('#folderPath').value;
    const recursive = modal.querySelector('#recursiveRescan').checked;
    const forceRescan = modal.querySelector('#forceRescan').checked;

    modal.remove();

    try {
      showToast(`Rescanning folder: ${folderPath}...`, 'info');
      const results = await selectiveRescan.rescanFolder(folderPath, {
        recursive,
        forceRescan,
      });
      showToast(`Rescanned ${results.documentsProcessed} files, found ${results.assetsFound} assets`, 'success');
    } catch (error) {
      showError('Folder rescan failed', error);
    }
  });
}

/**
 * Show rescan suggestions
 */
async function showRescanSuggestions() {
  try {
    showToast('Analyzing content for rescan suggestions...', 'info');
    const suggestions = await selectiveRescan.getRescanSuggestions();

    if (suggestions.length === 0) {
      showToast('No rescan suggestions available', 'info');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Rescan Suggestions</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="suggestions-list">
            ${suggestions.map((suggestion, index) => `
              <div class="suggestion-item" data-index="${index}">
                <div class="suggestion-priority ${suggestion.priority}"></div>
                <div class="suggestion-content">
                  <strong>${suggestion.title}</strong>
                  <p>${suggestion.description}</p>
                </div>
                <button class="btn btn-small btn-primary">Apply</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelectorAll('.suggestion-item .btn').forEach((btn, index) => {
      btn.addEventListener('click', async () => {
        const suggestion = suggestions[index];
        modal.remove();

        try {
          showToast(`Applying suggestion: ${suggestion.title}...`, 'info');

          let results;
          if (suggestion.action === 'rescan_folder') {
            results = await selectiveRescan.rescanFolder(suggestion.target);
          } else if (suggestion.action === 'rescan_modified_since') {
            results = await selectiveRescan.rescanModifiedSince(suggestion.target);
          }

          if (results) {
            const message = `Applied suggestion: ${results.documentsProcessed} files processed, `
                         + `${results.assetsFound} assets found`;
            showToast(message, 'success');
          }
        } catch (error) {
          showError('Failed to apply suggestion', error);
        }
      });
    });

  } catch (error) {
    showError('Failed to get rescan suggestions', error);
  }
}

/**
 * Handle folder selection for filtering assets
 */
function handleFolderSelection(folder) {
  if (folder) {
    // Filter assets by folder path
    const filteredAssets = assets.filter((asset) =>
      asset.usedIn.some((path) => path.startsWith(folder.path)),
    );
    renderAssets(filteredAssets);
    showToast(`Showing assets from: ${folder.name}`, 'info');
  } else {
    // Show all assets
    renderAssets(assets);
    showToast('Showing all assets', 'info');
  }
}

/**
 * Handle search
 */
function handleSearch(query) {
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(query.toLowerCase())
    || asset.alt.toLowerCase().includes(query.toLowerCase()),
  );
  renderAssets(filteredAssets);
}

/**
 * Render assets in grid
 */
function renderAssets(assetsToRender = assets) {
  if (assetBrowser) {
    assetBrowser.setAssets(assetsToRender);
  }
}

/**
 * Legacy insert asset function (now handled by asset insertion module)
 */
function insertAsset(assetId) {
  const asset = assets.find((a) => a.id === assetId);
  if (asset) {
    handleAssetSelection(asset);
  }
}

/**
 * Show toast message
 */
function showToast(message, type = 'info') {
  if (!elements.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

/**
 * Show error
 */
function showError(message, error) {
  showToast(message, 'error');

  if (window.location.hostname === 'localhost') {
    const debugInfo = document.createElement('div');
    debugInfo.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      padding: 15px;
      border-radius: 8px;
      max-width: 400px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;

    debugInfo.innerHTML = `
      <strong>🔧 Debug Info</strong><br>
      <strong>Error:</strong> ${error.message}<br>
      <strong>URL:</strong> ${window.location.href}<br>
      <strong>Context:</strong> ${daContext ? 'Available' : 'Missing'}<br>
      <strong>Actions:</strong> ${daActions ? 'Available' : 'Missing'}<br>
      <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px;">Close</button>
    `;

    document.body.appendChild(debugInfo);
  }
}

/**
 * Handle view change between grid and list
 */
function handleViewChange(view) {
  // Update active button
  const viewBtns = document.querySelectorAll('.view-btn');
  viewBtns.forEach((btn) => btn.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-view="${view}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Update asset browser view
  if (assetBrowser) {
    assetBrowser.setView(view);
  }
}

/**
 * Queue Manager Event Handlers
 */

/**
 * Handle discovery completion
 */
function handleDiscoveryComplete(data) {
  // eslint-disable-next-line no-console
  console.log('Discovery complete:', data);

  const totalDocuments = data.totalDocuments || 0;
  const stats = data.stats || {};
  const queuedPages = stats.queuedPages || stats.totalPages || totalDocuments;

  updateLoadingText(`Discovered ${totalDocuments} documents, ${queuedPages} queued for scanning`);
  showToast(`Found ${totalDocuments} documents to scan`, 'info');
}

/**
 * Handle page scanned event
 */
function handlePageScanned(data) {
  // eslint-disable-next-line no-console
  console.log('Page scanned:', data.page, 'Assets:', data.assetCount);

  // Add new assets to the collection
  if (data.assets && data.assets.length > 0) {
    const newAssets = processScanResults({ assets: data.assets });
    if (newAssets.length > 0) {
      assets.push(...newAssets);
      assetBrowser.setAssets(assets);
      updateAssetCounts();
    }
  }

  // Update progress
  const stats = data.stats;
  if (stats) {
    updateLoadingText(`Scanned: ${stats.scannedPages}/${stats.totalPages} pages, Found: ${stats.totalAssets} assets`);
  }
}

/**
 * Handle scanning started event
 */
function handleScanningStarted(data) {
  // eslint-disable-next-line no-console
  console.log('Queue-based scanning started:', data);
  isScanning = true;
  showScanProgress();
  updateLoadingText('Queue-based scanning started...');
}

/**
 * Handle scanning stopped event
 */
function handleScanningStopped(data) {
  // eslint-disable-next-line no-console
  console.log('Queue-based scanning stopped:', data);
  isScanning = false;
  hideScanProgress();

  const stats = data.stats;
  if (stats) {
    showToast(`Scan complete! Found ${stats.totalAssets} assets from ${stats.scannedPages} pages`, 'success');

    // Show empty state if no assets were found
    if (stats.totalAssets === 0 && assets.length === 0) {
      showEmptyState();
    }
  }
}

/**
 * Handle queue size updates
 */
function handleQueueSizeUpdate(data) {
  // eslint-disable-next-line no-console
  console.log('Queue size update:', data.size);

  const stats = data.stats;
  if (stats && stats.totalPages > 0) {
    const progress = ((stats.scannedPages / stats.totalPages) * 100).toFixed(1);
    updateProgressBar(parseFloat(progress));
  }
}

/**
 * Handle worker errors
 */
function handleWorkerError(data) {
  // eslint-disable-next-line no-console
  console.error('Worker error:', data);
  showToast(`${data.worker} worker error: ${data.error}`, 'error');
}

/**
 * Handle resuming from saved queue
 */
function handleResumingFromQueue(data) {
  // eslint-disable-next-line no-console
  console.log('Resuming from saved queue:', data);
  showToast(`Resuming scan from ${data.queueSize} pending documents`, 'info');
  updateLoadingText(`Resuming scan from ${data.queueSize} pending documents...`);
}

/**
 * Handle documents being skipped (already scanned)
 */
function handleDocumentsSkipped(data) {
  // eslint-disable-next-line no-console
  console.log('Documents skipped:', data);

  if (data.reason === 'already_scanned') {
    showToast(`Skipped ${data.documents.length} already scanned documents`, 'info');
  }
}

window.insertAsset = insertAsset;


/**
 * Show scan progress UI
 */
function showScanProgress() {
  const progressContainer = document.getElementById('scan-progress');
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }
}

/**
 * Hide scan progress UI
 */
function hideScanProgress() {
  const progressContainer = document.getElementById('scan-progress');
  if (progressContainer) {
    progressContainer.style.display = 'none';
  }
}

/**
 * Update asset count displays
 */
function updateAssetCounts() {
  const totalCount = document.getElementById('total-count');
  const displayedCount = document.getElementById('displayed-count');

  if (totalCount) {
    totalCount.textContent = assets.length;
  }

  if (displayedCount) {
    const visibleAssets = document.querySelectorAll('.asset-item:not([style*="display: none"])');
    displayedCount.textContent = visibleAssets.length;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!document.body.classList.contains('loaded')) {
      document.body.style.opacity = '1';
    }
  }, 100);

  init().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Initialization failed:', error);
    document.body.style.opacity = '1';
    document.body.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h3>DA Media Basic Failed to Initialize</h3>
        <p>Error: ${error.message}</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  });
});
