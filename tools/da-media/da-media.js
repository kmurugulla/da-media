/**
 * DA Media Library - Modular Version
 * Clean, focused main file that orchestrates specialized modules
 */

// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { AssetLoader } from './modules/asset-loader.js';
import { AssetRenderer } from './modules/asset-renderer.js';
import { SearchManager } from './modules/search.js';
import { AssetInsertion } from './modules/asset-insertion.js';
import { Utils } from './modules/utils.js';
import { getApiEndpoint } from './modules/config.js';
import { getDocumentSpecificAssets, filterAssetsByDocumentUsage, updateDocumentUsageCounts } from './modules/document-usage.js';

/**
 * DA Media Library Main Application
 */
class DAMediaLibrary {
  constructor() {
    this.assets = [];
    this.filteredAssets = [];
    this.currentView = 'grid';
    this.currentFolder = 'all';
    this.isLoading = false;

    this.assetLoader = new AssetLoader(getApiEndpoint());
    this.assetRenderer = new AssetRenderer();
    this.assetInsertion = new AssetInsertion();
    this.searchManager = new SearchManager();

    this.containers = {
      assetsContainer: null,
      folderTree: null,
      documentInfo: null,
      searchInput: null,
    };
  }

  /**
   * Initialize the media library
   */
  async init() {
    // Get context and actions from DA SDK
    try {
      const { context, actions } = await DA_SDK;
      this.context = context;
      this.actions = actions;

      // Store context in localStorage for other modules to use
      if (context?.org && context?.repo) {
        localStorage.setItem('da_media_context', JSON.stringify({
          org: context.org,
          repo: context.repo,
        }));
      }
    } catch (error) {
      console.warn('DA SDK not available, using fallback context');
      this.context = null;
      this.actions = null;
    }

    this.initializeContainers();
    this.initializeEventListeners();

    // Initialize asset insertion with DA SDK actions
    this.assetInsertion.init(this.actions);

    // Initialize asset renderer with asset insertion
    this.assetRenderer.init(this.assetInsertion);

    this.searchManager.init(this.handleSearch.bind(this));

    await this.loadAssets();
    this.renderInitialState();
  }

  /**
   * Initialize DOM containers
   */
  initializeContainers() {
    this.containers = {
      assetsContainer: document.getElementById('assetsContainer'),
      assetsGrid: document.getElementById('assetsGrid'),
      folderTree: document.getElementById('folderTree'),
      searchInput: document.getElementById('nlpSearch'),
    };

    const missingContainers = Object.entries(this.containers)
      .filter(([, element]) => !element)
      .map(([name]) => name);

    if (missingContainers.length > 0) {
      // Missing DOM elements
    }
  }

  /**
   * Initialize event listeners
   */
  initializeEventListeners() {
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');

    if (gridViewBtn) {
      gridViewBtn.addEventListener('click', () => this.setView('grid'));
    }

    if (listViewBtn) {
      listViewBtn.addEventListener('click', () => this.setView('list'));
    }

    if (this.containers.searchInput) {
      this.containers.searchInput.addEventListener('input', this.handleSearch.bind(this));
    }

    // Add event listeners for all sidebar filters (both sections)
    const allFolderTrees = document.querySelectorAll('.folder-tree');
    allFolderTrees.forEach((folderTree) => {
      folderTree.addEventListener('click', (e) => {
        const folderItem = e.target.closest('.folder-item');
        if (folderItem) {
          const filter = folderItem.dataset.filter;
          if (filter) {
            this.setFolder(filter);
            // Update active state across all folder trees
            allFolderTrees.forEach((tree) => {
              tree.querySelectorAll('.folder-item').forEach((item) => {
                item.classList.remove('active');
              });
            });
            folderItem.classList.add('active');
          }
        }
      });
    });
  }

  /**
   * Load assets from data source
   */
  async loadAssets() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.showLoadingState();

    try {
      this.assets = await this.assetLoader.loadAllAssets();
      this.filteredAssets = [...this.assets];

      this.searchManager.updateAssets(this.assets);
      this.updateFolderTree();
    } catch (error) {
      this.showErrorState(error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Render initial application state
   */
  renderInitialState() {
    this.renderAssets();
    this.updateFolderTree();
  }

  /**
   * Handle search input
   */
  handleSearch() {
    const query = this.containers.searchInput?.value || '';
    this.filteredAssets = this.searchManager.performSearch(query);
    this.renderAssets();
    this.updateFolderTree();
  }

  /**
   * Set view mode (grid or list)
   */
  setView(view) {
    this.currentView = view;

    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');

    if (gridBtn && listBtn) {
      gridBtn.classList.toggle('active', view === 'grid');
      listBtn.classList.toggle('active', view === 'list');
    }

    this.renderAssets();
  }

  /**
   * Set current folder filter
   */
  setFolder(folder) {
    this.currentFolder = folder;

    if (folder === 'all') {
      this.filteredAssets = [...this.assets];
    } else if (folder === 'internal') {
      // Filter for internal assets (non-external)
      this.filteredAssets = this.assets.filter((asset) => !asset.isExternal);
    } else if (folder === 'external') {
      // Filter for external assets
      this.filteredAssets = this.assets.filter((asset) => asset.isExternal);
    } else if (folder === 'image' || folder === 'video' || folder === 'document') {
      // Filter by asset type
      this.filteredAssets = this.assets.filter((asset) => asset.type === folder);
    } else if (folder === 'used-on-page' || folder === 'used-internal' || folder === 'used-external') {
      this.filteredAssets = filterAssetsByDocumentUsage(this.assets, this.context, folder);
    } else {
      // Filter by category
      this.filteredAssets = this.assets.filter((asset) => asset.category === folder);
    }

    this.updateFolderTreeSelection();
    this.renderAssets();
  }

  /**
   * Render assets in current view
   */
  renderAssets() {
    if (!this.containers.assetsGrid) return;

    const isListView = this.currentView === 'list';
    this.assetRenderer.renderAssets(this.filteredAssets, this.containers.assetsGrid, isListView);
  }

  /**
   * Update folder tree navigation
   */
  updateFolderTree() {
    if (!this.containers.folderTree) return;

    // Update counts for static filters
    const allCount = this.assets.length;
    const internalCount = this.assets.filter((asset) => !asset.isExternal).length;
    const externalCount = this.assets.filter((asset) => asset.isExternal).length;
    const imageCount = this.assets.filter((asset) => asset.type === 'image').length;
    const videoCount = this.assets.filter((asset) => asset.type === 'video').length;
    const documentCount = this.assets.filter((asset) => asset.type === 'document').length;

    // Update counts for document-specific filters
    const documentCounts = updateDocumentUsageCounts(this.assets, this.context);

    // Update counts in existing HTML elements
    const totalCountEl = document.getElementById('totalCount');
    const internalCountEl = document.getElementById('internalCount');
    const externalCountEl = document.getElementById('externalCount');
    const imageCountEl = document.getElementById('imageCount');
    const videoCountEl = document.getElementById('videoCount');
    const documentCountEl = document.getElementById('documentCount');

    if (totalCountEl) totalCountEl.textContent = allCount;
    if (internalCountEl) internalCountEl.textContent = internalCount;
    if (externalCountEl) externalCountEl.textContent = externalCount;
    if (imageCountEl) imageCountEl.textContent = imageCount;
    if (videoCountEl) videoCountEl.textContent = videoCount;
    if (documentCountEl) documentCountEl.textContent = documentCount;
  }

  /**
   * Update folder tree selection
   */
  updateFolderTreeSelection() {
    if (!this.containers.folderTree) return;

    this.containers.folderTree.querySelectorAll('.folder-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.filter === this.currentFolder);
    });
  }


  /**
   * Get asset categories with counts
   */
  getAssetCategories() {
    const categoryMap = new Map();

    this.filteredAssets.forEach((asset) => {
      const category = asset.category || 'uncategorized';
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });

    return Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get icon for category
   */
  getCategoryIcon(category) {
    const iconMap = {
      hero: '🎯',
      gallery: '🖼️',
      internal: '🏠',
      navigation: '🧭',
      external: '🌐',
      team: '👥',
      product: '📦',
      uncategorized: '📁',
    };
    return iconMap[category] || '📁';
  }

  /**
   * Format category name for display
   */
  formatCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/[-_]/g, ' ');
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    if (this.containers.assetsGrid) {
      this.assetRenderer.showLoadingState(this.containers.assetsGrid);
    }
  }

  /**
   * Show error state
   */
  showErrorState(error) {
    if (this.containers.assetsGrid) {
      this.containers.assetsGrid.innerHTML = `
        <div class="error-state">
          <h3>Failed to load assets</h3>
          <p>${error.message}</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

// Initialize when DOM is ready
(async function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      window.daMediaLibrary = new DAMediaLibrary();
      await window.daMediaLibrary.init();
    });
  } else {
    window.daMediaLibrary = new DAMediaLibrary();
    await window.daMediaLibrary.init();
  }
}());
