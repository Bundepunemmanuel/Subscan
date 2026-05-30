import Head from "next/head";
import Link from "next/link";
export default function NotFound() {
  return (
    <>
      <Head><title>Not Found — SubScan</title><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>
      <div className="page">
        <div className="banner">Kairo monitors pain signals 24/7 automatically before your competitors do.&nbsp;<a href="https://kairo-app.carrd.co" target="_blank" rel="noopener noreferrer">Join the waitlist →</a></div>
        <main style={{flex:1}}>
          <div className="nf-wrap">
            <div className="nf-code">404</div>
            <h2>Page not found</h2>
            <p>This page doesn't exist — but the pain signals do.</p>
            <Link href="/" className="back-btn">← Back to SubScan</Link>
          </div>
        </main>
        <footer className="footer">Built for SaaS founders · Powered by Reddit &amp; AI</footer>
      </div>
    </>
  );
}
