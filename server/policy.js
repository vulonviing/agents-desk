import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';

// The permission policy for sessions started from the office. Pure: no I/O, so it is easy to test.
// It runs on the server for every tool call the CLI does not pre-allow (via the approve MCP bridge),
// so a room's level is enforced here and not only in a prompt.
//
// level: 'plan'      → nothing is started from the office
//        'read-only' → reading and skills only; everything else is denied
//        'approve'   → reads are free, edits/commands/network need an approval card, dangerous ones are denied

export const SAFE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Skill', 'TodoWrite']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

// First words that are never run from the office, whatever the level.
const DENIED_COMMANDS = new Set([
  'ssh', 'scp', 'sftp', 'rsync', 'sudo', 'su', 'doas', 'systemctl', 'service', 'launchctl', 'ufw', 'iptables', 'ip6tables', 'nft',
  'reboot', 'shutdown', 'halt', 'poweroff', 'mkfs', 'dd', 'crontab', 'osascript', 'eval', 'exec', 'kill', 'killall', 'pkill', 'chown', 'mount', 'umount',
  // wrappers that run another command (they would hide it from the first-word checks)
  'env', 'nohup', 'command', 'builtin', 'xargs', 'timeout', 'busybox', 'nice', 'time', 'stdbuf', 'watch', 'setsid', 'script', 'expect', 'parallel',
]);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh']);

const SECRET_NAME = /^\.env(\..*)?$|^id_(rsa|ed25519|ecdsa)(\.pub)?$|\.(pem|key|p12|pfx)$|^credentials(\.json)?$|^\.netrc$|^\.npmrc$/i;

const PROTECTED_DIRS = new Set(['.git', '.ssh', '.aws', '.gnupg']);
const hasProtectedDir = (p) => String(p).split(/[\\/]+/).some((seg) => PROTECTED_DIRS.has(seg.toLowerCase()));

export const isSecretPath = (p) => typeof p === 'string' && (SECRET_NAME.test(basename(p)) || hasProtectedDir(p));

// The real location of a path (symlinks resolved), also when the file does not exist yet: its nearest existing ancestor is resolved.
export function realTarget(path) {
  let abs = resolve(path);
  const tail = [];
  while (!existsSync(abs) && dirname(abs) !== abs) { tail.unshift(basename(abs)); abs = dirname(abs); }
  try { abs = realpathSync.native(abs); } catch { /* keep the lexical path */ }
  return resolve(abs, ...tail);
}

const inside = (path, roots) => {
  const abs = realTarget(path);
  return roots.some((r) => { const root = realTarget(r); return abs === root || abs.startsWith(root + sep); });
};

// Splits a command line at shell operators; returns the segments' first words.
export function commandWords(command) {
  return String(command)
    .split(/&&|\|\||[;|&\n]/)
    .map((seg) => seg.trim().replace(/^(?:\w+=\S*\s+)+/, '').split(/\s+/)[0])
    .filter(Boolean)
    .map((w) => basename(w));
}

// Returns a reason when the command must never run, otherwise null. This is defence in depth: in `approve` rooms every
// command is also shown to the user, and in `read-only` rooms commands are not allowed at all. Anything that hides the
// real command word (quotes, escapes, expansion, wrappers) is refused instead of being parsed.
export function dangerousCommand(command) {
  const text = String(command);
  if (/`|\$\(|\$\{|<\(|>\(/.test(text)) return 'komut yerine koyma ($(), ${}, `` ya da <()) kullanılamaz';
  if (/\{[^}]*,[^}]*\}/.test(text)) return 'süslü parantez açılımı kullanılamaz';
  // quotes or backslashes inside a word can spell a denied command ("s'sh'", r\m): compare the unquoted form too
  const plain = text.replace(/\\(.)/g, '$1').replace(/['"]/g, '');
  for (const t of text === plain ? [text] : [text, plain]) {
    const bad = dangerousPlain(t);
    if (bad) return bad;
  }
  if (/(^|[;&|\n]\s*)\$/.test(text)) return 'değişkenle komut çalıştırılamaz';
  return null;
}

function dangerousPlain(text) {
  if (/\|\s*(?:sudo\s+)?(?:\S*\/)?(?:ba|z|da|k)?sh\b/.test(text)) return 'çıktıyı kabuğa yönlendirme (| sh) kullanılamaz';
  if (/>\s*\/(?:etc|usr|bin|sbin|System|Library|var|opt)\b/.test(text)) return 'sistem klasörlerine yazılamaz';
  for (const w of commandWords(text)) {
    if (DENIED_COMMANDS.has(w)) return `"${w}" ofisten çalıştırılamaz`;
    if (SHELLS.has(w) && /\s-[a-z]*c\b/.test(text)) return 'kabuk içinde komut (sh -c) kullanılamaz';
  }
  if (/\brm\b[^\n;|&]*\s(?:-[a-z]*[rf]|--recursive|--force|--no-preserve-root)/i.test(text)) return 'rm -r / rm -f kullanılamaz';
  if (/\bfind\b[^\n;|&]*\s-(?:exec|execdir|ok|delete)\b/.test(text)) return 'find -exec / -delete kullanılamaz';
  // git: skip global options (-C dir, -c k=v, --git-dir=…) before the subcommand
  if (/\bgit\b(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*\s+(?:(?:push|remote|config|rebase|filter-branch|update-ref)\b|reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--)/.test(text)) return 'bu git işlemi ofisten yapılamaz';
  return null;
}

const clip = (s, n = 300) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// ctx: { level, roots: absolute paths the session may touch (project + embedded repos) }
// Returns { behavior: 'allow' | 'deny' | 'ask', reason, summary }.
export function decide(ctx, tool, input = {}) {
  const { level } = ctx;
  const roots = ctx.roots.map((r) => resolve(r));
  const deny = (reason, summary = tool) => ({ behavior: 'deny', reason, summary });
  const path = input.file_path ?? input.notebook_path ?? input.path;

  if (level === 'plan') return deny('Bu odanın seviyesi "plan": ofisten hiçbir şey çalıştırılmaz.');

  if (SAFE_TOOLS.has(tool)) {
    if (typeof path === 'string') {
      if (isSecretPath(path) || isSecretPath(realTarget(path))) return deny('Gizli bilgi dosyaları okunamaz (.env, anahtarlar, .git, .ssh).', `${tool}: ${basename(path)}`);
      if (!inside(path, roots)) return deny('Proje klasörünün dışına erişilemez.', `${tool}: ${clip(path, 120)}`);
    }
    return { behavior: 'allow', reason: 'okuma', summary: tool === 'Skill' ? `Skill: ${clip(input.skill, 80)}` : `${tool}${path ? `: ${basename(path)}` : ''}` };
  }
  if (level !== 'approve') return deny(`Bu odanın seviyesi "${level}": ${tool} kapalı.`);

  if (EDIT_TOOLS.has(tool)) {
    if (typeof path !== 'string') return deny('Dosya yolu belirsiz.');
    if (!inside(path, roots)) return deny('Proje klasörünün dışına yazılamaz.', `${tool}: ${clip(path, 120)}`);
    if (isSecretPath(path) || isSecretPath(realTarget(path))) return deny('Gizli bilgi dosyalarına yazılamaz.', `${tool}: ${basename(path)}`);
    if (hasProtectedDir(path) || hasProtectedDir(realTarget(path))) return deny('.git, .ssh ve .aws gibi klasörlere yazılamaz.', `${tool}: ${clip(path, 120)}`);
    return { behavior: 'ask', reason: 'dosya yazma', summary: `${tool}: ${clip(path, 160)}` };
  }
  if (tool === 'Bash') {
    const command = input.command;
    if (typeof command !== 'string' || !command.trim()) return deny('Komut boş.');
    const bad = dangerousCommand(command);
    if (bad) return deny(bad, `Bash: ${clip(command)}`);
    return { behavior: 'ask', reason: 'komut çalıştırma', summary: `Bash: ${clip(command)}` };
  }
  if (NETWORK_TOOLS.has(tool)) return { behavior: 'ask', reason: 'ağ erişimi', summary: `${tool}: ${clip(input.url ?? input.query, 200)}` };
  return deny(`"${tool}" aracı ofisten çalıştırılamaz.`);
}
