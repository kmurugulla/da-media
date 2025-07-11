/**
 * Image Proxy Handler
 * Fetches external images to bypass browser CORS restrictions during local development.
 * This should only be used for local development and not exposed in production.
 */
export async function handleProxyRequest(request, env) {
  // This proxy is for development only
  if (env.WORKER_ENV !== 'development') {
    return new Response('Proxy is disabled in this environment.', { status: 403 });
  }

  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new Response('Missing "url" query parameter', { status: 400 });
  }

  try {
    // Validate that the provided URL is a valid URL
    // eslint-disable-next-line no-new
    new URL(imageUrl);
  } catch (e) {
    return new Response('Invalid "url" query parameter', { status: 400 });
  }

  try {
    // Fetch the image from the external URL
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'DA-Media-Library-Proxy/1.0',
      },
    });

    // Create a new response with the image data and headers
    const response = new Response(imageResponse.body, imageResponse);

    // Set CORS headers to allow the browser on localhost to display the image
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;
  } catch (error) {
    return new Response(`Failed to fetch image from ${imageUrl}: ${error.message}`, { status: 500 });
  }
}
