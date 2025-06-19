export class SearchManager {
  constructor(assets = []) {
    this.assets = assets;
    this.searchInput = null;
    this.quickSearchLabels = null;
  }

  init(onSearchCallback) {
    this.searchInput = document.getElementById('nlpSearch');
    this.quickSearchLabels = document.getElementById('quickSearchLabels');
    this.onSearchCallback = onSearchCallback;
    
    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.handleSearchInput.bind(this));
    }
  }

  updateAssets(assets) {
    this.assets = assets;
    this.generateDynamicQuickSearchLabels();
  }

  generateDynamicQuickSearchLabels() {
    if (!this.assets || this.assets.length === 0) return;
    if (!this.quickSearchLabels) return;

    const termCounts = new Map();
    const minCount = 3;

    this.assets.forEach(asset => {
      const allTerms = [
        ...asset.name.toLowerCase().split(/[\s\-_]+/),
        ...(asset.tags || []).map(tag => tag.toLowerCase()),
        asset.category.toLowerCase(),
        asset.type.toLowerCase()
        // Explicitly exclude scan metadata fields
      ];

      allTerms.forEach(term => {
        const excludedTerms = [
          'image', 'external', 'internal', 
          'github-actions-publish', 'github', 'actions', 'publish',
          'scan', 'trigger', 'metadata', 'preview', 'manual',
          'unknown', 'sourceType'
        ];
        
        if (term.length > 3 && 
            !term.match(/^\d+$/) && 
            !excludedTerms.includes(term.toLowerCase())) {
          termCounts.set(term, (termCounts.get(term) || 0) + 1);
        }
      });
    });

    const priorityTerms = ['poster', 'logo', 'carousel', 'hero', 'thumbnail', 'banner', 'sling'];
    const topTerms = Array.from(termCounts.entries())
      .filter(([term, count]) => count >= minCount)
      .sort((a, b) => {
        const aPriority = priorityTerms.includes(a[0]) ? 1000 : 0;
        const bPriority = priorityTerms.includes(b[0]) ? 1000 : 0;
        return (bPriority + b[1]) - (aPriority + a[1]);
      })
      .slice(0, 6)
      .map(([term, count]) => ({ term, count }));

    const essentialLabels = [
      { term: 'external', count: this.assets.filter(a => a.isExternal).length }
    ];

    const allLabels = [...essentialLabels, ...topTerms]
      .filter((label, index, arr) => arr.findIndex(l => l.term === label.term) === index)
      .slice(0, 6);

    this.quickSearchLabels.innerHTML = allLabels
      .map(({ term, count }) => `
        <span class="quick-search-label" data-search="${term}">
          ${term.charAt(0).toUpperCase() + term.slice(1)} (${count})
        </span>
      `).join('');

    this.quickSearchLabels.querySelectorAll('.quick-search-label').forEach(label => {
      label.addEventListener('click', (e) => {
        const searchTerm = e.target.dataset.search;
        if (this.searchInput) {
          this.searchInput.value = searchTerm;
          this.handleSearchInput();
        }
      });
    });

    console.log('🏷️ Generated dynamic quick search labels:', allLabels.map(l => l.term));
  }

  handleSearchInput() {
    if (this.onSearchCallback) {
      this.onSearchCallback();
    }
  }

  performSearch(query) {
    const queryLower = query.toLowerCase().trim();
    
    if (!queryLower) {
      return [...this.assets];
    }

    console.log('🔍 Processing search query:', queryLower);

    const stopWords = ['show', 'me', 'get', 'find', 'search', 'for', 'some', 'a', 'an', 'the', 'of', 'with', 'that', 'can', 'use', 'in', 'i', 'need', 'want', 'give', 'looking'];
    const keywords = queryLower.split(' ')
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    console.log('🎯 Extracted keywords:', keywords);

    if (keywords.length === 0) {
      return this.assets.filter(asset => 
        asset.name.toLowerCase().includes(queryLower) ||
        (asset.description && asset.description.toLowerCase().includes(queryLower)) ||
        (asset.tags && asset.tags.some(tag => tag.toLowerCase().includes(queryLower))) ||
        asset.category.toLowerCase().includes(queryLower)
      );
    }

    const filteredAssets = this.assets.filter(asset => {
      const searchText = `${asset.name} ${asset.category} ${(asset.tags || []).join(' ')} ${asset.description || ''}`.toLowerCase();
      
      const hasMatch = keywords.some(keyword => {
        const categoryMatch = asset.category.toLowerCase().includes(keyword);
        const nameMatch = asset.name.toLowerCase().includes(keyword);
        const textMatch = searchText.includes(keyword);
        const isExternalMatch = keyword === 'external' && asset.isExternal;
        const isInternalMatch = keyword === 'internal' && !asset.isExternal;
        const typeMatch = asset.type.toLowerCase().includes(keyword);
        
        return categoryMatch || nameMatch || textMatch || isExternalMatch || isInternalMatch || typeMatch;
      });
      
      return hasMatch;
    });

    console.log(`🎯 Search results: ${filteredAssets.length} assets found`);
    return filteredAssets;
  }

  getTagCount(tag) {
    return this.assets.filter(asset => 
      asset.name.toLowerCase().includes(tag) || 
      (asset.tags && asset.tags.some(t => t.toLowerCase().includes(tag)))
    ).length;
  }
} 