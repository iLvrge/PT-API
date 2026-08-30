'use strict';

/**
 * Google OAuth2 + Drive helpers shared by the documents module. A client is
 * built per request from the caller's tokens (never a shared mutable client -
 * the legacy module mutated one global oauth2Client across requests, mixing
 * users' credentials under concurrency).
 */

const { google } = require('googleapis');

const oauthClient = () =>
  new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_SECRET_KEY, process.env.REDIRECT_URL);

const clientFor = (accessToken, refreshToken) => {
  const client = oauthClient();
  const credentials = { scope: process.env.GOOGLE_SCOPE, access_token: accessToken };
  if (refreshToken !== undefined && refreshToken !== 'undefined') credentials.refresh_token = refreshToken;
  client.setCredentials(credentials);
  return client;
};

const exchangeCode = async (code) => {
  const { tokens } = await oauthClient().getToken(code);
  return tokens;
};

const userProfile = async (accessToken, refreshToken) => {
  const auth = clientFor(accessToken, refreshToken);
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const { data } = await oauth2.userinfo.v2.me.get({});
  return data || {};
};

const driveFor = (accessToken, refreshToken) =>
  google.drive({ version: 'v3', auth: clientFor(accessToken, refreshToken) });

module.exports = { exchangeCode, userProfile, driveFor };
