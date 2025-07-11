// tools/media-library/modules/event-handlers.js
// Queue manager event handlers for Media Library

import { updateSidebarCounts } from './sidebar.js';
import { showEmptyState } from './empty-state.js';
import { showScanIndicator } from './scan-indicator.js';
import { saveMediaSheet, loadMediaSheet } from './media-processor.js';
import { getContext } from './media-loader.js';
import { CONTENT_DA_LIVE_BASE } from './sheet-utils.js';

/**
 * Handle discovery completion
 */
function handleDiscoveryComplete(data, updateLoadingText) {
  const { totalPages, discoveredPages } = data;
  const message = `Discovery complete: ${discoveredPages} pages found out of ${totalPages} total pages`;
  updateLoadingText(message);
}

/**
 * Handle page scanned event
 */
async function handlePageScanned(
  data,
  assets,
  assetBrowser,
  metadataManager,
  processScanResults,
  updateLoadingText,
  updateScanProgressHeader,
) {
  if (data.assets && data.assets.length > 0) {
    // 1. Load current media.json (flat sheet)
    let baseAssets = [];
    const apiConfig = metadataManager?.daApi?.getConfig?.() || null;
    if (apiConfig) {
      try {
        baseAssets = await loadMediaSheet(apiConfig);
      } catch (err) {
        baseAssets = [];
      }
    }
    // 2. Get new assets from this page
    const newAssets = processScanResults([{ assets: data.assets, file: { path: data.page } }]);

    // 3. Merge and deduplicate
    const allAssets = [...baseAssets, ...newAssets];
    const dedupedAssets = Array.from(new Map(allAssets.map((a) => [a.src, a])).values());

    // 4. Save back to media.json (flat sheet)
    if (apiConfig) {
      try {
        await saveMediaSheet(apiConfig, dedupedAssets);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DA] handlePageScanned: SAVE FAILED', err);
      }
    }
    // 6. Update UI
    assets.length = 0;
    assets.push(...dedupedAssets);
    assetBrowser.setAssets(assets);
    updateSidebarCounts(assets, getCurrentPageUrl());
  }
  // Update progress
  const stats = data.stats;
  if (stats) {
    updateLoadingText(
      `Scanned: ${stats.scannedPages}/${stats.totalPages} pages, Found: ${stats.totalAssets} assets`,
    );
    updateScanProgressHeader(stats.scannedPages, stats.totalPages);
  }
}

/**
 * Handle scanning started event
 */
function handleScanningStarted(
  data,
  isScanning,
  showScanProgress,
  updateLoadingText,
  updateScanProgressHeader,
) {
  isScanning = true;
  // Note: showScanProgress() is called in startFullScan(), so we don't call it here
  updateLoadingText('Queue-based scanning started...');
  if (data && data.stats) {
    updateScanProgressHeader(data.stats.scannedPages, data.stats.totalPages);
  }
}

/**
 * Handle scanning stopped event
 */
function handleScanningStopped(
  data,
  assets,
  isScanning,
  hideScanProgress,
) {
  isScanning = false;
  hideScanProgress();
  const stats = data.stats;
  if (stats) {
    const percent = stats.totalPages > 0 ? Math.round((stats.scannedPages / stats.totalPages) * 100) : 0;
    if (stats.totalAssets === 0 && assets.length === 0) {
      showEmptyState();
      showScanIndicator(100, 'complete');
    } else {
      // Hide loading, show grid
      const grid = document.getElementById('assetsGrid');
      if (grid) grid.style.display = '';
      showScanIndicator(percent, 'complete');
      // Do not hide the scan indicator after partial scan; leave it visible
    }
  }
}

/**
 * Handle queue size updates
 */
function handleQueueSizeUpdate(
  data,
  updateScanProgressHeader,
) {
  const stats = data.stats;
  if (stats && stats.totalPages > 0) {
    updateScanProgressHeader(stats.scannedPages, stats.totalPages);
  }
}

/**
 * Handle worker errors
 */
function handleWorkerError(data) {
  // eslint-disable-next-line no-console
  console.error('Worker error:', data);
  showScanIndicator(0, 'error');
}

/**
 * Handle resuming from saved queue
 */
function handleResumingFromQueue(
  data,
  updateLoadingText,
) {
  updateLoadingText(`Resuming scan from ${data.queueSize} pending documents...`);
}

/**
 * Handle documents being skipped (already scanned)
 */
function handleDocumentsSkipped(
  data,
) {
  if (data.reason === 'already_scanned') {
    // No action needed
  }
}

function getCurrentPageUrl() {
  const daContext = getContext && getContext();
  if (daContext?.org && daContext?.repo && daContext?.path) {
    let pagePath = daContext.path;
    if (!pagePath.endsWith('.html')) {
      pagePath += '.html';
    }
    return `${CONTENT_DA_LIVE_BASE}/${daContext.org}/${daContext.repo}${pagePath}`;
  }
  return null;
}

export {
  handleDiscoveryComplete,
  handlePageScanned,
  handleScanningStarted,
  handleScanningStopped,
  handleQueueSizeUpdate,
  handleWorkerError,
  handleResumingFromQueue,
  handleDocumentsSkipped,
};
