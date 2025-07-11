# DA Media Library - Cloudflare Infrastructure Setup

This guide walks you through setting up the complete Cloudflare infrastructure for the DA Media Library Plugin.

## Prerequisites

1. **Cloudflare Account**: Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)
2. **Node.js**: Version 18+ required
3. **Git**: For version control

## Quick Setup (Automated)

### Step 1: Install Dependencies

```bash
cd tools/da-media/cloudflare
npm install
```

### Step 2: Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open your browser to authenticate with Cloudflare.

### Step 3: Run Automated Setup

```bash
npm run setup
```

This script will:
- ✅ Create all required KV namespaces
- ✅ Create D1 database
- ✅ Create R2 buckets
- ✅ Update wrangler.toml with generated IDs
- ✅ Apply database schema

### Step 4: Deploy Infrastructure

```bash
npm run deploy
```

## Manual Setup (Step-by-Step)

If you prefer manual setup or the automated script fails:

### 1. Create KV Namespaces

```bash
# Create main metadata namespace
npx wrangler kv:namespace create "DA_MEDIA_KV"
npx wrangler kv:namespace create "DA_MEDIA_KV" --preview

# Create cache namespace
npx wrangler kv:namespace create "DA_MEDIA_CACHE"
npx wrangler kv:namespace create "DA_MEDIA_CACHE" --preview
```

Copy the generated IDs and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "DA_MEDIA_KV"
id = "your-generated-id"
preview_id = "your-preview-id"

[[kv_namespaces]]
binding = "DA_MEDIA_CACHE"
id = "your-cache-id"
preview_id = "your-cache-preview-id"
```

### 2. Create D1 Database

```bash
npx wrangler d1 create da-media-library
```

Copy the database ID and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DA_MEDIA_DB"
database_name = "da-media-library"
database_id = "your-database-id"
```

### 3. Create R2 Buckets

```bash
npx wrangler r2 bucket create da-media-models
npx wrangler r2 bucket create da-media-cache
```

### 4. Apply Database Schema

```bash
npx wrangler d1 migrations apply da-media-library --local
npx wrangler d1 migrations apply da-media-library
```

## Infrastructure Components

### KV Namespaces

| Namespace | Purpose | Storage Limit |
|-----------|---------|---------------|
| `DA_MEDIA_KV` | Asset metadata, AI analysis results | 1GB (free) |
| `DA_MEDIA_CACHE` | Search results, recommendations cache | 1GB (free) |

### D1 Database

| Table | Purpose |
|-------|---------|
| `asset_metadata` | Core asset information and AI analysis |
| `user_interactions` | User behavior tracking for learning |
| `usage_patterns` | Learned patterns for recommendations |
| `asset_usage` | Usage analytics and tracking |
| `document_contexts` | Document analysis for context-aware recommendations |
| `asset_removals` | Asset removal tracking (decision matrix) |
| `search_queries` | Search analytics and learning |

### R2 Buckets

| Bucket | Purpose | Usage |
|--------|---------|-------|
| `da-media-models` | ML models, embeddings | AI processing |
| `da-media-cache` | Large cache objects, processed assets | Performance optimization |

## Environment Configuration

### Development

```bash
# Local development
npm run dev

# Apply database migrations locally
npm run db:local
```

### Production

```bash
# Deploy to production
npm run deploy

# Apply production database migrations
npm run db:migrate
```

## Cost Estimation

### Free Tier Limits (Sufficient for POC)

- **Workers**: 100K requests/day
- **KV**: 1GB storage, 100K reads/day, 1K writes/day
- **D1**: 5GB storage, 25M rows read/day
- **R2**: 10GB storage, 1M Class A operations/month
- **AI**: 10K requests/day (beta)

**Total POC Cost**: $0/month

### Professional Usage (Estimated)

- **Workers**: $5/month + $0.50/million requests
- **KV**: $0.50/GB + $0.50/million reads
- **D1**: $5/month + $1/million rows
- **R2**: $0.015/GB + $4.50/million requests
- **AI**: ~$0.01/1K requests

**Estimated Monthly**: $50-200 for medium usage

## Security Configuration

### Environment Variables

The worker uses these environment variables (configured in wrangler.toml):
- `AI_PROVIDER=cloudflare` - Uses Cloudflare AI
- `ENVIRONMENT=development` - Environment setting  
- `LOG_LEVEL=info` - Logging level

### Access Control

The plugin inherits DA's authentication:
- ✅ Org/repo access control
- ✅ User permission inheritance
- ✅ Tenant isolation by DA tokens

## Testing the Setup

### 1. Verify Services

```bash
# Check KV namespaces
npx wrangler kv:key list --namespace-id YOUR_KV_ID

# Check D1 database
npx wrangler d1 query da-media-library "SELECT name FROM sqlite_master WHERE type='table'"

# Check R2 buckets
npx wrangler r2 bucket list
```

### 2. Test Worker Deployment

```bash
# Deploy and test
npx wrangler deploy
curl https://your-worker.your-subdomain.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "worker": "running",
    "ai": "available",
    "kv": "available",
    "d1": "available",
    "r2": "available"
  },
  "checks": {
    "kv": { "status": "healthy", "message": "KV accessible" },
    "d1": { "status": "healthy", "message": "D1 accessible" }
  },
  "responseTime": 42
}
```

## Troubleshooting

### Common Issues

#### 1. Authentication Failed
```bash
npx wrangler logout
npx wrangler login
```

#### 2. Database Migration Failed
```bash
# Check database exists
npx wrangler d1 list

# Manual migration
npx wrangler d1 query da-media-library "$(cat database/migrations/0001_initial_schema.sql)"
```

#### 3. KV Namespace Not Found
```bash
# Verify namespace exists
npx wrangler kv:namespace list

# Check wrangler.toml has correct IDs
```

#### 4. Worker Deployment Failed
```bash
# Check syntax
npm run lint

# Check dependencies
npm install

# Deploy with verbose logging
npx wrangler deploy --verbose
```

### Getting Help

1. **Cloudflare Docs**: [developers.cloudflare.com](https://developers.cloudflare.com)
2. **Wrangler CLI**: `npx wrangler --help`
3. **DA Media Library Issues**: Create issue in repository

## API Endpoints

Your deployed Cloudflare Worker exposes the following API endpoints. Replace `your-worker.workers.dev` with your actual Worker URL.

### Core Endpoints

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "worker": "running",
    "ai": "available",
    "kv": "available",
    "d1": "available",
    "r2": "available"
  },
  "checks": {
    "kv": { "status": "healthy", "message": "KV accessible" },
    "d1": { "status": "healthy", "message": "D1 accessible" }
  },
  "responseTime": 42
}
```

#### Get Images (Enhanced endpoint with quality filtering)
```http
GET /api/images
```

**Query Parameters:**
- `include_external=true` - Include external assets
- `quality=high|medium|low|all` - Filter by quality
- `priority=ai-recommended|high-priority` - AI-powered filtering
- `context=string` - Document context for recommendations
- `limit=50` - Number of results (default: 50, max: 200)
- `offset=0` - Pagination offset

**Response:**
```json
{
  "images": [
    {
      "id": "abc123def456",
      "displayName": "Hero Banner Image",
      "src": "/media_path/hero-banner.jpg",
      "dimensions": { "width": 1920, "height": 1080 },
      "aiAnalysis": {
        "description": "Professional hero banner with modern design",
        "confidence": 0.95,
        "tags": ["hero", "banner", "professional"]
      },
      "usageCount": 5,
      "lastSeen": "2024-01-01T12:00:00Z",
      "isExternal": false,
      "qualityScore": 85
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "qualityStats": {
    "total": 200,
    "afterQualityFilter": 150,
    "afterDeduplication": 150
  }
}
```

#### Get Analyzed Images Fast (Primary endpoint used by frontend)
```http
GET /api/analyzed-images-fast
```

**Response:**
```json
{
  "images": [
    {
      "id": "xyz789abc123",
      "displayName": "Product Screenshot",
      "src": "/media_path/product-demo.png",
      "dimensions": { "width": 1200, "height": 800 },
      "aiAnalysis": {
        "description": "Product interface screenshot showing key features",
        "confidence": 0.88
      },
      "usedInPages": [
        {
          "path": "/product-features",
          "context": "product-demo"
        }
      ],
      "isExternal": false,
      "usageCount": 3,
      "lastSeen": "2024-01-01T10:30:00Z"
    }
  ],
  "total": 75,
  "qualityInfo": {
    "totalScanned": 200,
    "highQualityFound": 100,
    "afterDeduplication": 75,
    "qualityThreshold": 70
  }
}
```

### External Assets Management

#### Get External Assets
```http
GET /api/external-assets?site=mysite&org=myorg
```

**Query Parameters:**
- `site` (required) - Site identifier
- `org` (required) - Organization identifier
- `clean=true` - Filter out junk assets (default: true)
- `min_quality=30` - Minimum quality score
- `group_by=domain|category|priority` - Grouping option

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalExternal": 45,
    "domains": 8,
    "highPriority": 12,
    "estimatedTotalSavings": 2500000,
    "averageQualityScore": 65
  },
  "externalAssets": [
    {
      "id": "ext_asset_123",
      "displayName": "Adobe Stock Photo",
      "src": "https://stock.adobe.com/images/photo.jpg",
      "domain": "stock.adobe.com",
      "category": "stock-photo",
      "qualityScore": 78,
      "migrationPriority": "high",
      "estimatedSavings": 150000,
      "qualityIssues": []
    }
  ],
  "insights": {
    "topDomains": ["stock.adobe.com", "unsplash.com"],
    "migrationRecommendations": "Focus on high-priority assets first"
  }
}
```

### Cleanup Operations

#### Preview Cleanup
```http
POST /api/cleanup/preview
```

**Request Body:**
```json
{
  "includeJunk": true,
  "includeLowQuality": true,
  "includeDuplicates": true,
  "qualityThreshold": 30,
  "maxPreview": 50
}
```

**Response:**
```json
{
  "message": "Found 25 assets for cleanup",
  "previewResults": {
    "totalScanned": 200,
    "junkAssets": [
      {
        "id": "junk_123",
        "displayName": "placeholder-image",
        "src": "/test/placeholder.jpg",
        "reason": "Contains junk indicator: placeholder",
        "estimatedSize": 1024
      }
    ],
    "lowQualityAssets": [],
    "duplicateAssets": [],
    "estimatedDeletions": 25,
    "estimatedStorageSaved": 25600
  },
  "recommendations": {
    "priorityActions": ["Remove junk assets first", "Review duplicates manually"]
  }
}
```

#### Clean Junk Assets
```http
POST /api/cleanup/junk-assets
```

**Request Body:**
```json
{
  "dryRun": false,
  "maxDeletions": 100,
  "batchSize": 20
}
```

**Response:**
```json
{
  "message": "Cleaned up 15 junk assets",
  "cleanupResults": {
    "scanned": 200,
    "junkFound": 20,
    "deleted": 15,
    "skipped": 5,
    "errors": [],
    "storageSaved": 15360
  }
}
```

### Context Analysis & AI Recommendations

#### Analyze Document Context
```http
POST /api/analyze-context
```

**Request Body:**
```json
{
  "path": "/blog/new-features",
  "title": "Introducing New Product Features",
  "content": "We're excited to announce several new features that will enhance your workflow...",
  "metadata": {
    "category": "blog",
    "tags": ["product", "features", "announcement"]
  }
}
```

**Response:**
```json
{
  "analysis": {
    "documentType": "blog",
    "contentTheme": "product feature announcement",
    "visualNeeds": ["hero", "feature-graphics", "product-shots"],
    "priority": "high",
    "confidence": 0.92,
    "aiPowered": true
  },
  "recommendations": [
    {
      "type": "hero",
      "description": "High-impact header images for visual appeal",
      "priority": "high",
      "searchTerms": ["hero", "banner", "header", "background"]
    }
  ],
  "priorityAssets": [
    {
      "id": "recommended_123",
      "displayName": "Product Feature Hero",
      "reason": "High relevance for product announcement",
      "confidence": 0.89
    }
  ]
}
```

#### Get Internal Assets
```http
GET /api/assets?org=myorg&repo=myrepo
```

**Query Parameters:**
- `org` - Organization identifier (default: 'da-sites')
- `repo` - Repository identifier (default: 'da-media')

**Response:**
```json
{
  "assets": [
    {
      "id": "internal_123",
      "name": "hero-image.jpg",
      "path": "/hero-image.jpg",
      "url": "/media_path/hero-image.jpg",
      "type": "image",
      "size": 125000,
      "lastModified": "2024-01-01T12:00:00Z",
      "altText": "hero-image.jpg",
      "dimensions": { "width": 1920, "height": 1080 }
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 50
}
```

#### Get Personalized Recommendations
```http
POST /api/personalized-recommendations
```

**Request Body:**
```json
{
  "userId": "user123",
  "documentContext": {
    "path": "/blog/new-features",
    "type": "blog"
  },
  "recentUsage": ["asset1", "asset2"]
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "id": "rec_asset_123",
      "displayName": "Recommended Hero Image",
      "reason": "Based on your recent blog usage patterns",
      "confidence": 0.85,
      "src": "/media_path/recommended-hero.jpg"
    }
  ],
  "aiPowered": true,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Coming Soon Endpoints

The following endpoints are planned but return "coming soon" responses:

- `GET /api/search` - Semantic search
- `POST /api/analyze` - Asset analysis
- `POST /api/track-usage` - Usage tracking
- `GET /api/usage-analytics` - Usage analytics
- `POST /api/da-webhook` - DA webhook integration
- `POST /api/analyze-image` - Image analysis
- `POST /api/upload-image` - Image upload
- `DELETE /api/analyzed-images/{id}` - Delete specific images
- `GET /api/analyzed-images` - Analyzed images (replaced by /api/images)
- `GET /api/get-analysis/*` - Get analysis data
- `POST /api/migrate-ids` - Migrate asset IDs
- `POST /api/migrate-to-12char` - Migrate to 12-character IDs
- `GET /api/migration-candidates` - Migration candidates
- `POST /api/import-external-asset` - Import external assets

## Frontend Integration

The frontend `da-media.js` currently uses:

1. **`/api/analyzed-images-fast`** - Primary asset loading endpoint (currently used by asset-loader.js)
2. **`/api/external-assets`** - External asset management (used by asset-manager.js)
3. **`/health`** - Service health checks

### Current Frontend Usage

```javascript
// Current implementation in asset-loader.js
const response = await fetch(`${this.apiEndpoint}/api/analyzed-images-fast`, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
});

// External assets loading in asset-manager.js  
const response = await fetch(`${this.apiEndpoint}/api/external-assets`);
```

### Available Enhanced Endpoints

```javascript
// Enhanced image loading with quality filtering
const response = await fetch(`${API_BASE}/api/images?include_external=true&quality=high`);
const data = await response.json();
console.log(`Loaded ${data.images.length} high-quality assets`);

// Get internal assets only
const internalResponse = await fetch(`${API_BASE}/api/assets?org=myorg&repo=myrepo`);
const internalData = await internalResponse.json();
console.log(`Found ${internalData.total} internal assets`);
```

## Next Steps

After infrastructure setup:

1. **Frontend Integration**: Set up the DA plugin in `/tools/media-library/`
2. **Configure API Endpoints**: Update frontend to use your Worker URLs
3. **Test Asset Processing**: Upload test assets to verify AI pipeline
4. **Monitor Usage**: Check Cloudflare dashboard for usage metrics

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                   DA Media Library Infrastructure            │
├─────────────────────────────────────────────────────────────┤
│  Workers (Edge Computing)                                   │
│  ├── API Gateway: your-worker.workers.dev                  │
│  ├── Asset Processor: Background AI analysis               │
│  └── Cleanup Scheduler: Automated maintenance              │
├─────────────────────────────────────────────────────────────┤
│  Storage                                                    │
│  ├── KV: Asset metadata & cache (1GB)                     │
│  ├── D1: Analytics & usage patterns (5GB)                 │
│  └── R2: ML models & large objects (10GB)                 │
├─────────────────────────────────────────────────────────────┤
│  AI Services                                               │
│  ├── Cloudflare AI: Edge processing (10K req/day)         │
│  └── External LLMs: Advanced analysis (optional)          │
└─────────────────────────────────────────────────────────────┘
```

This infrastructure provides the foundation for the AI-powered media library with global edge computing, intelligent caching, and scalable storage. 