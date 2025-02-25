import requests
import csv
import time
from datetime import datetime
import os
from dotenv import load_dotenv
from requests_oauthlib import OAuth1
load_dotenv()

def fetch_dms(auth):
    all_dms = []
    next_token = None
    
    while True:
        # Construct URL with pagination
        url = 'https://api.twitter.com/2/dm_events'
        params = {
            'dm_event.fields': 'id,text,created_at,sender_id,recipient_id',
            'max_results': 100  # Max allowed per request
        }
        
        if next_token:
            params['pagination_token'] = next_token
            
        response = requests.get(
            url,
            auth=auth,
            params=params
        )
        
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            print(response.json())
            break
            
        data = response.json()
        
        if 'data' in data:
            all_dms.extend(data['data'])
            
        # Check if there are more DMs to fetch
        if 'meta' in data and 'next_token' in data['meta']:
            next_token = data['meta']['next_token']
            # Add a small delay to avoid rate limits
            time.sleep(1)
        else:
            break
    
    return all_dms

def save_to_csv(dms, filename='twitter_dms.csv'):
    if not dms:
        print("No DMs to save")
        return
        
    # Get all possible keys from the DMs
    fieldnames = set()
    for dm in dms:
        fieldnames.update(dm.keys())
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=list(fieldnames))
        writer.writeheader()
        writer.writerows(dms)
    
    print(f"Saved {len(dms)} DMs to {filename}")

def main():
    # Create OAuth1 auth object
    auth = OAuth1(
        os.getenv("TWITTER_CLIENT_ID"),
        os.getenv("TWITTER_CLIENT_SECRET"),
        os.getenv("TWITTER_ACCESS_TOKEN"),
        os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
    )
    
    print("Fetching DMs...")
    dms = fetch_dms(auth)
    
    if dms:
        print(f"Found {len(dms)} DMs")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'twitter_dms_{timestamp}.csv'
        save_to_csv(dms, filename)
    else:
        print("No DMs found")

if __name__ == "__main__":
    main()