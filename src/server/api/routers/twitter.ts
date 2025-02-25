import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import https from 'https';

function generateRandomState() {
  return Math.random().toString(36).substring(2, 15);
}

function generateCodeVerifier() {
  const length = 64;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function convertDMsToCSV(dms: any[], users: any[] = []) {
  console.log("Processing DMs for CSV conversion");
  
  // Create a map of user IDs to usernames for quick lookup
  const userMap = new Map();
  if (users && Array.isArray(users)) {
    users.forEach(user => {
      userMap.set(user.id, {
        username: user.username || '',
        name: user.name || ''
      });
    });
  }
  
  // Define the headers for our CSV
  const headers = [
    'id', 'created_at', 'sender_id', 'sender_username', 'sender_name',
    'recipient_id', 'recipient_username', 'recipient_name', 
    'text', 'dm_conversation_id'
  ];
  
  // Extract the relevant data from each DM
  const rows = dms.filter(dm => dm.event_type === 'MessageCreate').map(dm => {
    // For MessageCreate events with 2 participants
    if (dm.participant_ids && dm.participant_ids.length === 2) {
      const recipientId = dm.participant_ids.find((id: string) => id !== dm.sender_id) || '';
      
      // Get user info from the map
      const senderInfo = userMap.get(dm.sender_id) || { username: '', name: '' };
      const recipientInfo = userMap.get(recipientId) || { username: '', name: '' };
      
      return {
        id: dm.id || '',
        created_at: dm.created_at || '',
        sender_id: dm.sender_id || '',
        sender_username: senderInfo.username,
        sender_name: senderInfo.name,
        recipient_id: recipientId,
        recipient_username: recipientInfo.username,
        recipient_name: recipientInfo.name,
        text: dm.text ? dm.text.replace(/"/g, '""') : '', // Escape quotes for CSV
        dm_conversation_id: dm.dm_conversation_id || ''
      };
    }
    return null;
  }).filter(Boolean); // Remove null entries
  
  // Convert to CSV format
  const csvContent = [
    // Add the headers
    headers.join(','),
    // Add each row
    ...rows.map(row => headers.map(header => 
      `"${(row as any)[header] || ''}"`
    ).join(','))
  ].join('\n');
  
  return csvContent;
}

export const twitterRouter = createTRPCRouter({
  // Initialize OAuth flow
  getAuthUrl: publicProcedure.query(async () => {
    const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
    const REDIRECT_URI = process.env.TWITTER_REDIRECT_URI!;
    
    // Use the test values provided by Twitter
    const codeVerifier = '8KxxO-RPl0bLSxX5AWwgdiFbMnry_VOKzFeIlVA7NoA';
    const codeChallenge = 'y_SfRG4BmOES02uqWeIkIgLQAlTBggyf_G7uKT51ku8';
    
    console.log('Using test verifier:', codeVerifier);
    console.log('Using test challenge:', codeChallenge);
    
    const authUrl = `https://twitter.com/i/oauth2/authorize?` + 
      `response_type=code&` +
      `client_id=${TWITTER_CLIENT_ID}&` +
      `redirect_uri=${REDIRECT_URI}&` +
      `scope=dm.read%20dm.write%20tweet.read%20users.read%20offline.access&` +
      `state=${generateRandomState()}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`;
    
    return { authUrl, codeVerifier };
  }),

  // Handle OAuth callback and fetch DMs
  getDMs: publicProcedure
    .input(z.object({ 
      code: z.string(),
      codeVerifier: z.string()
    }))
    .mutation(async ({ input }) => {
      try {
        const token = await exchangeCodeForToken(input.code, input.codeVerifier);
        const response = await fetch('https://api.twitter.com/2/dm_events?max_results=100&event_types=MessageCreate&dm_event.fields=created_at,dm_conversation_id,participant_ids,sender_id,text&expansions=sender_id,participant_ids&user.fields=username,name,profile_image_url', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          console.error("DM fetch failed:", data);
          throw new Error(`Failed to fetch DMs: ${JSON.stringify(data)}`);
        }
        
        // Extract users from the includes section
        const users = data.includes?.users || [];
        
        // Fetch all DMs with pagination
        const allDMs = await fetchAllDMs(token);
        
        // Convert to CSV with user information
        const csvData = convertDMsToCSV(allDMs, users);
        
        return { csvData };
      } catch (error) {
        console.error("Error in getDMs:", error);
        throw error;
      }
    }),
});

// Helper function to fetch all DMs using pagination
async function fetchAllDMs(token: string) {
  try {
    let allDMs: any[] = [];
    let paginationToken: string | undefined = undefined;
    let hasMorePages = true;
    
    // Create fetch options with SSL verification disabled if needed
    const fetchOptions: RequestInit = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      // Add this to handle self-signed certificate issues on government/corporate networks
      // @ts-ignore - The 'agent' property exists but may not be in the TypeScript types
      agent: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? 
        new (require('https').Agent)({ rejectUnauthorized: false }) : 
        undefined
    };
    
    while (hasMorePages) {
      // Build the URL with pagination token if available
      let url = 'https://api.twitter.com/2/dm_events?max_results=100';
      url += '&event_types=MessageCreate'; // Only get MessageCreate events
      url += '&dm_event.fields=created_at,dm_conversation_id,participant_ids,sender_id,text';
      url += '&expansions=sender_id,participant_ids'; // Add expansions for user info
      url += '&user.fields=username,name,profile_image_url'; // Request user fields
      
      if (paginationToken) {
        url += `&pagination_token=${paginationToken}`;
      }
      
      console.log(`Fetching DMs with URL: ${url}`);
      
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("DM fetch failed:", errorText);
        throw new Error(`Failed to fetch DMs: ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        console.error("Unexpected DM response format:", data);
        throw new Error('Received invalid DM data format from Twitter');
      }
      
      // Add this page of DMs to our collection
      allDMs = [...allDMs, ...data.data];
      
      // Check if there are more pages
      if (data.meta && data.meta.next_token) {
        paginationToken = data.meta.next_token;
        console.log(`Found next page token: ${paginationToken}`);
      } else {
        hasMorePages = false;
        console.log("No more pages to fetch");
      }
      
      // Safety check - don't fetch too many pages
      if (allDMs.length > 10000) {
        console.log("Reached maximum DM count, stopping pagination");
        hasMorePages = false;
      }
    }
    
    console.log(`Total DMs fetched: ${allDMs.length}`);
    return allDMs;
  } catch (error) {
    console.error("Error in fetchAllDMs:", error);
    throw error;
  }
}

async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
  const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!;
  const REDIRECT_URI = process.env.TWITTER_REDIRECT_URI!;

  console.log("Exchanging code for token with params:", {
    code,
    codeVerifier,
    redirectUri: REDIRECT_URI
  });

  // Create fetch options with SSL verification disabled if needed
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }).toString(),
    // Add this to handle self-signed certificate issues on government/corporate networks
    // @ts-ignore - The 'agent' property exists but may not be in the TypeScript types
    agent: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? 
      new (require('https').Agent)({ rejectUnauthorized: false }) : 
      undefined
  };

  const response = await fetch('https://api.twitter.com/2/oauth2/token', fetchOptions);

  const data = await response.json();
  
  if (!response.ok) {
    console.error("Token exchange failed:", data);
    throw new Error(`Failed to exchange code: ${JSON.stringify(data)}`);
  }

  return data.access_token;
} 