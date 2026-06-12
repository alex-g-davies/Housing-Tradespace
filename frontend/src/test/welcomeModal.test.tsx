import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import WelcomeModal from "../components/WelcomeModal";

describe("WelcomeModal (017 R1)", () => {
  it("explains the product and the three core actions", () => {
    render(<WelcomeModal onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/see where you could live/i);
    expect(dialog).toHaveTextContent(/budget/i);
    expect(dialog).toHaveTextContent(/pin/i);
    expect(dialog).toHaveTextContent(/click any area/i);
  });

  it("closes via the CTA, the close button, and Esc", () => {
    const onClose = vi.fn();
    render(<WelcomeModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore the map" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
