import { JournalWorkspace } from "@/components/journal/journal-workspace";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getJournalWorkspace,
  isCalendarDate,
  todayInTimezone,
} from "@/lib/investment-journal/journal";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const requestedDate = (await searchParams).date;
  const hasValidRequestedDate = isCalendarDate(requestedDate ?? "");
  const provisionalDate = hasValidRequestedDate
    ? requestedDate!
    : new Date().toISOString().slice(0, 10);
  let workspace = await getJournalWorkspace(userId, provisionalDate);
  const selectedDate = hasValidRequestedDate
    ? provisionalDate
    : workspace.homeTimezone
      ? todayInTimezone(workspace.homeTimezone)
      : provisionalDate;

  if (selectedDate !== provisionalDate) {
    workspace = await getJournalWorkspace(userId, selectedDate);
  }

  return (
    <JournalWorkspace
      key={selectedDate}
      selectedDate={selectedDate}
      initialWorkspace={workspace}
      dateWasRequested={hasValidRequestedDate}
    />
  );
}
