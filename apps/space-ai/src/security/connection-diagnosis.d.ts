export type SpaceConnectionIssue = {
  kind: "websocket-unavailable" | "unauthenticated" | "forbidden" | "workspace-unavailable" | "network" | "reconnecting";
  message: string;
};
export declare function describeConnectionHealth(status: number): SpaceConnectionIssue;
export declare function describeConnectionNetworkFailure(): SpaceConnectionIssue;
