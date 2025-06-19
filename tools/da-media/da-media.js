/**
 * DA Media Library - Modular Version
 * Clean, focused main file that orchestrates specialized modules
 */

import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { AssetLoader } from './modules/asset-loader.js';
import { AssetRenderer } from './modules/asset-renderer.js';
import { SearchManager } from './modules/search.js';
import { AssetInsertion } from './modules/asset-insertion.js';
import { Utils } from './modules/utils.js';
import { getApiEndpoint } from './modules/config.js';


class DAMediaLibrary {
  constructor() {
    // Get the correct API endpoint
    const apiEndpoint = getApiEndpoint();
    
    // Initialize modules
    this.assetLoader = new AssetLoader(apiEndpoint);
    this.assetRenderer = new AssetRenderer();
    this.searchManager = new SearchManager();
    this.assetInsertion = new AssetInsertion();
    
    // State
    this.assets = [];
    this.filteredAssets = [];
    this.currentView = 'grid';
    this.currentFilter = 'all';
    
    // DOM elements
    this.assetsGrid = null;
    this.searchInput = null;
  }

  /**
   * Initialize the media library
   */
  async init() {
    try {
      // Initialize DA SDK and asset insertion
      await this.initializeDASDK();
      
      this.initializeDOM();
      this.setupEventHandlers();
      this.searchManager.init(() => this.handleSearch());
      
      // Connect asset renderer to asset insertion
      this.assetRenderer.init(this.assetInsertion);
      
      await this.loadAssets();
      this.updateUI();
    } catch (error) {
      console.error('Failed to initialize DA Media Library:', error);
      this.showError('Failed to initialize media library');
    }
  }

  /**
   * Initialize DA SDK for asset insertion
   */
  async initializeDASDK() {
    try {
      const { actions } = await DA_SDK;
      this.assetInsertion.init(actions);
    } catch (error) {
      // DA SDK not available - insertion will be disabled
    }
  }

  /**
   * Initialize DOM references
   */
  initializeDOM() {
    this.assetsGrid = document.getElementById('assetsGrid');
    this.searchInput = document.getElementById('nlpSearch');
    
    if (!this.assetsGrid) {
      throw new Error('Required DOM element #assetsGrid not found');
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // View controls
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchView(btn.dataset.view);
      });
    });

    // Folder filters
    document.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        this.applyFilter(item.dataset.filter);
      });
    });

    // Search is now handled by SearchManager in init()
  }

  /**
   * Load assets using the asset loader module
   */
  async loadAssets() {
    try {
      this.assetRenderer.showLoadingState(this.assetsGrid);
      
      // Load assets using the working approach
      this.assets = await this.assetLoader.loadAllAssets();
      this.filteredAssets = [...this.assets];
      
      // Update search manager with loaded assets
      this.searchManager.updateAssets(this.assets);
      
      console.log(`✅ Loaded ${this.assets.length} assets`);
      
    } catch (error) {
      console.error('Failed to load assets:', error);
      this.assets = [];
      this.filteredAssets = [];
      this.showError('Failed to load assets');
    }
  }

  /**
   * Update UI after asset loading or filtering
   */
  updateUI() {
    this.renderAssets();
    this.updateSidebarCounts();
    this.updateDocumentInfo();
  }

  /**
   * Render assets using the asset renderer
   */
  renderAssets() {
    const isListView = this.currentView === 'list';
    this.assetRenderer.renderAssets(this.filteredAssets, this.assetsGrid, isListView);
  }

  /**
   * Switch between grid and list views
   */
  switchView(view) {
    this.currentView = view;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    this.renderAssets();
  }

  /**
   * Apply folder-based filtering
   */
  applyFilter(filter) {
    this.currentFilter = filter;
    
    // Update folder item states
    document.querySelectorAll('.folder-item').forEach(item => {
      item.classList.toggle('active', item.dataset.filter === filter);
    });
    
    // Filter assets
    switch (filter) {
      case 'all':
        this.filteredAssets = [...this.assets];
        break;
      case 'internal':
        this.filteredAssets = this.assets.filter(asset => !asset.isExternal);
        break;
      case 'external':
        this.filteredAssets = this.assets.filter(asset => asset.isExternal);
        break;
      case 'image':
        this.filteredAssets = this.assets.filter(asset => asset.type === 'image');
        break;
      case 'video':
        this.filteredAssets = this.assets.filter(asset => asset.type === 'video');
        break;
      case 'document':
        this.filteredAssets = this.assets.filter(asset => asset.type === 'document');
        break;
      default:
        this.filteredAssets = [...this.assets];
    }
    
    this.renderAssets();
    this.updateSidebarCounts();
  }

  /**
   * Handle search functionality using SearchManager
   */
  handleSearch() {
    const query = this.searchInput?.value.trim() || '';
    
    if (!query) {
      this.filteredAssets = [...this.assets];
    } else {
      this.filteredAssets = this.searchManager.performSearch(query);
    }
    
    this.renderAssets();
    
    const breadcrumb = document.querySelector('.breadcrumb');
    if (breadcrumb) {
      if (!query) {
        breadcrumb.textContent = 'All Assets';
      } else {
        breadcrumb.textContent = `Search: "${query}" (${this.filteredAssets.length} results)`;
      }
    }
  }

  /**
   * Update sidebar asset counts
   */
  updateSidebarCounts() {
    const counts = {
      total: this.assets.length,
      internal: this.assets.filter(asset => !asset.isExternal).length,
      external: this.assets.filter(asset => asset.isExternal).length,
      images: this.assets.filter(asset => asset.type === 'image').length,
      videos: this.assets.filter(asset => asset.type === 'video').length,
      documents: this.assets.filter(asset => asset.type === 'document').length
    };

    // Update count elements
    const updateCount = (id, count) => {
      const element = document.getElementById(id);
      if (element) element.textContent = count;
    };

    updateCount('totalCount', counts.total);
    updateCount('internalCount', counts.internal);
    updateCount('externalCount', counts.external);
    updateCount('imageCount', counts.images);
    updateCount('videoCount', counts.videos);
    updateCount('documentCount', counts.documents);
  }

  /**
   * Update document info in sidebar
   */
  updateDocumentInfo() {
    const pathEl = document.getElementById('documentPath');
    const assetCountEl = document.getElementById('documentImageCount');

    if (pathEl) {
      const currentPath = Utils.getCurrentDocumentPath();
      pathEl.textContent = currentPath || '/demo';
    }

    if (assetCountEl) {
      // Show total number of assets instead of just images
      assetCountEl.textContent = this.assets.length;
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    console.error(message);
    if (this.assetsGrid) {
      this.assetsGrid.innerHTML = `<div class="error">❌ ${message}</div>`;
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
})(); 