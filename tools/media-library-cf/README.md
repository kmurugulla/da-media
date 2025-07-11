# DA Media Library Plugin

A media management tool for DA (Document Authoring) that enables asset discovery, reuse, and insertion across your content.

## Interface Overview

![DA Media Library Interface](screenshot.png)

The DA Media Library provides a straightforward interface for browsing and reusing assets across your organization's content.

## Architecture Overview

```
tools/da-media/
├── da-media.html                # 🎯 DA Plugin UI (following DA demo pattern)
├── da-media.js                  # 🎯 DA Plugin Logic (DA SDK integration)
│
├── cloudflare/                  # 🏗️ Cloudflare Workers & Services
│   ├── workers/                 # Edge computing functions
│   ├── database/                # D1 database schema & migrations
│   ├── scripts/                 # Setup and deployment scripts
│   ├── wrangler.toml           # Cloudflare configuration
│   ├── package.json            # Backend dependencies
│   └── README.md               # Infrastructure setup guide
│
├── shared/                      # 📦 Common Types & Utilities
│   ├── types/                   # TypeScript definitions
│   ├── constants/               # Shared constants
│   ├── utils/                   # Cross-platform utilities
│   └── package.json            # Shared dependencies
│
└── README.md                    # This file - main plugin documentation
```

## Current Features ✅

### 📚 **Asset Browsing & Discovery**
- **Asset Library**: Browse all media assets used across your DA site
- **Search Functionality**: Basic text search to find assets by name or type
- **Categorization**: Filter assets by type (Images, Videos, Documents) and source (Internal/External)
- **Grid and List Views**: Toggle between visual grid and detailed list presentations

### 🖱️ **Asset Insertion**
- **Click-to-Insert**: Single-click insertion of assets directly into your DA documents
- **Preview Modal**: View assets in detail before insertion
- **Usage Tracking**: See which pages currently use each asset
- **Multi-format Support**: Handle various image, video, and document formats

### 🎨 **User Interface**
- **Responsive Design**: Works across desktop, tablet, and mobile devices
- **DA Integration**: Seamless integration with DA's authoring environment
- **Filter Sidebar**: Easy filtering by asset type and source

### 🏗️ **Infrastructure**
- **Cloudflare Backend**: API gateway and storage for asset metadata
- **Multi-tenant Support**: Isolated by DA org/repo structure
- **Basic Caching**: Asset metadata caching for performance

## Coming Soon 🚧

### 🧠 **AI-Powered Features** (Future)
- **Natural Language Search**: "Find hero images for landing pages"
- **Context-Aware Recommendations**: Smart suggestions based on document content
- **Visual Similarity Search**: Find assets similar to existing ones
- **Predictive Asset Grid**: AI-recommended assets

### ⚡ **Performance Enhancements** (Future)
- **Virtual Scrolling**: Handle 100K+ assets smoothly
- **Advanced Caching**: Multi-level caching strategy
- **Background Processing**: Non-blocking analysis

### 📊 **Analytics & Management** (Future)
- **Usage Analytics**: Detailed asset usage reports
- **Automated Cleanup**: Smart removal of unused assets
- **Asset Optimization**: Automatic quality improvements

## Quick Start

### 1. Basic Usage
```bash
# Open the plugin in DA
# - Navigate to tools/da-media/da-media.html in your DA environment
# - Browse available assets using the interface
# - Click assets to insert them into your document
```

### 2. Infrastructure Setup (Optional - For Advanced Features)
```bash
cd tools/da-media/cloudflare
npm install
npm run setup
```

This sets up the Cloudflare backend for enhanced asset management and caching.

## Integration with DA

The plugin integrates with DA through:
- **DA SDK**: For context detection and asset insertion
- **DA Source API**: For asset discovery and monitoring  
- **DA Authentication**: Inherits org/repo permissions automatically

## Usage

### Basic Workflow
1. Open `da-media.html` in your DA environment
2. Browse assets using search and filters
3. Click any asset to insert it into your document
4. Use preview modal to view assets before insertion

### Asset Management
- Assets are automatically discovered from your DA content
- External assets are tracked and categorized
- Usage tracking shows which pages use each asset

## Technical Details

### File Structure
- **`da-media.html`** - Main plugin interface
- **`da-media.js`** - Core plugin logic and DA SDK integration
- **`modules/`** - Modular components (asset loading, rendering, search, etc.)
- **`cloudflare/`** - Backend infrastructure for enhanced features

### Architecture Principles
- **DA-Native Design**: DA remains the source of truth for all assets
- **Modular Architecture**: Clean separation of concerns across modules
- **Performance Focused**: Efficient asset loading and rendering

## Development

### Making Changes
```bash
# Edit plugin files directly - no build process needed
# - da-media.html for UI changes
# - da-media.js for functionality changes
# - modules/* for specific feature changes

# Test by opening da-media.html in DA
```

### Optional Backend Setup
```bash
# For enhanced features (caching, analytics)
cd cloudflare && npm install && npm run setup
```

## Contributing

1. Clone repository
2. Make changes to plugin files
3. Test in DA environment
4. Submit pull request

## Support

- **Issues**: Create GitHub issues for bugs/features
- **Documentation**: See individual module READMEs for technical details
- **Architecture**: See `DA-Media-Library-Architecture.md` for system design

## License

Apache 2.0 - See LICENSE file for details.

---

*A practical media management tool that enhances DA's content creation workflow.* 