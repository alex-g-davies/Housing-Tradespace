import BudgetInput from "./BudgetInput";
import Legend from "./Legend";

interface Props {
  budget: number;
  onBudgetChange: (budget: number) => void;
  metroLabel: string;
}

/** Floating panel: title, budget control, and the legend. */
export default function ControlsPanel({ budget, onBudgetChange, metroLabel }: Props) {
  return (
    <div className="panel">
      <h1 className="panel-title">tradespace</h1>
      <p className="panel-subtitle">{metroLabel}</p>
      <BudgetInput budget={budget} onChange={onBudgetChange} />
      <Legend budget={budget} />
      <p className="panel-foot">Shaded by median home value · 30-min drive-time overlay</p>
    </div>
  );
}
