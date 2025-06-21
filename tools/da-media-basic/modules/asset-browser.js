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
    element.dataset.assetId = asset.id;

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

    return `
      <div class="asset-thumbnail">
        <img src="${thumbnailSrc}" alt="${asset.alt}" loading="lazy">
        <div class="asset-overlay">
          <button class="btn btn-primary btn-sm asset-insert" data-action="insert">
            Insert
          </button>
          <button class="btn btn-secondary btn-sm asset-preview" data-action="preview">
            Preview
          </button>
        </div>
      </div>
      <div class="asset-info">
        <div class="asset-name" title="${asset.name}">${asset.name}</div>
        <div class="asset-meta">
          <span class="asset-type">${asset.type}</span>
          <span class="asset-usage">${asset.usedIn?.length || 0} uses</span>
        </div>
      </div>
    `;
  }

  function createListViewHTML(asset) {
    const thumbnailSrc = asset.type === 'image' ? asset.src : getTypeThumbnail(asset.type);

    return `
      <div class="list-cell asset-name-cell">
        <img src="${thumbnailSrc}" alt="${asset.alt}" class="asset-thumbnail-small">
        <span class="asset-name" title="${asset.name}">${asset.name}</span>
      </div>
      <div class="list-cell asset-type-cell">
        <span class="asset-type-badge ${asset.type}">${asset.type}</span>
      </div>
      <div class="list-cell asset-usage-cell">
        <span class="usage-count">${asset.usedIn?.length || 0}</span>
        <span class="usage-label">uses</span>
      </div>
      <div class="list-cell asset-actions-cell">
        <button class="btn btn-sm btn-primary asset-insert" data-action="insert">
          Insert
        </button>
        <button class="btn btn-sm btn-secondary asset-preview" data-action="preview">
          Preview
        </button>
      </div>
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
    element.addEventListener('dblclick', () => {
      emit('assetSelected', asset);
    });

    const previewBtn = element.querySelector('[data-action="preview"]');
    if (previewBtn) {
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emit('assetPreview', asset);
      });
    }

    const insertBtn = element.querySelector('[data-action="insert"]');
    if (insertBtn) {
      insertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emit('assetSelected', asset);
      });
    }

    element.addEventListener('click', () => {
      emit('assetPreview', asset);
    });
  }

  function updateFilterCounts() {
    const typeFilters = document.querySelectorAll('.type-filter input[type="checkbox"]');

    typeFilters.forEach((checkbox) => {
      const type = checkbox.value;
      const count = state.assets.filter((asset) => asset.type === type).length;
      const label = checkbox.parentElement.querySelector('.filter-count');
      if (label) {
        label.textContent = `(${count})`;
      }
    });
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

  return api;
}

export { createAssetBrowser };
