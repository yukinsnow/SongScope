import { useEffect, useState } from 'react';
import { t as tr } from '../i18n';
import type { S1Song } from '../lib/types';
import { analyzeCompatibility, type CompatibilityTarget } from '../lib/compatibility';

type Plan = Awaited<ReturnType<typeof analyzeCompatibility>>;

export default function CompatibilityExport({ song, busy, onExport }: {
  song: S1Song;
  busy: boolean;
  onExport: (target: CompatibilityTarget) => Promise<void>;
}) {
  const [target, setTarget] = useState<CompatibilityTarget>(song.projectVersion.softwareVersion?.startsWith('7.') ? 6 : 7);
  const [expanded, setExpanded] = useState(false);
  const [plan, setPlan] = useState<{ song: S1Song; target: CompatibilityTarget; result: Plan } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setError('');
    analyzeCompatibility(song, target).then(result => {
      if (active) setPlan({ song, target, result });
    }).catch(e => {
      if (active) { setPlan(null); setError((e as Error).message); }
    });
    return () => { active = false; };
  }, [song, target, expanded]);
  const current = plan?.song === song && plan.target === target ? plan.result : null;
  return <section className="compatibilityExport" aria-labelledby="compatibilityTitle">
    <button className="compatibilityToggle" id="compatibilityTitle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
      {tr('高版本转低版本')} <small>{tr('实验性兼容副本')} {expanded ? '▴' : '▾'}</small>
    </button>
    {expanded && <div className="compatibilityBody">
      <p>{tr('导出新的 .song 副本，原工程保持不变。新版本独有功能不能保证在旧版保留；导出后请在目标软件中核对。')}</p>
      <label>{tr('目标版本')} <select aria-label={tr('目标版本')} value={target} disabled={busy} onChange={e => { setPlan(null); setTarget(Number(e.target.value) as CompatibilityTarget); }}>
        <option value={7}>Studio One 7</option>
        <option value={6}>Studio One 6</option>
      </select></label>
      {error ? <p className="compatibilityBlocker" role="alert">{tr('兼容性检查失败：')}{error}</p> : !current ? <p role="status">{tr('正在检查兼容性…')}</p> : <>
        {current.changes.length > 0 && <div><h3>{tr('将转换')}</h3><ul className="compatibilityChanges">{current.changes.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {current.warnings.length > 0 && <div><h3>{tr('兼容性说明')}</h3><ul className="compatibilityWarnings">{current.warnings.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {current.blockers.length > 0 && <div className="compatibilityBlocker" role="alert"><h3>{tr('当前无法转换')}</h3><ul>{current.blockers.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
      </>}
      <button className="primary compatibilityDownload" disabled={busy || !current?.canExport || !!error} onClick={() => onExport(target)}>{tr('导出兼容 .song 副本')}</button>
    </div>}
  </section>;
}
