/**
 * API Router for DA Media Library
 * Clean route handling to replace massive if-else chain
 */

import { asyncHandler, createSuccessResponse, CONFIG } from './utils.js';

// Route definitions with handlers
const routes = new Map();

// Router class for clean route management
export class APIRouter {
  constructor() {
    this.routes = new Map();
    this.middlewares = [];
  }

  // Add middleware
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  // Register route with method and handler
  register(method, path, handler) {
    const key = `${method.toUpperCase()}:${path}`;
    this.routes.set(key, asyncHandler(handler));
    return this;
  }

  // Convenience methods for HTTP verbs
  get(path, handler) {
    return this.register('GET', path, handler);
  }

  post(path, handler) {
    return this.register('POST', path, handler);
  }

  put(path, handler) {
    return this.register('PUT', path, handler);
  }

  delete(path, handler) {
    return this.register('DELETE', path, handler);
  }

  // Match route with path parameters
  matchRoute(method, pathname) {
    // First try exact match
    const exactKey = `${method}:${pathname}`;
    if (this.routes.has(exactKey)) {
      return { handler: this.routes.get(exactKey), params: {} };
    }

    // Try pattern matching for parameterized routes
    for (const [routeKey, handler] of this.routes.entries()) {
      const [routeMethod, routePath] = routeKey.split(':');
      if (routeMethod !== method) continue;

      const params = this.extractParams(routePath, pathname);
      if (params !== null) {
        return { handler, params };
      }
    }

    return null;
  }

  // Extract parameters from parameterized routes
  extractParams(routePath, pathname) {
    // Handle routes like /api/analyzed-images/{id}
    if (routePath.includes('{') && routePath.includes('}')) {
      const routeParts = routePath.split('/');
      const pathParts = pathname.split('/');

      if (routeParts.length !== pathParts.length) return null;

      const params = {};
      for (let i = 0; i < routeParts.length; i++) {
        const routePart = routeParts[i];
        const pathPart = pathParts[i];

        if (routePart.startsWith('{') && routePart.endsWith('}')) {
          const paramName = routePart.slice(1, -1);
          params[paramName] = decodeURIComponent(pathPart);
        } else if (routePart !== pathPart) {
          return null;
        }
      }
      return params;
    }

    // Handle routes like /api/get-analysis/*
    if (routePath.endsWith('/*')) {
      const basePath = routePath.slice(0, -2);
      if (pathname.startsWith(basePath)) {
        return {
          wildcard: pathname.slice(basePath.length + 1)
        };
      }
    }

    return null;
  }

  // Handle incoming request
  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const { method } = request;
    const { pathname } = url;

    // Apply middlewares
    for (const middleware of this.middlewares) {
      const result = await middleware(request, env, ctx);
      if (result) return result; // Middleware handled the request
    }

    // Find matching route
    const match = this.matchRoute(method, pathname);
    
    if (match) {
      // Add params to request context
      request.params = match.params;
      return await match.handler(request, env, ctx);
    }

    // No route found - return API info
    if (pathname === '/' || pathname === '') {
      return this.getAPIInfo();
    }

    // 404 for unmatched routes
    return createSuccessResponse({
      error: 'Route not found',
      message: `No handler found for ${method} ${pathname}`,
      availableRoutes: Array.from(this.routes.keys())
    }, { status: CONFIG.HTTP_STATUS.NOT_FOUND });
  }

  // Get API information
  getAPIInfo() {
    const endpoints = Array.from(this.routes.keys()).map(key => {
      const [method, path] = key.split(':');
      return { method, path };
    });

    return createSuccessResponse({
      message: 'DA Media Library API',
      version: '2.0.0',
      status: 'healthy',
      endpoints,
      timestamp: new Date().toISOString()
    });
  }
}

// Create and configure the router
export function createRouter() {
  const router = new APIRouter();

  // Import handlers dynamically to avoid circular dependencies
  const handlers = {};

  // Health and basic endpoints
  router.get('/health', async (request, env) => {
    return createSuccessResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        ai: env.AI ? 'available' : 'unavailable',
        kv: env.DA_MEDIA_KV ? 'available' : 'unavailable',
        worker: 'running'
      }
    });
  });

  // Asset management endpoints
  router.get('/api/assets', (request, env) => handlers.handleAssetsRequest(request, env));
  router.get('/api/search', (request, env) => handlers.handleSearchRequest(request, env));
  router.post('/api/analyze', (request, env) => handlers.handleAnalyzeRequest(request, env));
  
  // Usage tracking
  router.post('/api/track-usage', (request, env) => handlers.handleUsageTracking(request, env));
  router.post('/api/analyze-context', (request, env) => handlers.handleContextAnalysis(request, env));
  router.get('/api/usage-analytics', (request, env) => handlers.handleUsageAnalytics(request, env));
  
  // Webhook handling
  router.post('/api/da-webhook', (request, env) => handlers.handleDAWebhook(request, env));
  
  // Image processing
  router.post('/api/analyze-image', (request, env) => handlers.handleImageAnalysis(request, env));
  router.post('/api/upload-image', (request, env) => handlers.handleImageUpload(request, env));
  
  // Content scanning
  router.post('/api/scan-preview-content', (request, env) => handlers.handlePreviewContentScan(request, env));
  router.get('/api/test-responsive-extraction', (request, env) => handlers.handleTestResponsiveExtraction(request, env));
  
  // Image management
  router.get('/api/analyzed-images', (request, env) => handlers.handleAnalyzedImagesRequest(request, env));
  router.get('/api/analyzed-images-fast', (request, env) => handlers.handleAnalyzedImagesFastRequest(request, env));
  router.delete('/api/analyzed-images/{id}', (request, env) => handlers.handleDeleteAnalyzedImages(request, env));
  
  // Analysis retrieval
  router.get('/api/get-analysis/*', (request, env) => handlers.handleGetAnalysis(request, env));
  
  // Migration endpoints
  router.post('/api/migrate-ids', (request, env) => handlers.handleIdMigration(request, env));
  router.post('/api/migrate-to-12char', (request, env) => handlers.handleBase62Migration(request, env));
  
  // External assets
  router.get('/api/external-assets', (request, env) => handlers.handleExternalAssetsRequest(request, env));
  router.get('/api/migration-candidates', (request, env) => handlers.handleMigrationCandidatesRequest(request, env));
  router.post('/api/import-external-asset', (request, env) => handlers.handleImportExternalAsset(request, env));

  // Phase 4: Data Cleanup Endpoints
  router.post('/api/cleanup/preview', (request, env) => handlers.handleCleanupPreview(request, env));
  router.post('/api/cleanup/junk-assets', (request, env) => handlers.handleCleanJunkAssets(request, env));
  router.post('/api/cleanup/low-quality', (request, env) => handlers.handleCleanLowQuality(request, env));
  router.post('/api/cleanup/duplicates', (request, env) => handlers.handleCleanDuplicates(request, env));
  router.get('/api/cleanup/analytics', (request, env) => handlers.handleCleanupAnalytics(request, env));

  // Set handlers reference (will be populated by main module)
  router.setHandlers = (handlerMap) => {
    Object.assign(handlers, handlerMap);
  };

  return router;
}

// Export configured router instance
export const router = createRouter(); 