import { PositionsDisplay } from "@/components/positions-display";

export default function Home() {
  // No data fetching here — the page renders instantly with zero Zerion calls.
  // Positions are fetched only when the user clicks the button in the panel.
  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Holdsight</h1>
      <PositionsDisplay />
    </div>
  );
}
