/**
 * Get assets used on current document
 */
export function getDocumentSpecificAssets(assets, context) {
  const currentPath = context?.path || window.location.pathname;

  return assets.filter((asset) => {
    if (!asset.usedInPages || !Array.isArray(asset.usedInPages)) {
      return false;
    }

    return asset.usedInPages.some((page) => {
      if (!page.path) return false;

      const pagePath = page.path.toLowerCase();
      const normalizedCurrentPath = currentPath.toLowerCase();

      return (
        pagePath === normalizedCurrentPath
        || pagePath === `${normalizedCurrentPath}.md`
        || pagePath === normalizedCurrentPath.replace('/', '')
        || pagePath === `${normalizedCurrentPath.replace('/', '')}.md`
        || normalizedCurrentPath === pagePath.replace('.md', '')
        || normalizedCurrentPath.replace('/', '') === pagePath.replace('.md', '')
      );
    });
  });
}

/**
 * Get document-specific asset counts
 */
export function getDocumentAssetCounts(assets, context) {
  const documentAssets = getDocumentSpecificAssets(assets, context);
  const usedOnPageCount = documentAssets.length;
  const usedInternalCount = documentAssets.filter((asset) => !asset.isExternal).length;
  const usedExternalCount = documentAssets.filter((asset) => asset.isExternal).length;

  return {
    usedOnPageCount,
    usedInternalCount,
    usedExternalCount,
    documentAssets,
  };
}

/**
 * Filter assets by document usage type
 */
export function filterAssetsByDocumentUsage(assets, context, filterType) {
  const documentAssets = getDocumentSpecificAssets(assets, context);

  switch (filterType) {
    case 'used-on-page':
      return documentAssets;
    case 'used-internal':
      return documentAssets.filter((asset) => !asset.isExternal);
    case 'used-external':
      return documentAssets.filter((asset) => asset.isExternal);
    default:
      return [];
  }
}

/**
 * Update document usage counts in DOM
 */
export function updateDocumentUsageCounts(assets, context) {
  const counts = getDocumentAssetCounts(assets, context);

  const usedOnPageCountEl = document.getElementById('usedOnPageCount');
  const usedInternalCountEl = document.getElementById('usedInternalCount');
  const usedExternalCountEl = document.getElementById('usedExternalCount');

  if (usedOnPageCountEl) usedOnPageCountEl.textContent = counts.usedOnPageCount;
  if (usedInternalCountEl) usedInternalCountEl.textContent = counts.usedInternalCount;
  if (usedExternalCountEl) usedExternalCountEl.textContent = counts.usedExternalCount;

  return counts;
}
