import { JournalWorkspace } from "@/components/journal/journal-workspace";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getJournalWorkspace,
  todayInTimezone,
} from "@/lib/journal/investment-entry";
import {
  canonicalPeriodStart,
  isCalendarDate,
  isJournalPeriodType,
} from "@/lib/journal/periods";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; date?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const requested = await searchParams;
  const requestedType = requested.type ?? "";
  const periodType = isJournalPeriodType(requestedType)
    ? requestedType
    : "daily";
  const requestedDate = requested.date;
  const hasValidRequestedDate = isCalendarDate(requestedDate ?? "");
  const provisionalDate = hasValidRequestedDate
    ? requestedDate!
    : new Date().toISOString().slice(0, 10);
  let workspace = await getJournalWorkspace(
    userId,
    periodType,
    canonicalPeriodStart(periodType, provisionalDate),
  );
  const selectedCalendarDate = hasValidRequestedDate
    ? provisionalDate
    : workspace.homeTimezone
      ? todayInTimezone(workspace.homeTimezone)
      : provisionalDate;

  const selectedDate = canonicalPeriodStart(periodType, selectedCalendarDate);

  if (selectedDate !== canonicalPeriodStart(periodType, provisionalDate)) {
    workspace = await getJournalWorkspace(userId, periodType, selectedDate);
  }

  return (
    <JournalWorkspace
      key={`${periodType}:${selectedDate}`}
      periodType={periodType}
      selectedDate={selectedDate}
      initialWorkspace={workspace}
      dateWasRequested={hasValidRequestedDate}
    />
  );
}
