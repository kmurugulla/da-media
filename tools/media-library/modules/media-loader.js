// tools/da-media-basi./modules/media-loader.js
// Asset loading and refresh logic for Media Library

import { fetchSheetJson, CONTENT_DA_LIVE_BASE } from './sheet-utils.js';
import { updateSidebarCounts } from './sidebar.js';

let daContext = null;
let assetBrowser = null;
let stateManager = null;
let assets = [];

function setContext(context) {
  daContext = context;
}

function setAssetBrowser(browser) {
  assetBrowser = browser;
}

function setStateManager(manager) {
  stateManager = manager;
}

function setAssetsRef(ref) {
  assets = ref;
}

function getContext() {
  return daContext;
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

/**
 * Load assets from media.json using DA API (content.da.live)
 */
async function loadAssetsFromMediaJson({ force = false } = {}) {
  try {
    let initialAssets = null;
    // Use DA API to fetch from content.da.live if stateManager is available
    if (stateManager && stateManager.state && stateManager.state.apiConfig) {
      const data = await fetchSheetJson(stateManager.state.apiConfig, 'media.json');
      if (data && data.data && data.data.length > 0) {
        initialAssets = data.data.map((asset) => ({
          ...asset,
          type: asset.type || 'image',
          name: asset.name || asset.alt
            || (asset.src ? asset.src.split('/').pop() : 'Untitled Asset') || 'Untitled Asset',
        }));
        // Process external assets to detect external links
        if (assetBrowser && assetBrowser.processExternalAssets) {
          const pageContext = {
            site: daContext?.site || 'main',
            org: daContext?.org || 'kmurugulla',
          };
          initialAssets = assetBrowser.processExternalAssets(initialAssets, pageContext);
        }

        // Update the main assets array
        assets.length = 0;
        assets.push(...initialAssets);

        // After loading assets, ensure index is present
        assets.forEach((asset, i) => {
          if (!asset.index) asset.index = i + 1;
        });
        assetBrowser?.setAssets(assets);
        updateSidebarCounts(assets, getCurrentPageUrl());
      }
      // If force is true, or a scan/POST happens, re-fetch and update
      if (force) {
        setTimeout(async () => {
          const updatedData = await fetchSheetJson(stateManager.state.apiConfig, 'media.json');
          if (updatedData && updatedData.data && updatedData.data.length > 0) {
            const updatedAssets = updatedData.data.map((asset) => ({
              ...asset,
              type: asset.type || 'image',
              name: asset.name || asset.alt
                || (asset.src ? asset.src.split('/').pop() : 'Untitled Asset') || 'Untitled Asset',
              isExternal: typeof asset.isExternal === 'boolean' ? asset.isExternal : false,
            }));
            if (assetBrowser && assetBrowser.processExternalAssets) {
              const pageContext = {
                site: daContext?.site || 'main',
                org: daContext?.org || 'kmurugulla',
              };
              assets.length = 0;
              assets.push(...assetBrowser.processExternalAssets(updatedAssets, pageContext));
            } else {
              assets.length = 0;
              assets.push(...updatedAssets);
            }
            assetBrowser?.setAssets(assets);
            updateSidebarCounts(assets, getCurrentPageUrl());
          }
        }, 1000);
      }
      return;
    }
    // Fallback: direct fetch if stateManager not available yet
    const remoteUrl = `${CONTENT_DA_LIVE_BASE}/kmurugulla/da-media/.da/media.json`;
    const response = await fetch(remoteUrl, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        initialAssets = data.data.map((asset) => ({
          ...asset,
          type: asset.type || 'image',
          name: asset.name || asset.alt
            || (asset.src ? asset.src.split('/').pop() : 'Untitled Asset') || 'Untitled Asset',
        }));
        if (assetBrowser && assetBrowser.processExternalAssets) {
          const pageContext = {
            site: 'main',
            org: 'kmurugulla',
          };
          initialAssets = assetBrowser.processExternalAssets(initialAssets, pageContext);
        }

        // Update the main assets array
        assets.length = 0;
        assets.push(...initialAssets);

        // After loading assets, ensure index is present
        assets.forEach((asset, i) => {
          if (!asset.index) asset.index = i + 1;
        });
        assetBrowser?.setAssets(assets);
        updateSidebarCounts(assets, getCurrentPageUrl());
      }
      // If force is true, or a scan/POST happens, re-fetch and update
      if (force) {
        setTimeout(async () => {
          const updatedResponse = await fetch(remoteUrl, { cache: 'no-store' });
          if (updatedResponse.ok) {
            const updatedData = await updatedResponse.json();
            if (updatedData && Array.isArray(updatedData.data) && updatedData.data.length > 0) {
              const updatedAssets = updatedData.data.map((asset) => ({
                ...asset,
                type: asset.type || 'image',
                name: asset.name || asset.alt
                  || (asset.src ? asset.src.split('/').pop() : 'Untitled Asset') || 'Untitled Asset',
                isExternal: typeof asset.isExternal === 'boolean' ? asset.isExternal : false,
              }));
              if (assetBrowser && assetBrowser.processExternalAssets) {
                const pageContext = {
                  site: 'main',
                  org: 'kmurugulla',
                };
                assets.length = 0;
                assets.push(...assetBrowser.processExternalAssets(updatedAssets, pageContext));
              } else {
                assets.length = 0;
                assets.push(...updatedAssets);
              }
              assetBrowser?.setAssets(assets);
              updateSidebarCounts(assets, getCurrentPageUrl());
            }
          }
        }, 1000);
      }
      return;
    }
    // No assets found
    assets.length = 0;
    assetBrowser?.setAssets(assets);
    updateSidebarCounts(assets, getCurrentPageUrl());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading assets:', error);
  }
}

export {
  loadAssetsFromMediaJson,
  setContext,
  setAssetBrowser,
  setStateManager,
  setAssetsRef,
  getContext,
};
