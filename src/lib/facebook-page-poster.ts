// Facebook Business Page posting via Graph API

const FB_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

interface FbPostResult {
  success: boolean;
  postId?: string;
  permalink?: string;
  error?: string;
}

// Test if a page access token is valid and return page info
export async function testFbConnection(
  pageId: string,
  accessToken: string
): Promise<{ valid: boolean; pageName?: string; error?: string }> {
  try {
    const res = await fetch(
      `${FB_GRAPH_BASE}/${pageId}?fields=name,id&access_token=${accessToken}`
    );
    const data = await res.json();

    if (data.error) {
      return { valid: false, error: data.error.message };
    }

    return { valid: true, pageName: data.name };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

// Upload a single photo to the page (unpublished) and return its media ID
async function uploadPhoto(
  pageId: string,
  accessToken: string,
  photoUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(`${FB_GRAPH_BASE}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: photoUrl,
        published: false,
        access_token: accessToken,
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error('FB photo upload error:', data.error.message);
      return null;
    }

    return data.id;
  } catch (err: any) {
    console.error('FB photo upload failed:', err.message);
    return null;
  }
}

// Post to a Facebook Business Page with optional photos
export async function postToFacebookPage(
  pageId: string,
  accessToken: string,
  message: string,
  photoUrls: string[] = []
): Promise<FbPostResult> {
  try {
    // If we have photos, upload them first (unpublished), then attach to post
    if (photoUrls.length > 0) {
      // Limit to 5 photos to stay within timeout budget
      const photosToUpload = photoUrls.slice(0, 5);
      const mediaIds: string[] = [];

      for (const url of photosToUpload) {
        const mediaId = await uploadPhoto(pageId, accessToken, url);
        if (mediaId) {
          mediaIds.push(mediaId);
        }
        // Rate limit between uploads
        await new Promise((r) => setTimeout(r, 500));
      }

      if (mediaIds.length > 0) {
        // Create multi-photo post
        const attachedMedia = mediaIds.reduce(
          (acc, id, i) => {
            acc[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
            return acc;
          },
          {} as Record<string, string>
        );

        const params = new URLSearchParams({
          message,
          access_token: accessToken,
          ...attachedMedia,
        });

        const res = await fetch(`${FB_GRAPH_BASE}/${pageId}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        const data = await res.json();
        if (data.error) {
          return { success: false, error: data.error.message };
        }

        // Fetch permalink
        let permalink = '';
        try {
          const postRes = await fetch(
            `${FB_GRAPH_BASE}/${data.id}?fields=permalink_url&access_token=${accessToken}`
          );
          const postData = await postRes.json();
          permalink = postData.permalink_url || '';
        } catch {}

        return { success: true, postId: data.id, permalink };
      }
    }

    // Text-only post (no photos or all photo uploads failed)
    const res = await fetch(`${FB_GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        access_token: accessToken,
      }),
    });

    const data = await res.json();
    if (data.error) {
      return { success: false, error: data.error.message };
    }

    let permalink = '';
    try {
      const postRes = await fetch(
        `${FB_GRAPH_BASE}/${data.id}?fields=permalink_url&access_token=${accessToken}`
      );
      const postData = await postRes.json();
      permalink = postData.permalink_url || '';
    } catch {}

    return { success: true, postId: data.id, permalink };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
