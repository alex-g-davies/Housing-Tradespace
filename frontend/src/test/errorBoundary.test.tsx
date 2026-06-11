import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "../components/ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary (005 R1)", () => {
  beforeEach(() => {
    // React logs the caught error; keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>map here</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("map here")).toBeInTheDocument();
  });

  it("shows the fallback with a reload action when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
