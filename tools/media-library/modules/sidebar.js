// tools/media-library/modules/sidebar.js
// Unified sidebar count update logic for Media Library

function updateSidebarCounts(assets, currentPage) {
  // All Assets breakdown
  const imageCount = assets.filter((a) => a.type === 'image').length;
  const videoCount = assets.filter((a) => a.type === 'video').length;
  const documentCount = assets.filter((a) => a.type === 'document').length;
  const internalCount = assets.filter((a) => a.isExternal === false).length;
  const externalCount = assets.filter((a) => a.isExternal === true).length;
  const totalCount = assets.length;
  const missingAltCount = assets.filter((a) =>
    a.type === 'image' && (!a.alt || a.alt.trim() === '' || a.alt === 'Untitled'),
  ).length;

  // Helper to set count in DOM
  const setCount = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };
  setCount('totalCount', totalCount);
  setCount('internalCount', internalCount);
  setCount('externalCount', externalCount);
  setCount('imageCount', imageCount);
  setCount('videoCount', videoCount);
  setCount('documentCount', documentCount);
  setCount('missingAltCount', missingAltCount);

  // Used on This Page breakdown
  let usedOnPageCount = '-';
  let usedInternalCount = '-';
  let usedExternalCount = '-';
  let usedMissingAltCount = '-';

  function normalizePath(path) {
    try {
      if (path.startsWith('http')) {
        return new URL(path).pathname;
      }
      return path;
    } catch {
      return path;
    }
  }

  if (currentPage) {
    const normalizedCurrentPage = normalizePath(currentPage);
    const usedOnPage = assets.filter((a) => {
      if (!a.usedIn) return false;
      const usedInArr = a.usedIn.split(',').map((s) => normalizePath(s.trim()));
      return usedInArr.includes(normalizedCurrentPage);
    });
    usedOnPageCount = usedOnPage.length;
    usedInternalCount = usedOnPage.filter((a) => a.isExternal === false).length;
    usedExternalCount = usedOnPage.filter((a) => a.isExternal === true).length;
    usedMissingAltCount = usedOnPage.filter(
      (a) => a.type === 'image' && (!a.alt || a.alt.trim() === '' || a.alt === 'Untitled'),
    ).length;
  }
  setCount('usedOnPageCount', usedOnPageCount);
  setCount('usedInternalCount', usedInternalCount);
  setCount('usedExternalCount', usedExternalCount);
  setCount('usedMissingAltCount', usedMissingAltCount);
}

export { updateSidebarCounts };
