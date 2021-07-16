export const DISCONNECT_DATA_CHANNEL_EVENT_INIT = { code: 4901, reason: "Disconnected DataChannel" };

export const TERMINATE_WEBSOCKET_EVENT_INIT = { code: 4902, reason: "Terminated WebSocket" };

export const E2EE_WORKER_DISCONNECT_EVENT_INIT = { code: 4903, reason: "Disconnected E2EE worker" };

export const TERMINATE_DATA_CHANNEL_EVENT_INIT = { code: 4904, reason: "Terminated DataChannel" };

export const PEER_CONNECTION_CONNECTION_STATE_FAILED_EVENT_INIT = {
  code: 4905,
  reason: "PeerConnection connectionState changed to 'failed'",
};

export const PEER_CONNECTION_ICE_CONNECTION_STATE_FAILED_EVENT_INIT = {
  code: 4906,
  reason: "PeerConnection iceConnectionState changed to 'failed'",
};

export const PEER_CONNECTION_ICE_CONNECTION_STATE_DISCONNECTED_EVENT_INIT = {
  code: 4907,
  reason: "PeerConnection iceConnectionState changed to 'disconnected'",
};

export const WEBSOCKET_ONERROR_EVENT_INIT = {
  code: 4908,
  reason: "WebSocket onerror was called",
};

export const SIGNALING_CONNECTION_TIMEOUT_EVENT_INIT = {
  code: 4909,
  reason: "Signaling connection timeout",
};
