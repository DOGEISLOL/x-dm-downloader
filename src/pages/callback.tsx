import { useEffect } from "react";

export default function TwitterCallback() {
    useEffect(() => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        window.opener.postMessage({ type: "TWITTER_OAUTH_CALLBACK", code }, "*");
        window.close();
      }
    }, []);
  
    return <div>Processing authentication...</div>;
  }