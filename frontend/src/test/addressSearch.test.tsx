import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

import { getGeocode } from "../api/client";
import AddressSearch from "../components/AddressSearch";

vi.mock("../api/client", () => ({ getGeocode: vi.fn() }));

describe("AddressSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("geocodes the query and reports the located point", async () => {
    (getGeocode as Mock).mockResolvedValue({
      lat: 47.6097,
      lon: -122.3422,
      place_name: "Pike Place Market, Seattle, Washington",
    });
    const onLocated = vi.fn();
    render(<AddressSearch onLocated={onLocated} />);

    fireEvent.change(screen.getByLabelText("Find a work address"), {
      target: { value: "Pike Place Market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    await waitFor(() =>
      expect(onLocated).toHaveBeenCalledWith(
        47.6097,
        -122.3422,
        "Pike Place Market, Seattle, Washington",
      ),
    );
    expect(getGeocode).toHaveBeenCalledWith("Pike Place Market");
  });

  it("shows a friendly message on no match and does not move the pin", async () => {
    (getGeocode as Mock).mockRejectedValue(new Error("not_found"));
    const onLocated = vi.fn();
    render(<AddressSearch onLocated={onLocated} />);

    fireEvent.change(screen.getByLabelText("Find a work address"), {
      target: { value: "zzzz nowhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    await waitFor(() => expect(screen.getByText("No match for that address.")).toBeInTheDocument());
    expect(onLocated).not.toHaveBeenCalled();
  });

  it("ignores an empty submission", () => {
    const onLocated = vi.fn();
    render(<AddressSearch onLocated={onLocated} />);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(getGeocode).not.toHaveBeenCalled();
  });
});
