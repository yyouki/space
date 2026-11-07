import { useCallback, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { SpaceAgent } from "./server";
import {
  describeConnectionHealth,
  describeConnectionNetworkFailure,
  type SpaceConnectionIssue
} from "./security/connection-diagnosis.js";

export type SpaceAgentClient = ReturnType<typeof useAgent<SpaceAgent>>;
export type { SpaceConnectionIssue };

export function useSpaceAgentConnection() {
  const [connected, setConnected] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<SpaceConnectionIssue | null>(null);
  const diagnosisInFlight = useRef(false);

  const diagnose = useCallback(async () => {
    if (diagnosisInFlight.current) return;
    diagnosisInFlight.current = true;

    try {
      const response = await fetch("/api/health", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      setConnectionIssue(describeConnectionHealth(response.status));
    } catch {
      setConnectionIssue(describeConnectionNetworkFailure());
    } finally {
      diagnosisInFlight.current = false;
    }
  }, []);

  const agent = useAgent<SpaceAgent>({
    agent: "SpaceAgent",
    basePath: "/api/me",
    onOpen: useCallback(() => {
      setConnected(true);
      setConnectionIssue(null);
    }, []),
    onClose: useCallback(() => {
      setConnected(false);
      setConnectionIssue((current) => current ?? {
        kind: "reconnecting",
        message: "Koneksi realtime terputus. Space sedang mencoba menyambung kembali."
      });
      void diagnose();
    }, [diagnose]),
    onError: useCallback((_event: Event) => {
      setConnected(false);
      void diagnose();
    }, [diagnose])
  });

  const reconnect = useCallback(() => {
    setConnected(false);
    setConnectionIssue({
      kind: "reconnecting",
      message: "Meminta SDK menyambungkan ulang ke private workspace…"
    });
    agent.reconnect();
  }, [agent]);

  return { agent, connected, connectionIssue, reconnect };
}
