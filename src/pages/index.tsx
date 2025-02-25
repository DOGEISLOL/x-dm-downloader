import { type NextPage } from "next";
import Head from "next/head";
import { TwitterDMDownloader } from "~/components/TwitterDMDownloader";
const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Twitter DM Downloader</title>
        <meta name="description" content="Download your Twitter DMs" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
        <TwitterDMDownloader />
      </main>
    </>
  );
};

export default Home;
