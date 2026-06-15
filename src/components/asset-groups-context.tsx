"use client";

import { createContext, useContext, useState } from "react";

import type { AssetGroup } from "@/lib/portfolio/asset-totals";

type AssetGroupsContextValue = {
  groups: AssetGroup[];
  setGroups: (groups: AssetGroup[]) => void;
};

const AssetGroupsContext = createContext<AssetGroupsContextValue | null>(null);

export function AssetGroupsProvider({
  initialGroups,
  children,
}: {
  initialGroups: AssetGroup[];
  children: React.ReactNode;
}) {
  const [groups, setGroups] = useState<AssetGroup[]>(initialGroups);

  return (
    <AssetGroupsContext.Provider value={{ groups, setGroups }}>
      {children}
    </AssetGroupsContext.Provider>
  );
}

export function useAssetGroups() {
  const ctx = useContext(AssetGroupsContext);
  if (!ctx) {
    throw new Error("useAssetGroups must be used within an AssetGroupsProvider");
  }
  return ctx;
}
