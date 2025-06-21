# DA Media Basic Library Plugin

A lightweight, self-contained media asset discovery and management plugin for DA (Document Authoring) that automatically scans your content and enables seamless asset reuse across your organization.

## 🎯 Purpose

DA Media Basic provides a streamlined alternative to the full DA Media Library by:

- **Automatic Discovery**: Scans your DA content to discover all media assets used across pages
- **Zero Infrastructure**: No external services required - uses only DA APIs and stores metadata in DA
- **Asset Reuse**: Enables easy insertion of discovered assets into your content
- **Delta Scanning**: Efficiently tracks changes and only scans modified content
- **Self-Contained**: Runs entirely within DA using official DA infrastructure

## 🚀 How It Works

### 1. **Content Discovery**
- Uses DA's List API to discover all files and folders in your organization
- Identifies HTML files that may contain media assets
- Leverages official DA Tree utility for efficient file crawling

### 2. **Asset Extraction**
- Scans HTML content using DA's Source API
- Extracts images, videos, and documents from various HTML sources:
  - `<img>` tags with src attributes
  - `<picture>` elements with source sets
  - `<video>` and `<audio>` elements
  - Background images from CSS
  - External and internal assets

### 3. **Metadata Storage**
- Stores discovered assets in AEM-compatible multi-sheet format at `/.da/media.json`
- Tracks usage across pages for analytics
- Maintains scan history for delta updates
- No external database required

### 4. **Smart Scanning**
- **Delta Scanning**: Only processes files modified since last scan
- **Web Workers**: Background processing to prevent UI blocking
- **Rate Limiting**: Respects DA API limits with throttling
- **Automatic Updates**: Scans run automatically when plugin loads

### 5. **Asset Insertion**
- Integrates with DA SDK for seamless asset insertion
- Generates optimized HTML for images (responsive picture elements)
- Supports external and internal assets
- Tracks usage for analytics

## 📁 Architecture

```
tools/da-media-basic/
├── da-media-basic.html         # Plugin UI
├── da-media-basic.js           # Main controller
├── da-media-basic.css          # Styling (Adobe Clean fonts)
├── services/
│   ├── da-api.js              # DA API integration
│   └── metadata-manager.js    # Metadata CRUD operations
├── modules/
│   ├── asset-browser.js       # Asset display & navigation
│   ├── asset-insertion.js     # DA SDK asset insertion
│   ├── folder-tree.js         # Folder navigation
│   └── utils.js               # Common utilities
└── workers/
    └── scan-worker.js         # Background HTML scanning
```

## 🔧 Features

- **📊 Asset Dashboard**: Browse all discovered assets in grid or list view
- **🔍 Smart Search**: Find assets by name, alt text, or source
- **📁 Folder Navigation**: Browse assets by their source folders
- **🎯 One-Click Insertion**: Insert assets directly into your content
- **📈 Usage Analytics**: Track where assets are used across your site
- **⚡ Delta Scanning**: Only scan changed content for efficiency
- **🎨 Responsive Design**: Works seamlessly on desktop and mobile
- **🔄 Auto-Refresh**: Keeps asset library up to date automatically

## 🎨 What We're Reusing from DA Live

### Official DA Libraries
- **DA SDK** (`https://da.live/nx/utils/sdk.js`) - Authentication, context, and document actions
- **Tree Utility** (`https://da.live/nx/public/utils/tree.js`) - Efficient file crawling
- **DA Fetch** (`https://da.live/nx/utils/daFetch.js`) - Enhanced API calls with authentication
- **Adobe Fonts** (`https://use.typekit.net/hah7vzn.css`) - Official Adobe typography

### Design System Patterns
- **CSS Custom Properties**: Color tokens and spacing from DA Live
- **Adobe Clean Font**: Consistent typography across DA tools
- **Component Architecture**: Functional patterns, factory functions
- **Responsive Design**: Mobile-first approach matching DA Live

### Utility Patterns
- **Debouncing**: Search input optimization (300ms delay)
- **Caching**: localStorage with TTL for performance
- **Error Handling**: Graceful fallbacks with toast notifications
- **Rate Limiting**: API throttling to respect DA limits

### Asset Insertion Patterns
- **DA SDK Integration**: Uses `actions.sendHTML()` and `actions.sendText()`
- **Optimized Images**: Responsive picture elements with WebP optimization
- **Usage Tracking**: Analytics following DA Live patterns
- **Context Management**: Org/repo extraction and storage

### Performance Patterns
- **Web Workers**: Background processing to prevent UI blocking
- **Progressive Loading**: Load existing data first, scan in background
- **Throttled Operations**: Batch processing with configurable delays
- **Smart Caching**: 5-minute TTL for metadata with invalidation

## 🛠️ Usage

1. **Open the Plugin**: Access DA Media Basic from your DA organization
2. **Automatic Scanning**: Plugin automatically discovers and scans your content
3. **Browse Assets**: Use the interface to explore discovered media assets
4. **Insert Assets**: Click any asset to insert it into your current document
5. **Stay Updated**: Plugin automatically keeps asset library current

## 📊 Metadata Format

Assets are stored in AEM-compatible multi-sheet JSON format:

```json
{
  ":type": "da-media-data",
  ":version": "1.0.0",
  ":names": ["config", "scans", "assets", "statistics"],
  "config": { /* configuration data */ },
  "scans": { /* scan history */ },
  "assets": { /* asset database */ },
  "statistics": { /* usage analytics */ }
}
```

## 🔗 Benefits

1. **Zero Infrastructure**: No external services or databases required
2. **Official Integration**: Uses DA's own libraries and patterns
3. **Performance**: Efficient delta scanning and background processing
4. **Consistency**: UI/UX matches official DA tools
5. **Future-Proof**: Aligned with DA Live evolution
6. **Self-Contained**: Works entirely within your DA organization

## 🚀 Getting Started

Simply access the DA Media Basic plugin in your DA organization. The plugin will automatically:

1. Connect to your DA organization using your current authentication
2. Discover your content structure
3. Scan for media assets in the background
4. Present a browsable asset library
5. Enable one-click asset insertion into your documents

No setup, configuration, or external services required! 