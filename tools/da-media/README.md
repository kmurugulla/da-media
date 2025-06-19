# DA Media Library Plugin

AI-powered Media Library Plugin for DA (Document Authoring) that enables intelligent asset discovery through natural language queries and predictive recommendations.

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

## Core Features

### 🧠 AI-Powered Discovery
- **Natural Language Search**: "Show me hero images for SaaS landing pages"
- **Context-Aware Recommendations**: Based on document analysis
- **Visual Similarity Search**: Find assets similar to existing ones
- **Predictive Asset Grid**: AI-recommended assets on plugin open

### ⚡ Performance Optimized
- **Virtual Scrolling**: Handle 100K+ assets smoothly
- **Multi-Level Caching**: Memory → IndexedDB → Cloudflare KV → DA Source
- **Background Processing**: Non-blocking AI analysis
- **Edge Computing**: Global performance via Cloudflare Workers

### 🗂️ Smart Asset Management
- **Asset Removal Decision Matrix**: Intelligent cleanup strategies
- **Usage Analytics**: Track asset performance and reuse
- **Multi-Tenant Support**: Org/repo isolation
- **Real-Time Sync**: Instant asset availability

## Asset Removal Decision Matrix

```
├── Document-Level Removal
│   ├── Asset removed from single document → Keep in library
│   ├── Asset used in multiple documents → Keep in library  
│   ├── Asset removed from last document → Mark as unused, keep
│   └── Reasoning: Asset may be reused in future content
│
├── DA Storage Deletion
│   ├── Asset deleted from DA → Remove from library immediately
│   ├── Asset moved/renamed in DA → Update library references
│   ├── Asset becomes inaccessible → Mark as broken, cleanup later
│   └── Reasoning: DA is source of truth
│
├── Automated Cleanup
│   ├── Unused assets > 90 days → Soft delete (mark inactive)
│   ├── Broken links > 30 days → Hard delete from library
│   ├── Duplicate detection → Consolidate, keep best version
│   └── Storage optimization → Remove low-quality duplicates
│
└── Manual Management
    ├── Admin-initiated cleanup → Bulk removal operations
    ├── User-reported issues → Manual investigation
    ├── Asset quality review → Remove poor-quality assets
    └── Brand compliance → Remove non-compliant assets
```

## Quick Start

### 1. Infrastructure Setup (First Time Only)

```bash
cd tools/da-media/cloudflare
npm install
npm run setup
```

This will:
- ✅ Create Cloudflare KV namespaces
- ✅ Create D1 database
- ✅ Create R2 buckets
- ✅ Apply database schema
- ✅ Deploy Workers

### 2. Test Plugin in DA

Simply open the HTML file in DA:
- `da-media.html` - Complete plugin interface
- `da-media.js` - Plugin logic with AI features

### 3. Integration with DA

The plugin automatically integrates with DA through:
- **DA SDK**: For context detection and asset insertion
- **DA Source API**: For asset discovery and monitoring
- **DA Authentication**: Inherits org/repo permissions

## Usage

### Natural Language Search
```javascript
// User types: "professional headshots for team page"
// AI converts to structured search:
{
  asset_types: ["image"],
  categories: ["professional", "people", "headshots"],
  use_cases: ["team", "about", "staff"],
  filters: { orientation: "portrait", style: "professional" }
}
```

### Context-Aware Recommendations
```javascript
// Document analysis triggers automatic recommendations
// Based on: content type, existing assets, user patterns
const recommendations = await generateRecommendations({
  documentType: "landing-page",
  section: "hero",
  userHistory: userPatterns,
  contentTheme: "saas-product"
});
```

## Cost Structure

### Free Tier (POC)
- **Workers**: 100K requests/day
- **KV Storage**: 1GB + 100K reads/day
- **D1 Database**: 5GB + 25M rows/day
- **R2 Storage**: 10GB + 1M operations/month
- **AI Processing**: 10K requests/day

**Total Cost**: $0/month

### Professional Tier
- **Estimated Cost**: $50-200/month
- **Supports**: 10K+ assets, advanced AI, priority support

### Enterprise Tier
- **Estimated Cost**: $1000-4000/month
- **Supports**: Unlimited assets, custom models, SLA

## Development Workflow

### Plugin Development
```bash
# Edit the plugin files directly
# - da-media.html for UI changes
# - da-media.js for functionality changes

# No build process needed - uses vanilla JS + DA SDK
# Test by opening da-media.html in DA
```

### Cloudflare Management
```bash
# Deploy updates
cd cloudflare && npm run deploy

# Check database
npm run db:query "SELECT COUNT(*) FROM asset_metadata"

# View logs
wrangler tail
```

### Shared Utilities
```bash
# Build shared types
cd shared && npm run build

# Used by both frontend and infrastructure
```

## Architecture Principles

### 1. DA-Native Design
- No separate asset storage - DA remains source of truth
- Seamless integration with existing DA workflows
- Inherits DA's authentication and permissions

### 2. Intelligence Layer
- AI enhancement without workflow disruption
- Background processing doesn't block user actions
- Continuous learning from user interactions

### 3. Performance First
- Virtual scrolling for large asset libraries
- Multi-level caching strategy
- Edge computing for global performance

### 4. Scalable Infrastructure
- Multi-tenant architecture
- Cloudflare edge network
- Cost-efficient scaling

## Contributing

### Setup Development Environment
1. Clone repository
2. Set up Cloudflare: `cd cloudflare && npm run setup`
3. Test plugin by opening `da-media.html` in DA

### Testing
- **Frontend**: Component tests with Vitest
- **Backend**: Worker tests with Wrangler
- **Integration**: End-to-end DA integration tests

## Support

- **Documentation**: See component-specific READMEs
- **Issues**: Create GitHub issues for bugs/features
- **Architecture**: See `DA-Media-Library-Architecture.md`

## License

Apache 2.0 - See LICENSE file for details.

---

*This plugin enhances DA's content creation workflow with AI-powered asset discovery while maintaining the simplicity and performance that makes DA effective.* 