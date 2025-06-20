/**
 * Context Analysis Handler - AI-Powered Predictive Asset Recommendations
 * Analyzes document context to provide intelligent asset suggestions
 */

import {
  validateMethod, createSuccessResponse, createErrorResponse, CONFIG,
} from '../utils.js';

export async function handleContextAnalysis(request, env) {
  validateMethod(request, ['POST']);

  try {
    const {
      path, title, content, metadata,
    } = await request.json();

    if (!env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available', {
        status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const analysis = await performContextAnalysis({
      path, title, content, metadata,
    }, env);
    const recommendations = await generateAssetRecommendations(analysis);
    const priorityAssets = await getPriorityAssets(analysis, env);

    return createSuccessResponse({
      analysis,
      recommendations,
      priorityAssets,
      aiPowered: !!env.AI,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse('Context analysis failed', {
      error: error.message,
      status: CONFIG.HTTP_STATUS.INTERNAL_ERROR,
    });
  }
}

async function performContextAnalysis(context, env) {
  const {
    path, title, content, metadata,
  } = context;

  let aiAnalysis = null;

  if (env.AI) {
    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
        prompt: `Analyze this document context and suggest relevant media assets:

Title: "${title}"
Path: "${path}"
Content: "${content?.substring(0, 500) || 'No content'}"

Based on this document, what types of media assets would be most relevant?
Consider:
- Document type (blog, product page, landing page, etc.)
- Content theme and topic
- Visual needs (hero images, thumbnails, icons, etc.)

Respond with JSON:
{
  "documentType": "blog|product|landing|about|team|etc",
  "contentTheme": "brief description of main theme",
  "visualNeeds": ["hero", "thumbnail", "icon", "background", "etc"],
  "priority": "high|medium|low",
  "confidence": 0.0-1.0
}`,
      });

      aiAnalysis = JSON.parse(aiResponse.response || '{}');
    } catch (aiError) {
      // eslint-disable-next-line no-console
      console.warn('AI analysis failed, using fallback:', aiError);
    }
  }

  const fallbackAnalysis = detectDocumentType(title, path, content);

  return {
    documentType: aiAnalysis?.documentType || fallbackAnalysis.documentType,
    contentTheme: aiAnalysis?.contentTheme || fallbackAnalysis.contentTheme,
    visualNeeds: aiAnalysis?.visualNeeds || fallbackAnalysis.visualNeeds,
    priority: aiAnalysis?.priority || fallbackAnalysis.priority,
    confidence: aiAnalysis?.confidence || fallbackAnalysis.confidence,
    aiPowered: !!aiAnalysis,
    context: {
      path,
      title,
      contentLength: content?.length || 0,
      hasMetadata: !!metadata,
    },
  };
}

function detectDocumentType(title, path, content) {
  const titleLower = title?.toLowerCase() || '';
  const pathLower = path?.toLowerCase() || '';
  const contentLower = content?.toLowerCase() || '';

  let documentType = 'general';
  let contentTheme = 'general content';
  let visualNeeds = ['hero', 'thumbnail'];
  let priority = 'medium';
  let confidence = 0.6;

  if (pathLower.includes('blog') || titleLower.includes('blog')) {
    documentType = 'blog';
    contentTheme = 'blog article or post';
    visualNeeds = ['hero', 'thumbnail', 'inline-graphics'];
    priority = 'high';
    confidence = 0.8;
  } else if (pathLower.includes('product') || titleLower.includes('product')) {
    documentType = 'product';
    contentTheme = 'product showcase or feature';
    visualNeeds = ['hero', 'product-shots', 'feature-icons'];
    priority = 'high';
    confidence = 0.8;
  } else if (pathLower.includes('team') || titleLower.includes('team') || contentLower.includes('team')) {
    documentType = 'team';
    contentTheme = 'team or people focused';
    visualNeeds = ['team-photos', 'headshots', 'group-photos'];
    priority = 'high';
    confidence = 0.9;
  } else if (pathLower.includes('about') || titleLower.includes('about')) {
    documentType = 'about';
    contentTheme = 'company or personal information';
    visualNeeds = ['hero', 'team-photos', 'office-photos'];
    priority = 'medium';
    confidence = 0.7;
  } else if (pathLower.includes('landing') || titleLower.includes('landing')) {
    documentType = 'landing';
    contentTheme = 'landing page or marketing';
    visualNeeds = ['hero', 'feature-graphics', 'cta-images'];
    priority = 'high';
    confidence = 0.8;
  }

  return {
    documentType, contentTheme, visualNeeds, priority, confidence,
  };
}

async function generateAssetRecommendations(analysis) {
  const recommendations = [];

  const { documentType, visualNeeds } = analysis;

  visualNeeds.forEach((need) => {
    switch (need) {
      case 'hero':
        recommendations.push({
          type: 'hero',
          description: 'High-impact header images for visual appeal',
          priority: 'high',
          searchTerms: ['hero', 'banner', 'header', 'background'],
        });
        break;
      case 'thumbnail':
        recommendations.push({
          type: 'thumbnail',
          description: 'Compact preview images for cards and listings',
          priority: 'medium',
          searchTerms: ['thumbnail', 'preview', 'card', 'small'],
        });
        break;
      case 'team-photos':
        recommendations.push({
          type: 'team',
          description: 'Professional team and people photos',
          priority: 'high',
          searchTerms: ['team', 'people', 'professional', 'headshot'],
        });
        break;
      case 'product-shots':
        recommendations.push({
          type: 'product',
          description: 'Product showcase and feature highlights',
          priority: 'high',
          searchTerms: ['product', 'feature', 'showcase', 'demo'],
        });
        break;
      case 'icons':
        recommendations.push({
          type: 'icon',
          description: 'Small graphics for features and navigation',
          priority: 'low',
          searchTerms: ['icon', 'graphic', 'symbol', 'ui'],
        });
        break;
    }
  });

  if (documentType === 'blog') {
    recommendations.push({
      type: 'inline-graphics',
      description: 'Supporting graphics for article content',
      priority: 'medium',
      searchTerms: ['graphic', 'illustration', 'diagram', 'chart'],
    });
  }

  return recommendations;
}

async function getPriorityAssets(analysis, env) {
  try {
    const allImagesKey = 'all_analyzed_images_v3';
    const imagesData = await env.DA_MEDIA_KV.get(allImagesKey);

    if (!imagesData) {
      return [];
    }

    const images = JSON.parse(imagesData);
    const { visualNeeds, documentType } = analysis;

    const scoredAssets = images.map((asset) => {
      let relevanceScore = 0;

      const name = asset.displayName?.toLowerCase() || '';
      const tags = asset.detectedTags || [];

      visualNeeds.forEach((need) => {
        if (name.includes(need) || tags.some((tag) => tag.includes(need))) {
          relevanceScore += 30;
        }
      });

      if (documentType === 'blog') {
        if (name.includes('hero') || name.includes('banner')) relevanceScore += 25;
        if (name.includes('poster') || name.includes('thumbnail')) relevanceScore += 20;
      } else if (documentType === 'team') {
        if (name.includes('team') || name.includes('people')) relevanceScore += 30;
        if (name.includes('professional') || name.includes('headshot')) relevanceScore += 25;
      } else if (documentType === 'product') {
        if (name.includes('product') || name.includes('feature')) relevanceScore += 30;
        if (name.includes('demo') || name.includes('showcase')) relevanceScore += 25;
      }

      if (asset.usageCount > 0) relevanceScore += Math.min(asset.usageCount * 5, 20);
      if (asset.qualityScore > 70) relevanceScore += 15;
      if (!asset.isExternal) relevanceScore += 10;

      return {
        ...asset,
        relevanceScore,
        recommendationReason: getRecommendationReason(asset, analysis),
      };
    });

    return scoredAssets
      .filter((asset) => asset.relevanceScore > 20)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 8);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Priority assets generation failed:', error);
    return [];
  }
}

function getRecommendationReason(asset, analysis) {
  const name = asset.displayName?.toLowerCase() || '';
  const { documentType, visualNeeds } = analysis;

  if (documentType === 'blog' && (name.includes('hero') || name.includes('banner'))) {
    return 'Perfect for blog headers';
  } if (documentType === 'team' && (name.includes('team') || name.includes('people'))) {
    return 'Great for team pages';
  } if (documentType === 'product' && (name.includes('product') || name.includes('feature'))) {
    return 'Ideal for product showcase';
  } if (visualNeeds.includes('hero') && (name.includes('hero') || name.includes('background'))) {
    return 'High-impact visual';
  } if (asset.usageCount > 2) {
    return 'Popular choice';
  } if (asset.qualityScore > 80) {
    return 'High quality asset';
  }
  return 'Contextually relevant';
}

export async function handlePersonalizedRecommendations(request, _env) {
  validateMethod(request, ['POST']);

  try {
    const { usageData } = await request.json();

    if (!_env.DA_MEDIA_KV) {
      return createErrorResponse('KV storage not available');
    }

    const recommendations = await generatePersonalizedRecommendations(usageData);

    return createSuccessResponse({
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorResponse('Personalized recommendations failed', {
      error: error.message,
    });
  }
}

async function generatePersonalizedRecommendations(usageData) {
  try {
    // if (!_env.DA_MEDIA_KV) return [];

    const userPattern = usageData.context?.documentType || 'general';
    const searchQuery = usageData.session?.searchQuery;

    const recommendations = [];

    if (searchQuery) {
      if (searchQuery.includes('hero')) {
        recommendations.push('banner images', 'background images');
      }
      if (searchQuery.includes('team')) {
        recommendations.push('professional headshots', 'group photos');
      }
      if (searchQuery.includes('product')) {
        recommendations.push('feature highlights', 'product demos');
      }
    }

    if (userPattern.includes('blog')) {
      recommendations.push('article headers', 'inline graphics');
    } else if (userPattern.includes('product')) {
      recommendations.push('product shots', 'feature icons');
    }

    return recommendations.slice(0, 3);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Recommendation generation failed:', error);
    return [];
  }
}
