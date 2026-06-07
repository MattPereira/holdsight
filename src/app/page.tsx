import { PositionsPanel } from "@/components/positions-panel";

export default function Home() {
  // No data fetching here — the page renders instantly with zero Zerion calls.
  // Positions are fetched only when the user clicks the button in the panel.
  return (
    <div>
      <h1 className="text-3xl font-semibold">Holdsight</h1>
      <PositionsPanel />
    </div>
  );
}
