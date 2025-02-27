# Download Twitter DMs

## How to use
- Create a .env file with the following fields:
    - TWITTER_CLIENT_ID=<twitter_client_id>
    - TWITTER_CLIENT_SECRET=<twitter_client_secret>
    - TWITTER_REDIRECT_URI=http://localhost:3000/callback
    - NODE_TLS_REJECT_UNAUTHORIZED=0
- Install packages with `npm install`
- Run `npm run dev`
- Navigate to `localhost:3000`, and click on the button to download a CSV of the DMs.

