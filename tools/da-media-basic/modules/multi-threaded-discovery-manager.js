/**
 * Multi-Threaded Discovery Manager
 * Coordinates parallel folder discovery workers for optimal document discovery performance
 */

function createMultiThreadedDiscoveryManager() {
  const state = {
    apiConfig: null,
    folderWorkers: new Map(),
    isRunning: false,
    maxWorkers: navigator.hardwareConcurrency || 4,
    stats: {
      totalFolders: 0,
      completedFolders: 0,
      totalDocuments: 0,
      errors: 0,
    },
    listeners: new Map(),
  };

  /**
   * Initialize multi-threaded discovery manager
   */
  async function init(apiConfig) {
    state.apiConfig = apiConfig;
    // Multi-Threaded Discovery Manager: Initialized
  }

  /**
   * Start multi-threaded document discovery
   */
  async function startDiscovery() {
    if (state.isRunning) {
      // Multi-Threaded Discovery Manager: Already running
      return;
    }

    state.isRunning = true;
    resetStats();

    try {
      // Get top-level folders and files
      const { folders, files } = await getTopLevelItems();

      // Total folders to process (including root for files)
      const totalFolders = folders.length + (files.length > 0 ? 1 : 0);

      state.stats.totalFolders = totalFolders;
      emit('discoveryStarted', {
        totalFolders,
        maxWorkers: state.maxWorkers,
      });

      // Process root files first if any
      if (files.length > 0) {
        await processRootFiles(files);
      }

      // Process subfolders in parallel
      if (folders.length > 0) {
        await processFoldersInParallel(folders);
      }

      // Discovery complete
      emit('discoveryComplete', {
        stats: state.stats,
        totalDocuments: state.stats.totalDocuments,
      });

    } catch (error) {
      // Multi-Threaded Discovery Manager: Discovery failed
      emit('discoveryError', { error: error.message });
    }
  }

  /**
   * Process folders in parallel using worker pool
   */
  async function processFoldersInParallel(folders) {
    const folderBatches = createBatches(folders, state.maxWorkers);

    for (const batch of folderBatches) {
      const workerPromises = batch.map((folder) => processFolder(folder));
      await Promise.all(workerPromises);
    }
  }

  /**
   * Process a single folder with dedicated worker
   */
  async function processFolder(folder) {
    return new Promise((resolve, reject) => {
      const workerId = `worker_${folder.path.replace(/[/\\]/g, '_')}`;
      const worker = new Worker('./workers/folder-discovery-worker.js');

      state.folderWorkers.set(workerId, {
        worker,
        folder,
        startTime: Date.now(),
      });

      // Setup worker event handlers
      worker.onmessage = (event) => {
        const { type, data } = event.data;

        switch (type) {
          case 'initialized':
            // Start folder discovery
            worker.postMessage({
              type: 'discoverFolder',
              data: { folderPath: folder.path },
            });
            break;

          case 'folderProgress':
            emit('folderProgress', {
              ...data,
              workerId,
              totalFolders: state.stats.totalFolders,
              completedFolders: state.stats.completedFolders,
            });
            break;

          case 'folderDiscoveryComplete':
            state.stats.completedFolders++;
            state.stats.totalDocuments += data.documentCount;

            emit('folderComplete', {
              ...data,
              workerId,
              stats: state.stats,
            });

            // Add documents to queue for scanning
            if (data.documents.length > 0) {
              emit('documentsDiscovered', {
                documents: data.documents,
                folder: folder.path,
              });
            }

            cleanup(workerId);
            resolve(data);
            break;

          case 'folderDiscoveryError':
            state.stats.errors++;
            state.stats.completedFolders++;

            emit('folderError', {
              ...data,
              workerId,
              stats: state.stats,
            });

            cleanup(workerId);
            reject(new Error(data.error));
            break;

          case 'folderScanError':
            // Non-fatal error - continue processing
            emit('folderScanError', data);
            break;

          case 'error':
            state.stats.errors++;
            cleanup(workerId);
            reject(new Error(data.error));
            break;
        }
      };

      worker.onerror = (error) => {
        state.stats.errors++;
        // Multi-Threaded Discovery Manager: Worker error
        cleanup(workerId);
        reject(error);
      };

      // Initialize worker
      worker.postMessage({
        type: 'init',
        data: { apiConfig: state.apiConfig },
      });
    });
  }


  /**
   * Get top-level folders and HTML files for processing
   */
  async function getTopLevelItems() {
    try {
      const url = `${state.apiConfig.baseUrl}/list/${state.apiConfig.org}/${state.apiConfig.repo}/`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || [];

      // Separate folders and HTML files
      const folders = items
        .filter((item) => !item.ext)
        .map((item) => ({
          name: item.name,
          path: item.path,
        }));

      const files = items
        .filter((item) => item.ext === 'html')
        .map((item) => ({
          name: item.name,
          path: item.path,
          ext: item.ext,
        }));

      return { folders, files };

    } catch (error) {
      // Multi-Threaded Discovery Manager: Failed to get top-level items
      return { folders: [], files: [] };
    }
  }

  /**
   * Process HTML files in the root directory
   */
  async function processRootFiles(files) {
    state.stats.completedFolders++;
    state.stats.totalDocuments += files.length;

    // Emit documents discovered for root files
    emit('documentsDiscovered', {
      documents: files,
      folder: '/',
    });

    emit('folderComplete', {
      documentCount: files.length,
      documents: files,
      workerId: 'root',
      stats: state.stats,
    });
  }

  /**
   * Stop all discovery workers
   */
  async function stopDiscovery() {
    if (!state.isRunning) {
      return;
    }

    state.isRunning = false;

    // Stop all active workers
    for (const [workerId, workerInfo] of state.folderWorkers) {
      workerInfo.worker.postMessage({ type: 'stopDiscovery' });
      cleanup(workerId);
    }

    emit('discoveryStopped', { stats: state.stats });
    // Multi-Threaded Discovery Manager: Stopped
  }

  /**
   * Cleanup worker resources
   */
  function cleanup(workerId) {
    const workerInfo = state.folderWorkers.get(workerId);
    if (workerInfo) {
      workerInfo.worker.terminate();
      state.folderWorkers.delete(workerId);
    }
  }

  /**
   * Reset statistics
   */
  function resetStats() {
    state.stats = {
      totalFolders: 0,
      completedFolders: 0,
      totalDocuments: 0,
      errors: 0,
    };
  }

  /**
   * Get current statistics
   */
  function getStats() {
    return { ...state.stats };
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
          // Multi-Threaded Discovery Manager: Error in event listener
        }
      });
    }
  }

  /**
   * Utility functions
   */
  function createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }


  return {
    init,
    startDiscovery,
    stopDiscovery,
    getStats,
    on,
    off,
  };
}

export { createMultiThreadedDiscoveryManager };
