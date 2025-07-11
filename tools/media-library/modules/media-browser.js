import { isExternalAsset } from './external-asset.js';
/**
 * Create Asset Browser Module
 * Handles displaying and managing assets in grid and list views
 */
function createAssetBrowser(container) {
  const state = {
    container,
    assets: [],
    filteredAssets: [],
    currentView: 'grid',
    currentSort: 'name',
    currentFilter: { types: ['image', 'video', 'document'], search: '' },
    eventListeners: {},
  };

  const api = {
    on,
    emit,
    setAssets,
    setView,
    setSort,
    setFilter,
    getSelectedAssets,
    clearSelection,
    processExternalAssets, // Expose the external asset processing function
  };

  function on(event, callback) {
    if (!state.eventListeners[event]) {
      state.eventListeners[event] = [];
    }
    state.eventListeners[event].push(callback);
  }

  function emit(event, data) {
    if (state.eventListeners[event]) {
      state.eventListeners[event].forEach((callback) => callback(data));
    }
  }

  function setAssets(assets) {
    state.assets = assets || [];
    applyFiltersAndSort();
    render();
  }

  function setView(view) {
    state.currentView = view;
    render();
  }

  function setSort(sortBy) {
    state.currentSort = sortBy;
    applyFiltersAndSort();
    render();
  }

  function setFilter(filter) {
    state.currentFilter = { ...state.currentFilter, ...filter };
    applyFiltersAndSort();
    render();
    updateFilterCounts();
  }

  function applyFiltersAndSort() {
    let filtered = [...state.assets];

    if (state.currentFilter.types && state.currentFilter.types.length > 0) {
      filtered = filtered.filter((asset) =>
        state.currentFilter.types.includes(asset.type),
      );
    }

    if (state.currentFilter.isExternal !== undefined) {
      filtered = filtered.filter((asset) =>
        asset.isExternal === state.currentFilter.isExternal,
      );
    }

    if (state.currentFilter.usedOnPage && state.currentFilter.missingAlt && window.currentPagePath) {
      filtered = filtered.filter((asset) =>
        asset.type === 'image'
        && (!asset.alt || asset.alt.trim() === '' || asset.alt === 'Untitled')
        && asset.usedIn && asset.usedIn.split(',').map((s) => s.trim()).includes(window.currentPagePath),
      );
    } else if (state.currentFilter.missingAlt) {
      filtered = filtered.filter((asset) =>
        asset.type === 'image' && (!asset.alt || asset.alt.trim() === '' || asset.alt === 'Untitled'),
      );
    } else if (state.currentFilter.usedOnPage && window.currentPagePath) {
      filtered = filtered.filter((asset) =>
        asset.usedIn && asset.usedIn.split(',').map((s) => s.trim()).includes(window.currentPagePath),
      );
    }

    if (state.currentFilter.search) {
      const searchTerm = state.currentFilter.search.toLowerCase();
      filtered = filtered.filter((asset) =>
        asset.name.toLowerCase().includes(searchTerm)
        || asset.alt.toLowerCase().includes(searchTerm)
        || asset.src.toLowerCase().includes(searchTerm),
      );
    }

    filtered.sort((a, b) => {
      switch (state.currentSort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'modified':
          return (b.lastSeen || 0) - (a.lastSeen || 0);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'usage':
          return (b.usedIn?.length || 0) - (a.usedIn?.length || 0);
        default:
          return 0;
      }
    });

    state.filteredAssets = filtered;
  }

  function render() {
    if (!state.container) return;

    // Toggle .list-view class on container
    if (state.currentView === 'list') {
      state.container.classList.add('list-view');
    } else {
      state.container.classList.remove('list-view');
    }

    state.container.innerHTML = '';

    if (state.filteredAssets.length === 0) {
      renderEmptyState();
      return;
    }

    if (state.currentView === 'list') {
      renderListHeader();
    }

    state.filteredAssets.forEach((asset) => {
      const assetElement = createAssetElement(asset);
      assetElement.setAttribute('data-asset-id', asset.id);
      state.container.appendChild(assetElement);
    });
  }

  function renderEmptyState() {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = `
      <div class="empty-content">
        <h3>No assets found</h3>
        <p>Try adjusting your filters or scanning for assets.</p>
      </div>
    `;
    state.container.appendChild(emptyDiv);
  }

  function renderListHeader() {
    const header = document.createElement('div');
    header.className = 'list-header';
    header.innerHTML = `
      <div class="list-header-cell">Name</div>
      <div class="list-header-cell">Type</div>
      <div class="list-header-cell">Usage</div>
      <div class="list-header-cell">Actions</div>
    `;
    state.container.appendChild(header);
  }

  function createAssetElement(asset) {
    const element = document.createElement('div');
    element.className = 'asset-item';
    // data-asset-id is now set in render using loop index

    if (state.currentView === 'grid') {
      element.innerHTML = createGridViewHTML(asset);
    } else {
      element.innerHTML = createListViewHTML(asset);
    }

    addAssetEventListeners(element, asset);

    return element;
  }

  function createGridViewHTML(asset) {
    const thumbnailSrc = asset.type === 'image' ? asset.src : getTypeThumbnail(asset.type);
    const isExternal = asset.isExternal ? 'external' : 'internal';
    // Pills: IMAGE and INT/EXT
    const typePill = '<span class="badge image">IMAGE</span>';
    const intExtPill = `<span class="badge ${isExternal === 'external' ? 'ext' : 'int'}">${
      isExternal === 'external' ? 'EXT' : 'INT'
    }</span>`;

    // Add insert as link button for external assets
    const insertAsLinkBtn = asset.isExternal
      ? '<button class="action-btn link-insert-icon" data-action="insertAsLink" title="Insert as Link" aria-label="Insert as link">LINK</button>'
      : '';

    return `
      <div class="asset-preview">
        <img src="${thumbnailSrc}" alt="${asset.alt}" loading="lazy" data-action="insert" style="cursor: pointer;">
      </div>
      <div class="asset-info">
        <div class="asset-name">${asset.name}</div>
        <div class="asset-meta-row">
          <div class="asset-pills">
            ${typePill}
            ${intExtPill}
          </div>
          <div class="asset-actions">
            <button class="action-btn responsive-preview-icon" data-action="preview" title="Preview" aria-label="Preview asset">PREV</button>
            <button class="action-btn usage-icon" data-action="usage" title="View usage" aria-label="View usage">USAG</button>
            <button class="action-btn link-action" data-action="link" title="Open in new tab" aria-label="Open asset in new tab">OPEN</button>
            ${insertAsLinkBtn}
          </div>
        </div>
      </div>
    `;
  }

  function createListViewHTML(asset) {
    const thumbnailSrc = asset.type === 'image' ? asset.src : getTypeThumbnail(asset.type);
    const isExternal = asset.isExternal ? 'external' : 'internal';
    return `
      <div class="list-cell list-cell-thumb">
        <img src="${thumbnailSrc}" alt="${asset.alt}" loading="lazy" class="asset-thumbnail-small">
      </div>
      <div class="list-cell list-cell-name">${asset.name}</div>
      <div class="list-cell list-cell-type">
        <span class="badge image">IMAGE</span>
        <span class="badge ${isExternal === 'external' ? 'ext' : 'int'}">${
  isExternal === 'external' ? 'EXT' : 'INT'
}</span>
      </div>
      <div class="list-cell list-cell-usage">Used 1 time</div>
    `;
  }

  function getTypeThumbnail(type) {
    switch (type) {
      case 'video':
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
          + '<path fill="%23666" d="M8 5v14l11-7z"/></svg>';
      case 'document':
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
          + '<path fill="%23666" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2'
          + 'M18,20H6V4H13V9H18V20Z"/></svg>';
      default:
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
          + '<path fill="%23666" d="M5,4V7H10.5V19H13.5V7H19V4H5Z"/></svg>';
    }
  }

  function addAssetEventListeners(element, asset) {
    // Add click handlers for action buttons and image
    element.querySelectorAll('[data-action]').forEach((el) => {
      el.onclick = (e) => {
        const action = el.getAttribute('data-action');
        if (action === 'insert') {
          emit('assetSelected', asset);
        } else if (action === 'preview') {
          emit('assetPreview', asset);
        } else if (action === 'usage') {
          emit('assetUsage', asset);
        } else if (action === 'link') {
          // For copying link, you might want to use a clipboard API or a custom handler
          // For now, we'll just emit an event
          emit('assetLinkCopied', asset);
        } else if (action === 'insertAsLink') {
          // Emit special event for inserting external asset as link
          emit('assetInsertAsLink', asset);
        }
        e.stopPropagation();
      };
    });
  }

  function updateFilterCounts() {
    // Sidebar asset type counts
    const imageCount = state.assets.filter((a) => a.type === 'image').length;
    const videoCount = state.assets.filter((a) => a.type === 'video').length;
    const documentCount = state.assets.filter((a) => a.type === 'document').length;
    const internalCount = state.assets.filter((a) => a.isExternal === false).length;
    const externalCount = state.assets.filter((a) => a.isExternal === true).length;
    const totalCount = state.assets.length;

    const setCount = (id, count) => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    };
    setCount('imageCount', imageCount);
    setCount('videoCount', videoCount);
    setCount('documentCount', documentCount);
    setCount('internalCount', internalCount);
    setCount('externalCount', externalCount);
    setCount('totalCount', totalCount);
  }

  function getSelectedAssets() {
    const selectedElements = state.container.querySelectorAll('.asset-item.selected');
    return Array.from(selectedElements).map((element) => {
      const assetId = element.dataset.assetId;
      return state.assets.find((asset) => asset.id === assetId);
    }).filter(Boolean);
  }

  function clearSelection() {
    const selectedElements = state.container.querySelectorAll('.asset-item.selected');
    selectedElements.forEach((element) => {
      element.classList.remove('selected');
    });
  }

  /**
   * Process assets to detect external links and add metadata
   */
  function processExternalAssets(assets, pageContext = {}) {
    // Extract domains from pageContext for internal asset detection
    const internalDomains = [];

    // Safely extract domains from pageContext
    if (pageContext && typeof pageContext === 'object') {
      if (pageContext.site) internalDomains.push(pageContext.site);
      if (pageContext.org) internalDomains.push(pageContext.org);
    }

    // Add default domain if none provided
    if (internalDomains.length === 0) {
      internalDomains.push(window.location.hostname);
    }

    return assets.map((asset) => {
      const isExternal = isExternalAsset(asset.src, internalDomains);
      return {
        ...asset,
        isExternal,
      };
    });
  }

  return api;
}

export { createAssetBrowser };
