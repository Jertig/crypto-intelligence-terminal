import { notFound } from 'next/navigation';
import { TerminalShell } from '../../components/terminal-shell';
import { destinations, findWorkspace } from '../../lib/navigation';

export function generateStaticParams() {
  return destinations
    .filter((entry) => entry.id !== 'dashboard')
    .map((entry) => ({ workspace: entry.id }));
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (!findWorkspace(workspace) || workspace === 'dashboard') notFound();
  return <TerminalShell workspace={workspace} />;
}
