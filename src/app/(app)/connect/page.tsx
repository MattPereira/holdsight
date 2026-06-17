import { getAccountConnections } from "@/app/actions";
import { AccountConnectView } from "@/components/connections/account-connect-view";

export default async function ConnectPage() {
  const connections = await getAccountConnections();

  return (
    <div className="">
      <AccountConnectView connections={connections} />
    </div>
  );
}
