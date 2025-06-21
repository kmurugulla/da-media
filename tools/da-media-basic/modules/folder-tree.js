/**
 * Create Folder Tree Module
 * Handles folder navigation and selection
 */
function createFolderTree(container) {
  const state = {
    container,
    folders: [],
    selectedFolder: null,
    eventListeners: {},
  };

  const api = {
    on,
    emit,
    renderFolders,
    selectFolder,
    getSelectedFolder,
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

  function renderFolders(folders) {
    state.folders = folders || [];
    render();
  }

  function render() {
    if (!state.container) return;

    state.container.innerHTML = '';

    createAllAssetsOption();

    state.folders.forEach((folder) => {
      createFolderElement(folder);
    });
  }

  function createAllAssetsOption() {
    const allAssetsElement = document.createElement('div');
    allAssetsElement.className = 'folder-item all-assets';
    allAssetsElement.innerHTML = `
      <div class="folder-content">
        <span class="folder-icon">📁</span>
        <span class="folder-name">All Assets</span>
      </div>
    `;

    addFolderEventListener(allAssetsElement, null);
    state.container.appendChild(allAssetsElement);
  }

  function createFolderElement(folder) {
    const folderElement = document.createElement('div');
    folderElement.className = 'folder-item';
    folderElement.dataset.folderPath = folder.path;

    folderElement.innerHTML = `
      <div class="folder-content">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${folder.name}</span>
      </div>
    `;

    addFolderEventListener(folderElement, folder);
    state.container.appendChild(folderElement);

    if (folder.children && folder.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'folder-children';

      folder.children.forEach((child) => {
        const childElement = createFolderElement(child);
        childrenContainer.appendChild(childElement);
      });

      state.container.appendChild(childrenContainer);
    }
  }

  function addFolderEventListener(element, folder) {
    element.addEventListener('click', () => {
      selectFolder(folder);
      emit('folderSelected', folder);
    });
  }

  function selectFolder(folder) {
    state.selectedFolder = folder;
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const allFolderItems = state.container.querySelectorAll('.folder-item');

    allFolderItems.forEach((item) => {
      item.classList.remove('selected');
    });

    if (state.selectedFolder) {
      const selectedElement = state.container.querySelector(`[data-folder-path="${state.selectedFolder.path}"]`);
      if (selectedElement) {
        selectedElement.classList.add('selected');
      }
    } else {
      const allAssetsElement = state.container.querySelector('.all-assets');
      if (allAssetsElement) {
        allAssetsElement.classList.add('selected');
      }
    }
  }

  function getSelectedFolder() {
    return state.selectedFolder;
  }

  function clearSelection() {
    state.selectedFolder = null;
    updateSelectionUI();
  }

  return api;
}

export { createFolderTree };
