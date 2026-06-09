import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymFinderSection } from "@/components/gym-finder-section";

const rpcMock = vi.fn();
const fallbackQueryMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        or: () => ({
          order: () => ({
            limit: fallbackQueryMock,
          }),
        }),
      }),
    }),
  }),
}));

describe("GymFinderSection", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fallbackQueryMock.mockReset();
  });

  it("does not search for short queries", async () => {
    const user = userEvent.setup();
    render(<GymFinderSection />);

    await user.type(screen.getByPlaceholderText(/search by gym name or code/i), "a");

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("searches gyms and renders results", async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({
      data: [
        { id: "1", name: "Iron House", code: "iron-house", address: "Manila" },
      ],
      error: null,
    });

    render(<GymFinderSection />);

    await user.type(screen.getByPlaceholderText(/search by gym name or code/i), "iron");

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("search_gyms", { p_query: "iron" });
    });

    expect(await screen.findByText("Iron House")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute("href", "/gym/iron-house");
  });

  it("shows empty state when no gyms are found", async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({ data: [], error: null });
    fallbackQueryMock.mockResolvedValue({ data: [], error: null });

    render(<GymFinderSection />);

    await user.type(screen.getByPlaceholderText(/search by gym name or code/i), "xy");

    expect(await screen.findByText(/no gyms found/i)).toBeInTheDocument();
  });

  it("falls back to a direct gym lookup when rpc returns no rows", async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({ data: [], error: null });
    fallbackQueryMock.mockResolvedValue({
      data: [{ id: "2", name: "New Iron Gym", code: "new-iron", address: "Quezon City" }],
      error: null,
    });

    render(<GymFinderSection />);

    await user.type(screen.getByPlaceholderText(/search by gym name or code/i), "new");

    await waitFor(() => {
      expect(fallbackQueryMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("New Iron Gym")).toBeInTheDocument();
  });
});
