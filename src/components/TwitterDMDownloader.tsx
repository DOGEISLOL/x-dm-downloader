import { useState } from "react";
import { api } from "~/utils/api";

function downloadCSV(data: string, filename: string) {
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function TwitterDMDownloader() {
  const [isLoading, setIsLoading] = useState(false);
  
  const { mutateAsync: getDMs } = api.twitter.getDMs.useMutation();
  const { data: authUrlData } = api.twitter.getAuthUrl.useQuery();

  const handleAuth = async () => {
    if (!authUrlData?.authUrl) return;
    
    const popup = window.open(
      authUrlData.authUrl,
      "Twitter Auth",
      "width=600,height=600"
    );

    // Create the event listener function
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "TWITTER_OAUTH_CALLBACK") {
        // Remove the event listener first to prevent multiple calls
        window.removeEventListener("message", handleMessage);
        
        setIsLoading(true);
        try {
          const { csvData } = await getDMs({ 
            code: event.data.code,
            codeVerifier: authUrlData.codeVerifier
          });
          downloadCSV(csvData, "twitter-dms.csv");
        } catch (error) {
          console.error("Error fetching DMs:", error);
          alert("Failed to fetch DMs. Please try again.");
        } finally {
          setIsLoading(false);
        }
      }
    };

    // Add the event listener
    window.addEventListener("message", handleMessage);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleAuth}
        disabled={isLoading}
        className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {isLoading ? "Downloading DMs..." : "Download Twitter DMs"}
      </button>
    </div>
  );
}