/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * DA Media Basic Utilities
 * Common utility functions inspired by DA Live patterns
 */

// Cache configuration
const CACHE_CONFIG = {
  PREFIX: 'da_media_basic_',
  TTL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Debounce function calls (from DA Live Utils)
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * Get item from localStorage cache (from DA Live Utils)
 */
function getFromCache(key, maxAge = CACHE_CONFIG.TTL) {
  try {
    const item = localStorage.getItem(`${CACHE_CONFIG.PREFIX}${key}`);
    if (!item) return null;

    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > maxAge) {
      localStorage.removeItem(`${CACHE_CONFIG.PREFIX}${key}`);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Set item in localStorage cache (from DA Live Utils)
 */
function setCache(key, data) {
  try {
    const item = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(`${CACHE_CONFIG.PREFIX}${key}`, JSON.stringify(item));
  } catch {
    // Ignore cache errors
  }
}

/**
 * Clear cache by key or all cache
 */
function clearCache(key = null) {
  try {
    if (key) {
      localStorage.removeItem(`${CACHE_CONFIG.PREFIX}${key}`);
    } else {
      const keys = Object.keys(localStorage);
      keys.forEach((storageKey) => {
        if (storageKey.startsWith(CACHE_CONFIG.PREFIX)) {
          localStorage.removeItem(storageKey);
        }
      });
    }
  } catch {
    // Ignore cache errors
  }
}

/**
 * Extract file extension from filename or URL
 */
function extractExtension(name) {
  if (!name || typeof name !== 'string') return '';
  const match = name.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / (k ** i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < week) return `${Math.floor(diff / day)}d ago`;
  if (diff < month) return `${Math.floor(diff / week)}w ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Validate URL format
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safely parse JSON with fallback
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    Object.keys(obj).forEach((key) => {
      clonedObj[key] = deepClone(obj[key]);
    });
    return clonedObj;
  }
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) break;

      const delay = baseDelay * (2 ** attempt);
      await new Promise((resolve) => { setTimeout(resolve, delay); });
    }
  }

  throw lastError;
}

/**
 * Create a promise that resolves after specified delay
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Extract org/repo from DA context (from DA Live Utils)
 */
function extractOrgRepo() {
  if (window.daSDK?.context?.org && window.daSDK?.context?.repo) {
    const { org, repo } = window.daSDK.context;
    return { org, repo };
  }

  const { hostname } = window.location;
  if (hostname.includes('aem.page') || hostname.includes('aem.live')) {
    const parts = hostname.split('--');
    if (parts.length >= 3) {
      const org = parts[2].split('.')[0];
      const repo = parts[1];
      if (org && repo) {
        return { org, repo };
      }
    }
  }

  const error = 'Unable to determine organization and repository. '
    + 'Please ensure you are running in a proper AEM environment.';
  throw new Error(error);
}

/**
 * Build AEM live URL from path and context
 */
function buildLiveUrl(path, context) {
  try {
    const { org, repo } = context || extractOrgRepo();
    const branch = 'main';

    let cleanPath = path || '';
    if (cleanPath.endsWith('.md')) {
      cleanPath = cleanPath.slice(0, -3);
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    if (cleanPath === '/index' || cleanPath === '/home') {
      cleanPath = '/';
    }

    return `https://${branch}--${repo}--${org}.aem.live${cleanPath}`;
  } catch (error) {
    // Error building live URL
    return '#';
  }
}

/**
 * Create utility functions factory
 */
function createUtils() {
  return {
    debounce,
    throttle,
    getFromCache,
    setCache,
    clearCache,
    extractExtension,
    formatFileSize,
    formatRelativeTime,
    isValidUrl,
    generateId,
    safeJsonParse,
    deepClone,
    retryWithBackoff,
    delay,
    extractOrgRepo,
    buildLiveUrl,
  };
}

export { createUtils };
