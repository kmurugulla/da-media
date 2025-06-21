/**
 * Queue Manager - Orchestrates between multi-threaded discovery and media scanning workers
 * Manages the queue-based scanning system for enterprise-scale sites with parallel folder discovery
 */

import { createMultiThreadedDiscoveryManager } from './multi-threaded-discovery-manager.js';
import { createStateManager } from '../services/state-manager.js';

function createQueueManager() {
  const state = {
    scanWorker: null,
    discoveryManager: null,
    stateManager: null,
    isActive: false,
    stats: {
      totalPages: 0,
      queuedPages: 0,
      scannedPages: 0,
      totalAssets: 0,
      errors: 0,
    },
    listeners: new Map(),
  };

  /**
   * Initialize queue manager with persistent state and multi-threaded discovery
   */
  async function init(apiConfig) {
    try {
      // Debug: Log what we received
      // eslint-disable-next-line no-console
      console.log('Queue Manager init called with:', {
        hasApiConfig: !!apiConfig,
        configKeys: apiConfig ? Object.keys(apiConfig) : [],
        hasToken: !!(apiConfig && apiConfig.token),
        hasOrg: !!(apiConfig && apiConfig.org),
        hasRepo: !!(apiConfig && apiConfig.repo),
        hasBaseUrl: !!(apiConfig && apiConfig.baseUrl),
      });

      // Initialize state manager
      // eslint-disable-next-line no-console
      console.log('Queue Manager: Initializing state manager...');
      state.stateManager = createStateManager();
      await state.stateManager.init(apiConfig);
      // eslint-disable-next-line no-console
      console.log('Queue Manager: State manager initialized successfully');

      // Initialize multi-threaded discovery manager
      // eslint-disable-next-line no-console
      console.log('Queue Manager: Initializing discovery manager...');
      state.discoveryManager = createMultiThreadedDiscoveryManager();
      await state.discoveryManager.init(apiConfig);
      setupDiscoveryManagerHandlers();
      // eslint-disable-next-line no-console
      console.log('Queue Manager: Discovery manager initialized successfully');

      // Initialize media scan worker
      // eslint-disable-next-line no-console
      console.log('Queue Manager: Initializing scan worker...');
      state.scanWorker = new Worker('./workers/media-scan-worker.js');
      setupScanWorkerHandlers();

      // Initialize scan worker
      await initializeWorker(state.scanWorker, 'scan', apiConfig);

      // Note: apiConfig is now passed during initialization above
      // eslint-disable-next-line no-console
      console.log('Queue Manager: Scan worker initialized successfully');

      // Queue Manager: Initialized with persistent state and multi-threaded discovery
      return true;

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Queue Manager initialization failed at step:', error.message, error.stack);
      // Queue Manager: Initialization failed
      cleanup();
      throw error;
    }
  }

  /**
   * Start the multi-threaded discovery and scanning system with persistence
   */
  async function startQueueScanning(forceRescan = false) {
    if (state.isActive) {
      // Queue Manager: Already active
      return;
    }

    // Check if another user is already scanning
    const isScanActive = await state.stateManager.isScanActive();
    if (isScanActive) {
      throw new Error('Scan already in progress by another user. Please wait for it to complete.');
    }

    try {
      // Acquire scan lock
      await state.stateManager.acquireScanLock(forceRescan ? 'force' : 'incremental');

      state.isActive = true;
      resetStats();

      // Check for resumable discovery queue
      if (!forceRescan) {
        const pendingQueue = await state.stateManager.loadDiscoveryQueue();
        if (pendingQueue.length > 0) {
          // Resume from saved queue
          emit('resumingFromQueue', { queueSize: pendingQueue.length });

          // Send pending documents to scan worker
          state.scanWorker.postMessage({
            type: 'processBatch',
            data: { pages: pendingQueue },
          });
        }
      }

      // Start multi-threaded discovery
      await state.discoveryManager.startDiscovery();

      // Start scan worker queue processing
      state.scanWorker.postMessage({
        type: 'startQueueProcessing',
      });

      emit('scanningStarted', { stats: state.stats, forceRescan });
      // Queue Manager: Started persistent multi-threaded discovery and scanning

    } catch (error) {
      state.isActive = false;
      throw error;
    }
  }

  /**
   * Stop the multi-threaded discovery and scanning system with state persistence
   */
  async function stopQueueScanning(saveState = true) {
    if (!state.isActive) {
      // Queue Manager: Not active
      return;
    }

    state.isActive = false;

    // Stop discovery manager
    if (state.discoveryManager) {
      await state.discoveryManager.stopDiscovery();
    }

    // Stop scan worker
    if (state.scanWorker) {
      state.scanWorker.postMessage({ type: 'stopQueueProcessing' });
    }

    // Save state and release lock
    if (state.stateManager) {
      if (saveState) {
        // Save current progress for resumption
        await state.stateManager.updateScanProgress({
          totalDocuments: state.stats.totalPages,
          scannedDocuments: state.stats.scannedPages,
          totalAssets: state.stats.totalAssets,
        });
      } else {
        // Clear queue if scan completed successfully
        await state.stateManager.clearDiscoveryQueue();
      }

      await state.stateManager.releaseScanLock();
    }

    emit('scanningStopped', { stats: state.stats, saveState });
    // Queue Manager: Stopped persistent multi-threaded discovery and scanning
  }

  /**
   * Get current queue statistics
   */
  function getStats() {
    return { ...state.stats };
  }

  /**
   * Get persistent scan statistics
   */
  async function getPersistentStats() {
    if (!state.stateManager) {
      return getStats();
    }

    try {
      const persistentStats = await state.stateManager.getScanStatistics();
      const currentState = await state.stateManager.getScanState();

      return {
        ...state.stats,
        ...persistentStats,
        isActive: currentState.isActive,
        currentSession: currentState.sessionId === state.stateManager.sessionId,
        lastScanTime: persistentStats.lastScanTime,
      };
    } catch (error) {
      return getStats();
    }
  }

  /**
   * Check if scan is currently active
   */
  async function isScanActive() {
    if (!state.stateManager) {
      return state.isActive;
    }

    try {
      return await state.stateManager.isScanActive();
    } catch (error) {
      return state.isActive;
    }
  }

  /**
   * Force complete scan (clear all state)
   */
  async function forceCompleteScan() {
    if (!state.stateManager) {
      return;
    }

    try {
      await state.stateManager.clearDiscoveryQueue();
      await state.stateManager.releaseScanLock();
      // Queue Manager: Forced scan completion
    } catch (error) {
      // Queue Manager: Error forcing scan completion
    }
  }


  /**
   * Setup scan worker message handlers
   */
  function setupScanWorkerHandlers() {
    state.scanWorker.onmessage = (event) => {
      const { type, data } = event.data;

      switch (type) {
        case 'initialized':
          // Queue Manager: Scan worker initialized
          break;

        case 'queueProcessingStarted':
          // Queue Manager: Queue processing started
          emit('queueProcessingStarted', data);
          break;

        case 'requestBatch':
          // No batch requests needed - documents come from discovery manager
          break;

        case 'pageScanned':
          state.stats.totalAssets += data.assetCount;
          state.stats.queuedPages = Math.max(0, state.stats.queuedPages - 1);
          state.stats.scannedPages++;

          // Save scan results persistently
          if (state.stateManager && data.assets) {
            state.stateManager.saveDocumentResults([{
              path: data.path,
              assets: data.assets,
              checksum: data.checksum,
              scanDuration: data.scanDuration,
            }]);

            // Update scan progress
            state.stateManager.updateScanProgress({
              scannedDocuments: state.stats.scannedPages,
              totalAssets: state.stats.totalAssets,
            });
          }

          // Queue Manager: Page scanned and saved
          emit('pageScanned', { ...data, stats: state.stats });
          break;

        case 'markPageScanned':
          // Page already marked as scanned in stats above
          break;

        case 'batchComplete':
          // Queue Manager: Batch complete
          emit('batchComplete', { ...data, stats: state.stats });
          break;

        case 'pageScanError':
          state.stats.errors++;
          // Queue Manager: Page scan error
          emit('pageScanError', data);
          break;

        case 'queueProcessingStopped':
          // Queue Manager: Queue processing stopped
          emit('queueProcessingStopped', data);
          break;

        case 'error':
          state.stats.errors++;
          // Queue Manager: Scan worker error
          emit('workerError', { worker: 'scan', ...data });
          break;

        default:
          // Queue Manager: Unknown scan worker message
      }
    };

    state.scanWorker.onerror = (error) => {
      state.stats.errors++;
      // Queue Manager: Scan worker error
      emit('workerError', { worker: 'scan', error: error.message });
    };
  }

  /**
   * Setup discovery manager event handlers
   */
  function setupDiscoveryManagerHandlers() {
    state.discoveryManager.on('discoveryStarted', (data) => {
      // Queue Manager: Multi-threaded discovery started
      emit('discoveryStarted', data);
    });

    state.discoveryManager.on('folderProgress', (data) => {
      // Queue Manager: Folder discovery progress
      emit('folderProgress', data);
    });

    state.discoveryManager.on('folderComplete', (data) => {
      // Queue Manager: Folder discovery complete
      emit('folderComplete', data);
    });

    state.discoveryManager.on('documentsDiscovered', async (data) => {
      // Add discovered documents to scan queue with persistence
      if (data.documents && data.documents.length > 0) {
        try {
          // Filter documents that need scanning
          const documentsToScan = await state.stateManager.getDocumentsToScan(data.documents);

          if (documentsToScan.length > 0) {
            state.stats.totalPages += documentsToScan.length;
            state.stats.queuedPages += documentsToScan.length;

            // Save to discovery queue for resumption
            await state.stateManager.saveDiscoveryQueue(documentsToScan);

            // Send documents to scan worker for processing
            state.scanWorker.postMessage({
              type: 'processBatch',
              data: { pages: documentsToScan },
            });

            // Update scan progress
            await state.stateManager.updateScanProgress({
              totalDocuments: state.stats.totalPages,
            });

            emit('documentsDiscovered', {
              ...data,
              documentsToScan: documentsToScan.length,
              documentsSkipped: data.documents.length - documentsToScan.length,
              stats: state.stats,
            });
          } else {
            emit('documentsSkipped', {
              ...data,
              reason: 'already_scanned',
              stats: state.stats,
            });
          }
        } catch (error) {
          // Queue Manager: Error processing discovered documents
          emit('documentsError', { ...data, error: error.message });
        }
      }
    });

    state.discoveryManager.on('discoveryComplete', (data) => {
      state.stats.totalPages = data.totalDocuments;
      // Queue Manager: Multi-threaded discovery complete
      emit('discoveryComplete', { ...data, stats: state.stats });
    });

    state.discoveryManager.on('discoveryError', (data) => {
      state.stats.errors++;
      // Queue Manager: Discovery error
      emit('discoveryError', data);
    });

    state.discoveryManager.on('folderError', (data) => {
      state.stats.errors++;
      // Queue Manager: Folder discovery error
      emit('folderError', data);
    });
  }

  /**
   * Initialize a worker and wait for confirmation
   */
  async function initializeWorker(worker, workerType, apiConfig) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${workerType} worker initialization timeout`));
      }, 10000);

      const handleMessage = (event) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          worker.removeEventListener('message', handleMessage);
          resolve();
        }
      };

      worker.addEventListener('message', handleMessage);
      worker.postMessage({ type: 'init', data: { apiConfig } });
    });
  }

  /**
   * Reset statistics
   */
  function resetStats() {
    state.stats = {
      totalPages: 0,
      queuedPages: 0,
      scannedPages: 0,
      totalAssets: 0,
      errors: 0,
    };
  }

  /**
   * Add event listener
   */
  function on(event, callback) {
    if (!state.listeners.has(event)) {
      state.listeners.set(event, []);
    }
    state.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  function off(event, callback) {
    const callbacks = state.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  function emit(event, data) {
    const callbacks = state.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          // Queue Manager: Error in event listener
        }
      });
    }
  }

  /**
   * Get queue size (estimated from current stats)
   */
  async function getQueueSize() {
    return state.stats.queuedPages;
  }

  /**
   * Cleanup resources
   */
  function cleanup() {
    if (state.discoveryManager) {
      state.discoveryManager.stopDiscovery();
      state.discoveryManager = null;
    }

    if (state.scanWorker) {
      state.scanWorker.terminate();
      state.scanWorker = null;
    }

    if (state.stateManager) {
      state.stateManager.cleanup();
      state.stateManager = null;
    }

    state.isActive = false;
    state.listeners.clear();
    // Queue Manager: Cleanup complete
  }

  return {
    init,
    startQueueScanning,
    stopQueueScanning,
    getStats,
    getPersistentStats,
    isScanActive,
    forceCompleteScan,
    on,
    off,
    getQueueSize,
    cleanup,
    // Expose state manager for debugging
    get stateManager() { return state.stateManager; },
  };
}

export { createQueueManager };
