-- DA Media Library Database Schema
-- Migration: 0001_initial_schema.sql

-- Asset metadata table for storing AI analysis and metadata
CREATE TABLE asset_metadata (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER,
  dimensions TEXT, -- JSON: {"width": 1920, "height": 1080}
  ai_analysis TEXT, -- JSON: AI analysis results
  tags TEXT, -- JSON array of tags
  categories TEXT, -- JSON array of categories
  similarity_hash TEXT, -- For duplicate detection
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active' -- active, inactive, broken, deleted
);

-- User interactions table for learning patterns
CREATE TABLE user_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL, -- view, select, insert, preview, reject
  context TEXT, -- JSON: document context, search query, etc.
  session_id TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  metadata TEXT -- JSON: additional interaction data
);

-- Usage patterns table for storing learned patterns
CREATE TABLE usage_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  pattern_type TEXT NOT NULL, -- user_preference, content_context, time_based, etc.
  pattern_data TEXT NOT NULL, -- JSON: pattern details
  confidence_score REAL DEFAULT 0.0,
  usage_count INTEGER DEFAULT 0,
  last_used TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Asset usage tracking for analytics
CREATE TABLE asset_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  document_path TEXT,
  usage_type TEXT, -- inserted, referenced, previewed
  user_id TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  metadata TEXT -- JSON: usage context
);

-- Document context analysis for recommendations
CREATE TABLE document_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  document_path TEXT NOT NULL,
  context_type TEXT, -- page_type, content_theme, industry, etc.
  context_data TEXT, -- JSON: extracted context information
  asset_recommendations TEXT, -- JSON: recommended asset IDs
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Asset removal tracking (for the removal decision matrix)
CREATE TABLE asset_removals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  removal_type TEXT NOT NULL, -- document_removal, da_deletion, cleanup_soft, cleanup_hard
  document_path TEXT, -- NULL for DA-level deletions
  reason TEXT, -- unused_timeout, broken_link, admin_action, etc.
  scheduled_for TEXT, -- For soft deletes with cleanup schedule
  metadata TEXT, -- JSON: additional removal context
  created_at TEXT DEFAULT (datetime('now'))
);

-- Search queries for learning and analytics
CREATE TABLE search_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_type TEXT, -- nlp, filter, similarity
  results_count INTEGER,
  selected_asset_id TEXT,
  document_context TEXT, -- JSON: context when query was made
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Performance indexes
CREATE INDEX idx_asset_tenant ON asset_metadata(tenant_id);
CREATE INDEX idx_asset_status ON asset_metadata(tenant_id, status);
CREATE INDEX idx_asset_updated ON asset_metadata(updated_at);
CREATE INDEX idx_asset_path ON asset_metadata(tenant_id, asset_path);

CREATE INDEX idx_interactions_user ON user_interactions(tenant_id, user_id);
CREATE INDEX idx_interactions_asset ON user_interactions(asset_id);
CREATE INDEX idx_interactions_time ON user_interactions(timestamp);
CREATE INDEX idx_interactions_type ON user_interactions(tenant_id, interaction_type);

CREATE INDEX idx_patterns_tenant ON usage_patterns(tenant_id);
CREATE INDEX idx_patterns_type ON usage_patterns(tenant_id, pattern_type);
CREATE INDEX idx_patterns_confidence ON usage_patterns(confidence_score);

CREATE INDEX idx_usage_asset ON asset_usage(tenant_id, asset_id);
CREATE INDEX idx_usage_document ON asset_usage(tenant_id, document_path);
CREATE INDEX idx_usage_time ON asset_usage(timestamp);

CREATE INDEX idx_contexts_document ON document_contexts(tenant_id, document_path);
CREATE INDEX idx_contexts_type ON document_contexts(tenant_id, context_type);

CREATE INDEX idx_removals_asset ON asset_removals(tenant_id, asset_id);
CREATE INDEX idx_removals_type ON asset_removals(tenant_id, removal_type);
CREATE INDEX idx_removals_scheduled ON asset_removals(scheduled_for);

CREATE INDEX idx_queries_user ON search_queries(tenant_id, user_id);
CREATE INDEX idx_queries_time ON search_queries(timestamp);

-- Views for common queries
CREATE VIEW active_assets AS
SELECT * FROM asset_metadata 
WHERE status = 'active';

CREATE VIEW asset_analytics AS
SELECT 
  am.id,
  am.tenant_id,
  am.asset_name,
  am.content_type,
  COUNT(au.id) as usage_count,
  MAX(au.timestamp) as last_used,
  COUNT(DISTINCT au.user_id) as unique_users
FROM asset_metadata am
LEFT JOIN asset_usage au ON am.id = au.asset_id
WHERE am.status = 'active'
GROUP BY am.id, am.tenant_id, am.asset_name, am.content_type;

-- Cleanup triggers for the Asset Removal Decision Matrix
CREATE TRIGGER asset_soft_delete_cleanup
AFTER INSERT ON asset_removals
WHEN NEW.removal_type = 'cleanup_soft' AND NEW.scheduled_for <= datetime('now')
BEGIN
  UPDATE asset_metadata 
  SET status = 'inactive', updated_at = datetime('now')
  WHERE id = NEW.asset_id AND tenant_id = NEW.tenant_id;
END; 