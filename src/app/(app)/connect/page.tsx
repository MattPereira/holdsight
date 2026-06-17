import { getAccountConnections } from "@/app/actions";
import { AccountConnectView } from "@/components/connections/account-connect-view";

export default async function ConnectPage() {
  const connections = await getAccountConnections();

  return (
    <div className="w-full max-w-4xl">
      <AccountConnectView connections={connections} />
    </div>
  );
}
