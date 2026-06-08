import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BudgetInput from "../components/BudgetInput";

describe("BudgetInput (R4)", () => {
  it("emits the parsed number on change", () => {
    const onChange = vi.fn();
    render(<BudgetInput budget={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Budget in dollars"), {
      target: { value: "800000" },
    });
    expect(onChange).toHaveBeenCalledWith(800000);
  });

  it("strips non-numeric characters", () => {
    const onChange = vi.fn();
    render(<BudgetInput budget={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Budget in dollars"), {
      target: { value: "$1,250,000" },
    });
    expect(onChange).toHaveBeenCalledWith(1250000);
  });

  it("clears to 0 when emptied", () => {
    const onChange = vi.fn();
    render(<BudgetInput budget={800000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Budget in dollars"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
