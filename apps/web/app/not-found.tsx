import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="workspace">
      <div className="workspace-heading">
        <h1>Workspace not found</h1>
      </div>
      <p>This address does not identify a terminal workspace.</p>
      <Link href="/">Return to Dashboard</Link>
    </main>
  );
}
