#!/usr/bin/env node

/**
 * DA Media Library Infrastructure Setup Script
 *
 * This script automates the setup of Cloudflare infrastructure:
 * - KV namespaces for metadata and caching
 * - D1 database for analytics
 * - R2 buckets for models and cache
 * - Updates wrangler.toml with generated IDs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const WRANGLER_CONFIG = join(PROJECT_ROOT, 'wrangler.toml');

class CloudflareSetup {
  constructor() {
    this.config = {};
    // eslint-disable-next-line no-console
    this.log = (message) => console.log(`🔧 ${message}`);
    // eslint-disable-next-line no-console
    this.error = (message) => console.error(`❌ ${message}`);
    // eslint-disable-next-line no-console
    this.success = (message) => console.log(`✅ ${message}`);
  }

  async run() {
    try {
      this.log('Starting DA Media Library infrastructure setup...');

      // Check if wrangler is authenticated
      await this.checkAuth();

      // Create KV namespaces
      await this.createKVNamespaces();

      // Create D1 database
      await this.createD1Database();

      // Create R2 buckets
      await this.createR2Buckets();

      // Update wrangler.toml
      await this.updateWranglerConfig();

      // Create database schema
      await this.createDatabaseSchema();

      this.success('Infrastructure setup completed successfully!');
      this.log('Next steps:');
      this.log('1. Review the updated wrangler.toml file');
      this.log('2. Run "npm run deploy" to deploy the workers');
      this.log('3. Test the API endpoints');
    } catch (error) {
      this.error(`Setup failed: ${error.message}`);
      process.exit(1);
    }
  }

  async checkAuth() {
    this.log('Checking Wrangler authentication...');
    try {
      execSync('wrangler whoami', { stdio: 'pipe' });
      this.success('Wrangler is authenticated');
    } catch (error) {
      this.error('Wrangler is not authenticated. Run "wrangler login" first.');
      throw error;
    }
  }

  async createKVNamespaces() {
    this.log('Creating KV namespaces...');

    // Create main metadata namespace
    const kvResult = this.runWrangler('kv:namespace create "DA_MEDIA_KV"');
    const kvMatch = kvResult.match(/id = "([^"]+)"/);
    if (kvMatch) {
      this.config.DA_MEDIA_KV_ID = kvMatch[1];
      this.success(`Created DA_MEDIA_KV: ${this.config.DA_MEDIA_KV_ID}`);
    }

    // Create preview namespace
    const kvPreviewResult = this.runWrangler('kv:namespace create "DA_MEDIA_KV" --preview');
    const kvPreviewMatch = kvPreviewResult.match(/preview_id = "([^"]+)"/);
    if (kvPreviewMatch) {
      this.config.DA_MEDIA_KV_PREVIEW_ID = kvPreviewMatch[1];
    }

    // Create cache namespace
    const cacheResult = this.runWrangler('kv:namespace create "DA_MEDIA_CACHE"');
    const cacheMatch = cacheResult.match(/id = "([^"]+)"/);
    if (cacheMatch) {
      this.config.DA_MEDIA_CACHE_ID = cacheMatch[1];
      this.success(`Created DA_MEDIA_CACHE: ${this.config.DA_MEDIA_CACHE_ID}`);
    }

    // Create cache preview namespace
    const cachePreviewResult = this.runWrangler('kv:namespace create "DA_MEDIA_CACHE" --preview');
    const cachePreviewMatch = cachePreviewResult.match(/preview_id = "([^"]+)"/);
    if (cachePreviewMatch) {
      this.config.DA_MEDIA_CACHE_PREVIEW_ID = cachePreviewMatch[1];
    }
  }

  async createD1Database() {
    this.log('Creating D1 database...');

    const d1Result = this.runWrangler('d1 create da-media-library');
    const d1Match = d1Result.match(/database_id = "([^"]+)"/);
    if (d1Match) {
      this.config.DA_MEDIA_DB_ID = d1Match[1];
      this.success(`Created D1 database: ${this.config.DA_MEDIA_DB_ID}`);
    }
  }

  async createR2Buckets() {
    this.log('Creating R2 buckets...');

    try {
      this.runWrangler('r2 bucket create da-media-models');
      this.success('Created R2 bucket: da-media-models');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      this.log('R2 bucket da-media-models already exists');
    }

    try {
      this.runWrangler('r2 bucket create da-media-cache');
      this.success('Created R2 bucket: da-media-cache');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      this.log('R2 bucket da-media-cache already exists');
    }
  }

  async updateWranglerConfig() {
    this.log('Updating wrangler.toml configuration...');

    let config = readFileSync(WRANGLER_CONFIG, 'utf8');

    // Update KV namespace IDs
    if (this.config.DA_MEDIA_KV_ID) {
      config = config.replace(
        /(\[\[kv_namespaces\]\]\nbinding = "DA_MEDIA_KV"\nid = "")[^"]*(")/,
        `$1${this.config.DA_MEDIA_KV_ID}$2`,
      );
      config = config.replace(
        /(binding = "DA_MEDIA_KV"[\s\S]*?preview_id = "")[^"]*(")/,
        `$1${this.config.DA_MEDIA_KV_PREVIEW_ID}$2`,
      );
    }

    if (this.config.DA_MEDIA_CACHE_ID) {
      config = config.replace(
        /(\[\[kv_namespaces\]\]\nbinding = "DA_MEDIA_CACHE"\nid = "")[^"]*(")/,
        `$1${this.config.DA_MEDIA_CACHE_ID}$2`,
      );
      config = config.replace(
        /(binding = "DA_MEDIA_CACHE"[\s\S]*?preview_id = "")[^"]*(")/,
        `$1${this.config.DA_MEDIA_CACHE_PREVIEW_ID}$2`,
      );
    }

    // Update D1 database ID
    if (this.config.DA_MEDIA_DB_ID) {
      config = config.replace(
        /(database_id = "")[^"]*(")/,
        `$1${this.config.DA_MEDIA_DB_ID}$2`,
      );
    }

    writeFileSync(WRANGLER_CONFIG, config);
    this.success('Updated wrangler.toml with generated IDs');
  }

  async createDatabaseSchema() {
    this.log('Creating database schema...');

    try {
      this.runWrangler('d1 migrations apply da-media-library --local');
      this.success('Applied database schema locally');
    } catch (error) {
      this.log('Note: Run database migrations manually after deployment');
    }
  }

  runWrangler(command) {
    try {
      const result = execSync(`wrangler ${command}`, {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
      return result;
    } catch (error) {
      this.error(`Wrangler command failed: ${command}`);
      this.error(error.message);
      throw error;
    }
  }
}

// Run the setup
const setup = new CloudflareSetup();
setup.run();
