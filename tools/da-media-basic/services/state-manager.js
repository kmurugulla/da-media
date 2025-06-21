/**
 * State Manager - Persistent storage and multi-user coordination
 * Manages scan state, results, and coordination in .da folder
 */

function createStateManager() {
  const state = {
    apiConfig: null,
    sessionId: null,
    lockTimeout: 300000, // 5 minutes
    heartbeatInterval: 30000, // 30 seconds
    heartbeatTimer: null,
  };

  /**
   * Initialize state manager
   */
  async function init(apiConfig) {
    state.apiConfig = apiConfig;
    state.sessionId = generateSessionId();
    await ensureStorageStructure();

    // Trigger preview actions to convert sheets to JSON format
    // This is essential for DA to recognize them as proper sheets
    await triggerSheetPreviews();
  }

  /**
   * Check if scan is currently active by another user
   */
  async function isScanActive() {
    try {
      const scanState = await loadScanState();

      if (!scanState.isActive) {
        return false;
      }

      // Check if lock has expired
      const now = Date.now();
      const lockAge = now - scanState.lastHeartbeat;

      if (lockAge > state.lockTimeout) {
        // Lock expired - clear it
        await clearScanLock();
        return false;
      }

      // Check if it's our own session
      return scanState.sessionId !== state.sessionId;

    } catch (error) {
      // State Manager: Error checking scan state
      return false;
    }
  }

  /**
   * Acquire scan lock for this session
   */
  async function acquireScanLock(scanType = 'full') {
    const isActive = await isScanActive();

    if (isActive) {
      throw new Error('Scan already in progress by another user');
    }

    const scanState = {
      isActive: true,
      sessionId: state.sessionId,
      scanType,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      progress: {
        totalFolders: 0,
        completedFolders: 0,
        totalDocuments: 0,
        scannedDocuments: 0,
        totalAssets: 0,
      },
    };

    await saveScanState(scanState);
    startHeartbeat();
    // State Manager: Scan lock acquired
  }

  /**
   * Release scan lock
   */
  async function releaseScanLock() {
    await clearScanLock();
    stopHeartbeat();
    // State Manager: Scan lock released
  }

  /**
   * Update scan progress
   */
  async function updateScanProgress(progress) {
    try {
      const scanState = await loadScanState();

      if (scanState.sessionId !== state.sessionId) {
        // eslint-disable-next-line no-console
        console.warn('Cannot update progress - not lock owner', {
          currentSession: state.sessionId,
          lockSession: scanState.sessionId,
        });
        return;
      }

      scanState.progress = { ...scanState.progress, ...progress };
      scanState.lastHeartbeat = Date.now();

      // eslint-disable-next-line no-console
      console.log('Updating scan progress:', {
        progress: scanState.progress,
        sessionId: scanState.sessionId,
      });

      await saveScanState(scanState);

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('State Manager: Error updating progress:', error);
    }
  }

  /**
   * Get current scan state
   */
  async function getScanState() {
    return loadScanState();
  }

  /**
   * Save document scan results
   */
  async function saveDocumentResults(documents) {
    try {
      const now = Date.now();
      const newDocuments = {};

      documents.forEach((doc) => {
        newDocuments[doc.path] = {
          path: doc.path,
          lastScanned: now,
          assetCount: doc.assets ? doc.assets.length : 0,
          assets: doc.assets || [],
          checksum: doc.checksum || null,
          scanDuration: doc.scanDuration || 0,
        };
      });

      const resultsUpdate = {
        documents: newDocuments,
        lastUpdated: now,
      };

      // Save internal scan results
      await saveScanResults(resultsUpdate);

    } catch (error) {
      // State Manager: Error saving document results
    }
  }

  /**
   * Get documents that need scanning
   */
  async function getDocumentsToScan(discoveredDocuments, forceRescan = false) {
    if (forceRescan) {
      return discoveredDocuments;
    }

    try {
      const results = await loadScanResults();
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

      return discoveredDocuments.filter((doc) => {
        const existing = results.documents[doc.path];

        if (!existing) {
          return true; // Never scanned
        }

        // Rescan if older than cutoff or document modified
        return existing.lastScanned < cutoffTime
               || doc.lastModified > existing.lastScanned;
      });

    } catch (error) {
      // State Manager: Error filtering documents
      return discoveredDocuments;
    }
  }

  /**
   * Save discovery queue for resumption
   */
  async function saveDiscoveryQueue(queue) {
    // eslint-disable-next-line no-console
    console.log('Processing discovery queue:', {
      queueLength: queue.length,
      sampleQueueItem: queue[0],
      sessionId: state.sessionId,
    });

    // DA sheet format matching your working example structure
    const daFormat = {
      ':names': ['queue', 'metadata'],
      ':type': 'multi-sheet',
      'queue': {
        'data': [],
      },
      'metadata': {
        'data': [],
      },
    };

    // eslint-disable-next-line no-console
    console.log('Saving discovery queue with correct DA format:', {
      queueRows: daFormat.queue.data.length,
      metadataRows: daFormat.metadata.data.length,
    });

    return saveToFile(`/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-discovery-queue.json`, daFormat);
  }

  /**
   * Load discovery queue for resumption
   */
  async function loadDiscoveryQueue() {
    try {
      const { baseUrl, org, repo } = state.apiConfig;
      const url = `${baseUrl}/source/${org}/${repo}/.da/media-discovery-queue.json`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      if (response.status === 404) {
        return { queue: [], lastUpdated: null, sessionId: null };
      }

      if (!response.ok) {
        throw new Error(`Failed to load discovery queue: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      return { queue: [], lastUpdated: null, sessionId: null };
    }
  }

  /**
   * Clear discovery queue
   */
  async function clearDiscoveryQueue() {
    try {
      await saveToFile(`/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-discovery-queue.json`, {
        queue: [],
        lastUpdated: Date.now(),
        sessionId: state.sessionId,
      });

    } catch (error) {
      // State Manager: Error clearing discovery queue
    }
  }

  /**
   * Get scan statistics
   */
  async function getScanStatistics() {
    try {
      const results = await loadScanResults();
      const documents = Object.values(results.documents);

      return {
        totalDocuments: documents.length,
        totalAssets: documents.reduce((sum, doc) => sum + doc.assetCount, 0),
        lastScanTime: results.lastUpdated,
        oldestScan: documents.length > 0
          ? Math.min(...documents.map((doc) => doc.lastScanned)) : null,
        newestScan: documents.length > 0
          ? Math.max(...documents.map((doc) => doc.lastScanned)) : null,
      };

    } catch (error) {
      return {
        totalDocuments: 0,
        totalAssets: 0,
        lastScanTime: null,
        oldestScan: null,
        newestScan: null,
      };
    }
  }

  /**
   * Private helper functions
   */
  async function ensureStorageStructure() {
    try {
      // Create .da folder if it doesn't exist
      const daFolderPath = `/${state.apiConfig.org}/${state.apiConfig.repo}/.da`;
      await createFolderIfNotExists(daFolderPath);

      // Create initial empty sheet files with proper DA structure
      await createInitialSheetFiles();

    } catch (error) {
      // State Manager: Error setting up storage structure
    }
  }

  /**
   * Create initial empty sheet files with proper DA sheet structure
   * Using your exact working structure format
   */
  async function createInitialSheetFiles() {
    const sheetConfigs = [
      // Test with your exact working structure first
      {
        path: `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/test-working-format.json`,
        structure: {
          ':names': ['permissions', 'options'],
          ':type': 'multi-sheet',
          'permissions': {
            'data': [{
              'path': '/**',
              'groups': '2345B0EA551D747/4711,123',
              'actions': 'read',
            },
            {
              'path': '/**',
              'groups': '2345B0EA551D747/8080',
              'actions': 'write',
            },
            {
              'path': '/foo',
              'groups': '2345B0EA551D747/4711',
              'actions': 'write',
            },
            {
              'path': '/bar',
              'groups': '2345B0EA551D747/4711',
              'actions': '',
            }],
          },
          'options': {
            'data': [{
              'path': '/**',
              'groups': '2345B0EA551D747/4711,123',
              'actions': 'read',
            },
            {
              'path': '/**',
              'groups': '2345B0EA551D747/8080',
              'actions': 'write',
            },
            {
              'path': '/foo',
              'groups': '2345B0EA551D747/4711',
              'actions': 'write',
            },
            {
              'path': '/bar',
              'groups': '2345B0EA551D747/4711',
              'actions': '',
            }],
          },
        },
      },

      {
        path: `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-state.json`,
        structure: {
          ':names': ['state', 'progress'],
          ':type': 'multi-sheet',
          'state': {
            'data': [{
              'property': 'isActive',
              'value': 'false',
              'type': 'boolean',
            },
            {
              'property': 'sessionId',
              'value': '',
              'type': 'string',
            },
            {
              'property': 'scanType',
              'value': '',
              'type': 'string',
            }],
          },
          'progress': {
            'data': [{
              'metric': 'totalFolders',
              'value': '0',
            },
            {
              'metric': 'completedFolders',
              'value': '0',
            },
            {
              'metric': 'totalDocuments',
              'value': '0',
            }],
          },
        },
      },

      {
        path: `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-results.json`,
        structure: {
          ':names': ['results', 'summary'],
          ':type': 'multi-sheet',
          'results': {
            'data': [{
              'path': '',
              'lastScanned': '',
              'assetCount': '0',
              'scanDuration': '0',
              'checksum': '',
            }],
          },
          'summary': {
            'data': [{
              'metric': 'totalDocuments',
              'value': '0',
              'lastUpdated': '',
            },
            {
              'metric': 'totalAssets',
              'value': '0',
              'lastUpdated': '',
            }],
          },
        },
      },

      {
        path: `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-discovery-queue.json`,
        structure: {
          ':names': ['queue', 'metadata'],
          ':type': 'multi-sheet',
          'queue': {
            'data': [{
              'path': '',
              'priority': 'normal',
              'addedTime': '',
              'status': 'pending',
            }],
          },
          'metadata': {
            'data': [{
              'property': 'lastUpdated',
              'value': '',
            },
            {
              'property': 'sessionId',
              'value': '',
            },
            {
              'property': 'queueSize',
              'value': '0',
            }],
          },
        },
      },
    ];

    // eslint-disable-next-line no-console
    console.log('Creating initial sheet files...');

    for (const config of sheetConfigs) {
      try {
        const exists = await fileExists(config.path);
        if (!exists) {
          // eslint-disable-next-line no-console
          console.log(`Creating initial sheet: ${config.path}`);

          // Create the file with proper sheet structure
          await createInitialSheetFile(config.path, config.structure);

          // Add a small delay to allow DA to process
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });

          // eslint-disable-next-line no-console
          console.log(`✅ Created: ${config.path}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`✅ Already exists: ${config.path}`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`❌ Failed to create ${config.path}:`, error.message);
      }
    }

    // eslint-disable-next-line no-console
    console.log('Initial sheet files setup complete');
  }

  /**
   * Create an initial sheet file with proper DA structure
   */
  async function createInitialSheetFile(filePath, structure) {
    // Use the exact same approach as saveToFile since that works perfectly
    const url = `${state.apiConfig.baseUrl}/source${filePath}`;

    try {
      // eslint-disable-next-line no-console
      console.log(`Creating initial sheet ${filePath}:`, {
        url,
        hasToken: !!state.apiConfig.token,
        sheetNames: Object.keys(structure).filter((key) => !key.startsWith(':')),
      });

      // Use the exact same FormData approach as saveToFile
      const body = new FormData();
      const jsonString = JSON.stringify(structure, null, 2);
      body.append('data', new Blob([jsonString], { type: 'application/json' }));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiConfig.token}`,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        // eslint-disable-next-line no-console
        console.error(`Failed to create initial sheet ${filePath}:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Failed to create initial sheet ${filePath}: ${response.status} ${response.statusText}`);
      }

      // eslint-disable-next-line no-console
      console.log(`✅ Initial sheet created successfully: ${filePath}`);

      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`❌ Error creating initial sheet ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Trigger preview actions to convert sheets to proper JSON format
   * This mimics what happens when you click "Preview" in DA
   * Based on DA Pilot Sling scheduler pattern
   */
  async function triggerSheetPreviews() {
    const sheetPaths = [
      '.da/media-scan-state.json',
      '.da/media-scan-results.json',
      '.da/media-discovery-queue.json',
    ];

    // eslint-disable-next-line no-console
    console.log('Triggering sheet previews to convert to JSON format...');

    for (const sheetPath of sheetPaths) {
      try {
        // Build source URL first
        const {
          baseUrl, org, repo, token,
        } = state.apiConfig;
        const sourceUrl = `${baseUrl}/source/${org}/${repo}/${sheetPath}`;

        // Convert to preview URL using the DA Pilot Sling pattern
        // Replace /source/ with preview URL and add main/ prefix to path
        const previewUrl = sourceUrl
          .replace(`${baseUrl}/source`, 'https://admin.hlx.page/preview')
          .replace(`/${org}/${repo}/${sheetPath}`, `/${org}/${repo}/main/${sheetPath}`);

        // eslint-disable-next-line no-console
        console.log(`Source URL: ${sourceUrl}`);
        // eslint-disable-next-line no-console
        console.log(`Preview URL: ${previewUrl}`);

        const response = await fetch(previewUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          // eslint-disable-next-line no-console
          console.log(`✅ Preview successful: ${sheetPath}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`⚠️ Preview failed: ${sheetPath} (${response.status})`);

          // Log response details for debugging
          const responseText = await response.text();
          // eslint-disable-next-line no-console
          console.log(`Response: ${responseText.substring(0, 200)}`);
        }

        // Small delay between files
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });

      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`❌ Preview error for ${sheetPath}:`, error.message);
      }
    }

    // eslint-disable-next-line no-console
    console.log('Sheet preview triggers complete');
  }

  /**
   * Check if files are showing as sheets in DA
   */
  async function verifySheetStructure() {
    const sheetPaths = [
      `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-state.json`,
      `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-results.json`,
      `/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-discovery-queue.json`,
    ];

    // eslint-disable-next-line no-console
    console.log('=== Verifying Sheet Structure ===');

    for (const sheetPath of sheetPaths) {
      try {
        const url = `${state.apiConfig.baseUrl}/source${sheetPath}`;

        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
        });

        if (response.ok) {
          const content = await response.text();
          // eslint-disable-next-line no-console
          console.log(`\n📄 File: ${sheetPath}`);
          // eslint-disable-next-line no-console
          console.log(`📏 Length: ${content.length}`);

          if (content.trim()) {
            try {
              const parsed = JSON.parse(content);
              // eslint-disable-next-line no-console
              console.log(`📊 Has :names: ${!!parsed[':names']}`);
              if (parsed[':names']) {
                // eslint-disable-next-line no-console
                console.log(`📋 Sheet names: ${parsed[':names'].join(', ')}`);
              }
              // eslint-disable-next-line no-console
              console.log(`🔑 Top-level keys: ${Object.keys(parsed).join(', ')}`);
            } catch (parseError) {
              // eslint-disable-next-line no-console
              console.log('❌ Not valid JSON');
              // eslint-disable-next-line no-console
              console.log(`📝 Raw content preview: ${content.substring(0, 100)}...`);
            }
          } else {
            // eslint-disable-next-line no-console
            console.log('❌ File is empty');
          }
        } else {
          // eslint-disable-next-line no-console
          console.log(`❌ File not found: ${sheetPath} (${response.status})`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`❌ Error checking ${sheetPath}:`, error.message);
      }
    }
  }

  async function loadScanState() {
    try {
      const { baseUrl, org, repo } = state.apiConfig;
      const url = `${baseUrl}/source/${org}/${repo}/.da/media-scan-state.json`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      if (response.status === 404) {
        return {
          isActive: false,
          sessionId: null,
          scanType: null,
          startTime: null,
          lastHeartbeat: null,
          progress: {
            totalFolders: 0,
            completedFolders: 0,
            totalDocuments: 0,
            scannedDocuments: 0,
            totalAssets: 0,
          },
        };
      }

      if (!response.ok) {
        throw new Error(`Failed to load scan state: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      return {
        isActive: false,
        sessionId: null,
        scanType: null,
        startTime: null,
        lastHeartbeat: null,
        progress: {
          totalFolders: 0,
          completedFolders: 0,
          totalDocuments: 0,
          scannedDocuments: 0,
          totalAssets: 0,
        },
      };
    }
  }

  async function saveScanState(scanState) {
    // DA sheet format matching your working example structure
    const daFormat = {
      ':names': ['state', 'progress'],
      ':type': 'multi-sheet',
      'state': {
        'data': [{
          'property': 'isActive',
          'value': scanState.isActive ? 'true' : 'false',
          'type': 'boolean',
        },
        {
          'property': 'sessionId',
          'value': scanState.sessionId || '',
          'type': 'string',
        },
        {
          'property': 'scanType',
          'value': scanState.scanType || '',
          'type': 'string',
        }],
      },
      'progress': {
        'data': [{
          'metric': 'totalFolders',
          'value': String(scanState.progress?.totalFolders || 0),
        },
        {
          'metric': 'completedFolders',
          'value': String(scanState.progress?.completedFolders || 0),
        },
        {
          'metric': 'totalDocuments',
          'value': String(scanState.progress?.totalDocuments || 0),
        }],
      },
    };

    // eslint-disable-next-line no-console
    console.log('Saving scan state with correct DA format:', {
      stateRows: daFormat.state.data.length,
      progressRows: daFormat.progress.data.length,
    });

    return saveToFile(`/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-state.json`, daFormat);
  }

  async function loadScanResults() {
    try {
      const { baseUrl, org, repo } = state.apiConfig;
      const url = `${baseUrl}/source/${org}/${repo}/.da/media-scan-results.json`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      if (response.status === 404) {
        return { documents: {}, totalDocuments: 0, lastUpdated: null };
      }

      if (!response.ok) {
        throw new Error(`Failed to load scan results: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      return { documents: {}, totalDocuments: 0, lastUpdated: null };
    }
  }

  async function saveScanResults(_results) {
    // DA sheet format matching your working example structure
    const daFormat = {
      ':names': ['results', 'summary'],
      ':type': 'multi-sheet',
      'results': {
        'data': [],
      },
      'summary': {
        'data': [],
      },
    };

    // eslint-disable-next-line no-console
    console.log('Saving scan results with correct DA format:', {
      resultsRows: daFormat.results.data.length,
      summaryRows: daFormat.summary.data.length,
    });

    return saveToFile(`/${state.apiConfig.org}/${state.apiConfig.repo}/.da/media-scan-results.json`, daFormat);
  }

  async function clearScanLock() {
    const scanState = await loadScanState();
    scanState.isActive = false;
    scanState.sessionId = null;
    scanState.lastHeartbeat = null;
    await saveScanState(scanState);
  }

  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(async () => {
      try {
        const scanState = await loadScanState();
        if (scanState.sessionId === state.sessionId) {
          scanState.lastHeartbeat = Date.now();
          await saveScanState(scanState);
        }
      } catch (error) {
        // State Manager: Heartbeat error
      }
    }, state.heartbeatInterval);
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  async function createFolderIfNotExists(folderPath) {
    try {
      // Use path as-is - it's the unique identifier
      const url = `${state.apiConfig.baseUrl}/source${folderPath}/.folder`;

      // Use HEAD request to check existence without showing 404 in console
      const checkResponse = await fetch(`${state.apiConfig.baseUrl}/source${folderPath}`, {
        method: 'HEAD',
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      if (checkResponse.status === 404) {
        // Folder doesn't exist, create it using POST with FormData
        const formData = new FormData();
        formData.append('data', '');

        const createResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.apiConfig.token}`,
          },
          body: formData,
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create folder: ${createResponse.status}`);
        }
      }
    } catch (error) {
      // State Manager: Error creating folder - this is expected on first run
    }
  }

  async function fileExists(filePath) {
    const url = `${state.apiConfig.baseUrl}/source${filePath}`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save content using DA sheet format - simplified approach
   */
  async function saveToFile(filePath, content) {
    const url = `${state.apiConfig.baseUrl}/source${filePath}`;

    try {
      // eslint-disable-next-line no-console
      console.log(`Saving to ${filePath}:`, {
        url,
        hasToken: !!state.apiConfig.token,
        sheetNames: Object.keys(content).filter((key) => !key.startsWith(':')),
      });

      // Use FormData approach with Blob (matching your working example)
      const body = new FormData();
      const jsonString = JSON.stringify(content, null, 2);
      body.append('data', new Blob([jsonString], { type: 'application/json' }));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiConfig.token}`,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        // eslint-disable-next-line no-console
        console.error(`Failed to save ${filePath}:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Failed to save ${filePath}: ${response.status} ${response.statusText}`);
      }

      // eslint-disable-next-line no-console
      console.log(`Successfully saved ${filePath}`);

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Error saving ${filePath}:`, error);
      throw error;
    }
  }


  function generateSessionId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup on page unload
   */
  function cleanup() {
    stopHeartbeat();
    // Note: We don't auto-release lock on cleanup to allow resumption
  }

  // Auto-cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', cleanup);
  }

  return {
    init,
    isScanActive,
    acquireScanLock,
    releaseScanLock,
    updateScanProgress,
    getScanState,
    saveDocumentResults,
    getDocumentsToScan,
    saveDiscoveryQueue,
    loadDiscoveryQueue,
    clearDiscoveryQueue,
    getScanStatistics,
    cleanup,
    triggerSheetPreviews,
    verifySheetStructure,
  };
}

export { createStateManager };
