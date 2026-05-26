/**
 * Alias for Canva OAuth callback. Some Canva app configs use `/api/auth/callback`.
 * Keep `CANVA_REDIRECT_URI` identical to the URL registered in the Canva developer portal.
 */
export { GET, runtime } from '../../canva/oauth/callback/route';
