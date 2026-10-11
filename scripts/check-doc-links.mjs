import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(name)));
    else if (entry.name.endsWith('.md')) files.push(name);
  }
  return files;
}

function withoutCode(text) {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (code) =>
    code.replace(/[^\n]/g, ' '),
  );
}

function headingIds(text) {
  const ids = new Set();
  const counts = new Map();
  for (const match of withoutCode(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s/g, '-');
    const count = counts.get(base) ?? 0;
    ids.add(count ? `${base}-${count}` : base);
    counts.set(base, count + 1);
  }
  return ids;
}

const files = [
  path.join(root, 'README.md'),
  ...(await markdownFiles(path.join(root, 'docs'))),
];
const errors = [];
let checked = 0;
for (const file of files) {
  const text = withoutCode(await readFile(file, 'utf8'));
  const links =
    /!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)|\bsrc="([^"]+)"|^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;
  for (const match of text.matchAll(links)) {
    const target = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (/^(https?:|mailto:)/i.test(target)) continue;
    const location = `${path.relative(root, file)}:${text.slice(0, match.index).split('\n').length}`;
    try {
      if (/^[a-z]+:|^[/\\]/i.test(target))
        throw new Error('not a repository-relative link');
      const [rawPath, rawAnchor] = target.split('#');
      const resolved = rawPath
        ? path.resolve(
            path.dirname(file),
            decodeURIComponent(rawPath.split('?')[0]),
          )
        : file;
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('outside repository');
      const info = await stat(resolved);
      if (rawAnchor && info.isFile() && resolved.endsWith('.md')) {
        const anchors = headingIds(await readFile(resolved, 'utf8'));
        if (!anchors.has(decodeURIComponent(rawAnchor)))
          throw new Error('heading not found');
      }
      checked++;
    } catch (error) {
      errors.push(
        `${location}: ${target} (${error.code === 'ENOENT' ? 'path not found' : error.message})`,
      );
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${checked} local links in ${files.length} Markdown documents.`,
  );
}
