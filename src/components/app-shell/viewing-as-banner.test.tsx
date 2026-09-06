import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ViewingAsBanner } from "@/components/app-shell/viewing-as-banner";

afterEach(cleanup);

describe("ViewingAsBanner", () => {
  it("names the account on screen when it is not the signed-in user's", () => {
    render(<ViewingAsBanner viewingAs="Dad" canWrite />);

    expect(screen.getByRole("status").textContent).toBe("Viewing as Dad");
  });

  // The whole point of the banner: a member cannot mistake the other account's
  // data for something they are able to change.
  it("says read only when the viewed account cannot be written", () => {
    render(<ViewingAsBanner viewingAs="Dad" canWrite={false} />);

    expect(screen.getByRole("status").textContent).toBe(
      "Viewing as Dad — read only",
    );
  });

  it("stays quiet when the signed-in user is writing their own account", () => {
    render(<ViewingAsBanner viewingAs={null} canWrite />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  // An account switch is not the only way to lose write authority: a demoted
  // actor looking at their own account still needs to be told.
  it("reports read only on the signed-in user's own account", () => {
    render(<ViewingAsBanner viewingAs={null} canWrite={false} />);

    expect(screen.getByRole("status").textContent).toBe("Read only");
  });
});
