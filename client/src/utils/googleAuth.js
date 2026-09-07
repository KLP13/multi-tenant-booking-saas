/**
 * Google Identity Services Integration
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '936320744316-j33ff2epcru2fe9jscb83vv3bcbreo6n.apps.googleusercontent.com';

/**
 * Triggers the official Google OAuth popup (accounts.google.com)
 * Returns { email, name, picture, sub } of the selected Google account.
 */
export function triggerGoogleOAuth() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script is still loading. Please try again in a moment.'));
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          try {
            // Fetch Google user profile using access token
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` },
            });

            if (!res.ok) {
              throw new Error('Failed to fetch user details from Google');
            }

            const profile = await res.json();
            resolve({
              email: profile.email,
              name: profile.name || profile.email.split('@')[0],
              picture: profile.picture,
              sub: profile.sub,
            });
          } catch (err) {
            reject(err);
          }
        },
      });

      // Opens the official Google Account Chooser popup
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      reject(err);
    }
  });
}
