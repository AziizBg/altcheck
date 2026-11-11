// Parse the RunaCapital/awesome-oss-alternatives README table (MIT) into a seed index.
// Row shape: Category|[Name](url)|Description|<a href=https://github.com/owner/repo>...|[Prop](url), [Prop2](url)

export function normalizeTool(name) {
  return String(name).toLowerCase().replace(/\.(com|io|so|app|ai|dev|net|org)$/, '').replace(/[^a-z0-9]+/g, '');
}

export function parseRunaReadme(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const repoMatch = line.match(/<a href=["']?https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?["'>\s]/);
    if (!repoMatch) continue;
    const cells = line.split('|');
    if (cells.length < 5) continue;
    const name = (cells[1].match(/\[([^\]]+)\]/) || [])[1];
    const alternativeTo = [...cells.slice(4).join('|').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    if (!name || alternativeTo.length === 0) continue;
    rows.push({
      name: name.trim(),
      repo: repoMatch[1],
      category: cells[0].trim(),
      description: cells[2].trim(),
      alternativeTo,
    });
  }
  return rows;
}

/** Build { normalizedToolName: [{name, repo, description}] } */
export function indexByTool(rows) {
  const index = {};
  for (const row of rows) {
    for (const tool of row.alternativeTo) {
      const key = normalizeTool(tool);
      if (!key) continue;
      (index[key] ||= []).push({ name: row.name, repo: row.repo, description: row.description });
    }
  }
  return index;
}
