// @vitest-environment node
// Route handlers parse real multipart bodies; jsdom's fetch primitives stall on
// `request.formData()`.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewedAccountAuthorization } from "@/lib/auth/authorize";

const authorizeViewedAccount =
  vi.fn<() => Promise<ViewedAccountAuthorization>>();
const images = vi.hoisted(() => ({
  getUserInvestmentTransactionJournalImages: vi.fn(),
  removeUserInvestmentTransactionJournalImage: vi.fn(),
  uploadUserInvestmentTransactionJournalImage: vi.fn(),
  MAX_JOURNAL_IMAGE_COUNT: 4,
  MAX_JOURNAL_IMAGE_SIZE_BYTES: 4 * 1024 * 1024,
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeViewedAccount: () => authorizeViewedAccount(),
}));
vi.mock("@/lib/journal/transaction-entry-images", () => images);
// Reached only through the response helper, and it pulls in the database.
vi.mock("@/lib/journal/images/upload", () => ({
  MAX_JOURNAL_IMAGE_COUNT: 4,
}));

const { GET, POST } = await import(
  "@/app/api/investment-transactions/[transactionId]/journal-images/route"
);
const { DELETE } = await import(
  "@/app/api/investment-transactions/[transactionId]/journal-images/[imageId]/route"
);

const TRANSACTION_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";

function uploadRequest(): Request {
  const body = new FormData();
  body.append("file", new File(["x"], "chart.png", { type: "image/png" }));
  return new Request("http://localhost/upload", { method: "POST", body });
}

beforeEach(() => {
  vi.clearAllMocks();
  images.getUserInvestmentTransactionJournalImages.mockResolvedValue([]);
  images.uploadUserInvestmentTransactionJournalImage.mockResolvedValue({
    error: null,
    image: { id: IMAGE_ID },
    entryId: "entry-1",
    entryUpdatedAt: "2026-01-01T00:00:00.000Z",
  });
  images.removeUserInvestmentTransactionJournalImage.mockResolvedValue({
    deleted: true,
    entryUpdatedAt: "2026-01-01T00:00:00.000Z",
  });
});

describe("journal image writes against a foreign account", () => {
  beforeEach(() => {
    authorizeViewedAccount.mockResolvedValue({
      status: "forbidden",
      userId: "admin",
    });
  });

  it("rejects an upload with 403 and touches no account", async () => {
    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ transactionId: TRANSACTION_ID }),
    });

    expect(response.status).toBe(403);
    expect(
      images.uploadUserInvestmentTransactionJournalImage,
    ).not.toHaveBeenCalled();
  });

  it("rejects a delete with 403 and touches no account", async () => {
    const response = await DELETE(new Request("http://localhost/image"), {
      params: Promise.resolve({
        transactionId: TRANSACTION_ID,
        imageId: IMAGE_ID,
      }),
    });

    expect(response.status).toBe(403);
    expect(
      images.removeUserInvestmentTransactionJournalImage,
    ).not.toHaveBeenCalled();
  });
});

describe("journal images the policy allows", () => {
  it("reads the viewed account's images", async () => {
    authorizeViewedAccount.mockResolvedValue({
      status: "authorized",
      userId: "admin",
    });

    const response = await GET(new Request("http://localhost/images"), {
      params: Promise.resolve({ transactionId: TRANSACTION_ID }),
    });

    expect(response.status).toBe(200);
    expect(
      images.getUserInvestmentTransactionJournalImages,
    ).toHaveBeenCalledWith("admin", TRANSACTION_ID);
  });

  it("uploads against the viewed account", async () => {
    authorizeViewedAccount.mockResolvedValue({
      status: "authorized",
      userId: "member",
    });

    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ transactionId: TRANSACTION_ID }),
    });

    expect(response.status).toBe(201);
    expect(
      images.uploadUserInvestmentTransactionJournalImage,
    ).toHaveBeenCalledWith("member", TRANSACTION_ID, expect.any(File));
  });
});

describe("journal image writes without a session", () => {
  it("rejects an upload with 401", async () => {
    authorizeViewedAccount.mockResolvedValue({ status: "unauthenticated" });

    const response = await POST(uploadRequest(), {
      params: Promise.resolve({ transactionId: TRANSACTION_ID }),
    });

    expect(response.status).toBe(401);
  });
});
