import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import Onboarding from "../components/Onboarding";

describe("Onboarding (005 R6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the hint on first visit", () => {
    render(<Onboarding />);
    expect(screen.getByRole("note")).toHaveTextContent("Drag the");
  });

  it("dismisses and persists the dismissal", () => {
    const { unmount } = render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("note")).toBeNull();

    unmount();
    render(<Onboarding />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
