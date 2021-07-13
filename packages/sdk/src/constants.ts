export const TERMINATE_WEBSOCKET_EVENT_INIT = { code: 4901, reason: "Terminate WebSocket" };

export const E2EE_WORKER_DISCONNECT_EVENT_INIT = { code: 4902, reason: "Disconnected E2EE worker" };

export const TERMINATE_DATA_CHANNEL_EVENT_INIT = { code: 4903, reason: "Terminate DataChannel" };

export const PEER_CONNECTION_CONNECTION_STATE_FAILED_EVENT_INIT = {
  code: 4904,
  reason: "PeerConnection connectionState changed to 'failed'",
};

export const PEER_CONNECTION_ICE_CONNECTION_STATE_FAILED_EVENT_INIT = {
  code: 4905,
  reason: "PeerConnection iceConnectionState changed to 'failed'",
};

export const PEER_CONNECTION_ICE_CONNECTION_STATE_DISCONNECTED_EVENT_INIT = {
  code: 4906,
  reason: "PeerConnection iceConnectionState changed to 'disconnected'",
};

export const WEBSOCKET_ONERROR_EVENT_INIT = {
  code: 4907,
  reason: "WebSocket onerror was called",
};
