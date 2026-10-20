import { STATUS_TEXT } from '../../lib/format';
import { toAgent, useOffice } from '../../stores/officeStore';

export function AgentTooltip() {
  const hover = useOffice((s) => s.hover);
  const dto = useOffice((s) => (s.hover ? s.office?.agents.find((a) => a.id === s.hover!.id) : undefined));
  const moving = useOffice((s) => (s.hover ? s.movingIds.includes(s.hover.id) : false));
  if (!hover || !dto) return null;
  const agent = toAgent(dto, moving);
  return (
    <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="tooltip">
      <strong>{agent.name}</strong>
      <span className={`pill ${agent.status}`}>{STATUS_TEXT[agent.status]}</span>
      {agent.currentTask && <em>{agent.currentTask}</em>}
    </div>
  );
}
