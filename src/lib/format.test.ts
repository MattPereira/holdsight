import { describe, expect, it } from "vitest";

import {
  formatCompactUsd,
  formatExactQuantity,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedUsd,
  formatUsd,
} from "@/lib/format";

describe("formatUsd", () => {
  it("renders two fraction digits", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("keeps negatives signed", () => {
    expect(formatUsd(-42)).toBe("-$42.00");
  });
});

describe("formatSignedUsd", () => {
  it("marks gains with a plus", () => {
    expect(formatSignedUsd(120.4)).toBe("+$120.40");
  });

  it("marks losses with a minus and drops the native sign", () => {
    expect(formatSignedUsd(-120.4)).toBe("−$120.40");
  });

  it("leaves zero unsigned", () => {
    expect(formatSignedUsd(0)).toBe("$0.00");
  });
});

describe("formatCompactUsd", () => {
  it("abbreviates large values", () => {
    expect(formatCompactUsd(182_100)).toBe("$182.1K");
  });
});

describe("formatPrice", () => {
  it("uses two fraction digits at or above a dollar", () => {
    expect(formatPrice(67_204.111)).toBe("$67,204.11");
  });

  // The reason this formatter exists: two fraction digits would report every
  // cheap token as $0.00.
  it("keeps significant digits below a dollar", () => {
    expect(formatPrice(0.00012345)).toBe("$0.0001235");
  });

  it("renders a zero price plainly", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });
});

// Two quantity formatters exist deliberately: dense balance tables round for
// column tidiness, while a single transaction's legs must not misreport the
// amount actually moved.
describe("quantity formatters", () => {
  it("rounds listing quantities to four places", () => {
    expect(formatQuantity(1.234567891)).toBe("1.2346");
  });

  it("keeps six places for transaction legs", () => {
    expect(formatExactQuantity(1.234567891)).toBe("1.234568");
  });

  it("does not pad whole quantities", () => {
    expect(formatQuantity(12)).toBe("12");
    expect(formatExactQuantity(12)).toBe("12");
  });
});

describe("formatPercent", () => {
  it("renders a 0-1 ratio as a percentage", () => {
    expect(formatPercent(0.3421)).toBe("34.21%");
  });
});
