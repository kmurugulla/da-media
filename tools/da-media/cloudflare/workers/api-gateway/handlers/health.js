/**
 * Health Check Handler
 * Clean, focused handler following single responsibility principle
 */

import { createSuccessResponse, validateMethod, logRequest } from '../utils.js';

/**
 * Handle health check requests
 * @param {Request} request - The incoming request
 * @param {Object} env - Environment bindings
 * @returns {Response} Health status response
 */
/**
 * Handle health check requests
 */
export async function handleHealthCheck(request, env) {
  const startTime = Date.now();
  
  logRequest(request, { handler: 'health' });
  
  validateMethod(request, ['GET']);
  
  const services = {
    worker: 'running',
    ai: env.AI ? 'available' : 'unavailable',
    kv: env.DA_MEDIA_KV ? 'available' : 'unavailable',
    d1: env.DA_MEDIA_DB ? 'available' : 'unavailable',
    r2: env.DA_MEDIA_MODELS ? 'available' : 'unavailable'
  };
  
  const healthChecks = await performHealthChecks(env);
  
  const overallStatus = calculateOverallStatus(services, healthChecks);
  
  const responseData = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services,
    checks: healthChecks,
    responseTime: Date.now() - startTime
  };
  
  return createSuccessResponse(responseData, {
    headers: {
      'X-Health-Check': 'true',
      'Cache-Control': 'no-cache'
    }
  });
}

/**
 * Perform basic health checks on services
 */
async function performHealthChecks(env) {
  const checks = {
    kv: { status: 'unknown', message: 'Not tested' },
    d1: { status: 'unknown', message: 'Not tested' }
  };
  
  if (env.DA_MEDIA_KV) {
    try {
      await env.DA_MEDIA_KV.get('health-check-key');
      checks.kv = { status: 'healthy', message: 'KV accessible' };
    } catch (error) {
      checks.kv = { status: 'unhealthy', message: `KV error: ${error.message}` };
    }
  }
  
  if (env.DA_MEDIA_DB) {
    try {
      await env.DA_MEDIA_DB.prepare('SELECT 1').first();
      checks.d1 = { status: 'healthy', message: 'D1 accessible' };
    } catch (error) {
      checks.d1 = { status: 'unhealthy', message: `D1 error: ${error.message}` };
    }
  }
  
  return checks;
}

/**
 * Calculate overall health status based on service availability
 */
function calculateOverallStatus(services, healthChecks) {
  const criticalServices = ['worker', 'kv'];
  const criticalUnavailable = criticalServices.some(service => 
    services[service] === 'unavailable'
  );
  
  const healthChecksFailed = Object.values(healthChecks).some(check => 
    check.status === 'unhealthy'
  );
  
  if (criticalUnavailable || healthChecksFailed) {
    return 'degraded';
  }
  
  return 'healthy';
} 