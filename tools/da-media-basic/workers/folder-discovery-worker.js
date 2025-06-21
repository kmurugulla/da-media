/**
 * Folder Discovery Worker - Discovers HTML documents within a specific folder
 * Enables multi-threaded parallel document discovery across folder structure
 */

const state = {
  apiConfig: null,
  folderPath: null,
  isRunning: false,
};

/**
 * Initialize folder discovery worker
 */
function init(config) {
  state.apiConfig = config;
  // Folder Discovery Worker: Initialized
}

/**
 * Start discovering documents in assigned folder
 */
async function discoverFolder(folderPath) {
  state.folderPath = folderPath;
  state.isRunning = true;

  try {
    // Folder Discovery Worker: Starting folder discovery
    const documents = await discoverDocumentsInFolder(folderPath);

    postMessage({
      type: 'folderDiscoveryComplete',
      data: {
        folderPath,
        documents,
        documentCount: documents.length,
      },
    });

    // Folder Discovery Worker: Folder discovery complete

  } catch (error) {
    // Folder Discovery Worker: Folder discovery failed
    postMessage({
      type: 'folderDiscoveryError',
      data: {
        folderPath,
        error: error.message,
      },
    });
  } finally {
    state.isRunning = false;
  }
}

/**
 * Recursively discover documents in folder and subfolders
 */
async function discoverDocumentsInFolder(folderPath) {
  const documents = [];
  const foldersToScan = [folderPath];

  while (foldersToScan.length > 0) {
    const currentFolder = foldersToScan.shift();

    try {
      const items = await listFolderContents(currentFolder);

      for (const item of items) {
        if (item.ext === 'html') {
          // HTML document found
          documents.push({
            path: item.path,
            name: item.name,
            lastModified: item.lastModified,
            folder: currentFolder,
          });
        } else if (!item.ext) {
          // Subfolder found - add to scan queue
          foldersToScan.push(item.path);
        }
      }

      // Report progress for large folders
      if (documents.length > 0 && documents.length % 50 === 0) {
        postMessage({
          type: 'folderProgress',
          data: {
            folderPath: state.folderPath,
            currentFolder,
            documentsFound: documents.length,
            foldersRemaining: foldersToScan.length,
          },
        });
      }

    } catch (error) {
      // Folder Discovery Worker: Failed to scan folder
      postMessage({
        type: 'folderScanError',
        data: {
          folderPath: currentFolder,
          error: error.message,
        },
      });
    }
  }

  return documents;
}

/**
 * List contents of a specific folder
 */
async function listFolderContents(folderPath) {
  // Use folderPath as-is since it already includes org/repo prefix
  const url = `${state.apiConfig.baseUrl}/list${folderPath}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${state.apiConfig.token}` },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data) ? data : data.items || [];

  return items.map((item) => ({
    name: item.name,
    path: item.path,
    ext: item.ext,
    lastModified: item.lastModified,
  }));
}

/**
 * Stop folder discovery
 */
function stopDiscovery() {
  state.isRunning = false;
  // Folder Discovery Worker: Stopped

  postMessage({
    type: 'folderDiscoveryStopped',
    data: { folderPath: state.folderPath },
  });
}


// Message handler
// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'init': {
        init(data.apiConfig);
        postMessage({ type: 'initialized' });
        break;
      }

      case 'discoverFolder': {
        await discoverFolder(data.folderPath);
        break;
      }

      case 'stopDiscovery': {
        stopDiscovery();
        break;
      }

      default: {
        // Folder Discovery Worker: Unknown message type
      }
    }
  } catch (error) {
    // Folder Discovery Worker: Error handling message
    postMessage({
      type: 'error',
      data: { error: error.message, originalType: type },
    });
  }
});
