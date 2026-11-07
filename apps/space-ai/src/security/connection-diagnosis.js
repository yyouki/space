/**
 * Translate HTTP health-check results into safe, user-facing connection states.
 * This deliberately avoids exposing Worker error text or request/session details.
 * @param {number} status
 * @returns {{kind: string, message: string}}
 */
export function describeConnectionHealth(status) {
  if (status === 200) {
    return {
      kind: "websocket-unavailable",
      message: "Worker dan private workspace merespons. Koneksi realtime sedang tersambung ulang."
    };
  }
  if (status === 401) {
    return {
      kind: "unauthenticated",
      message: "Sesi masuk sudah tidak berlaku. Muat ulang halaman untuk masuk kembali."
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      message: "Worker menolak permintaan health check. Periksa domain dan konfigurasi origin aplikasi."
    };
  }
  if (status === 503) {
    return {
      kind: "workspace-unavailable",
      message: "Worker merespons, tetapi Durable Object atau penyimpanan workspace tidak dapat dijangkau."
    };
  }
  if (status >= 500) {
    return {
      kind: "workspace-unavailable",
      message: "Layanan Space mengembalikan error server. Coba sambungkan ulang setelah layanan pulih."
    };
  }
  return {
    kind: "websocket-unavailable",
    message: "Pemeriksaan koneksi tidak berhasil. Coba sambungkan ulang."
  };
}

/** @returns {{kind: string, message: string}} */
export function describeConnectionNetworkFailure() {
  return {
    kind: "network",
    message: "Browser tidak dapat menjangkau endpoint Space. Periksa alamat aplikasi, DNS, dan koneksi ke domain Worker."
  };
}
