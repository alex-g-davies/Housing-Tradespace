import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Toasts from "../components/Toasts";

describe("Toasts (005 R2)", () => {
  it("renders one toast per message", () => {
    render(<Toasts messages={["a failed", "b failed"]} />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("dismisses a toast and keeps it dismissed", () => {
    const { rerender } = render(<Toasts messages={["commute layer unavailable"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();

    // The same message arriving again stays dismissed for the session.
    rerender(<Toasts messages={["commute layer unavailable"]} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing with no messages", () => {
    const { container } = render(<Toasts messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
