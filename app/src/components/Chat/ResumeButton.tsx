import { useState } from 'react';
import { getJson } from '../../services/api';
import { useManagers } from '../../stores/managersStore';

/** Copies the command that resumes this coordinator's real CLI session (Claude: `claude --resume`, Codex: `codex resume`). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API unavailable (insecure context, permissions): fall back to a hidden textarea
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function ResumeButton({ agentId }: { agentId: string }) {
  const provider = useManagers((s) => s.provider);
  const [state, setState] = useState<'idle' | 'ok' | 'none' | 'fail'>('idle');
  const click = async () => {
    try {
      const r = await getJson<{ command: string; provider: 'claude' | 'codex' }>(`/api/agents/${encodeURIComponent(agentId)}/resume?provider=${provider}`);
      setState((await copyText(r.command)) ? 'ok' : 'fail');
    } catch {
      setState('none');
    }
    setTimeout(() => setState('idle'), 3500);
  };
  return (
    <button type="button" onClick={() => void click()} title="Bu oturumu kendi terminalinde sürdürmek için komutu panoya kopyalar" aria-live="polite">
      {state === 'ok' ? 'Kopyalandı ✔' : state === 'none' ? 'Oturum yok' : state === 'fail' ? 'Kopyalanamadı' : 'Resume kopyala'}
    </button>
  );
}
