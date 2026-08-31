"use client";

import { createContext, useContext, useState } from "react";

import type { Plan } from "@/lib/portfolio/plan";

type PlansContextValue = {
  plans: Plan[];
  setPlans: (plans: Plan[]) => void;
};

const PlansContext = createContext<PlansContextValue | null>(null);

export function PlansProvider({
  initialPlans,
  children,
}: {
  initialPlans: Plan[];
  children: React.ReactNode;
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  return (
    <PlansContext.Provider value={{ plans, setPlans }}>
      {children}
    </PlansContext.Provider>
  );
}

export function usePlans() {
  const context = useContext(PlansContext);
  if (!context) {
    throw new Error("usePlans must be used within a PlansProvider");
  }
  return context;
}
