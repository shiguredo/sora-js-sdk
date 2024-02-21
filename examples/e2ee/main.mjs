import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const debug = false
Sora.initE2EE('https://sora-e2ee-wasm.shiguredo.app/2020.2/wasm.wasm').catch((e) => {
  document.querySelector('#error-message').textContent =
    'E2EE用 wasm ファイルの読み込みに失敗しました'
})

const sora = Sora.connection(SORA_SIGNALING_URL, debug)

const channelId = `${SORA_CHANNEL_ID_PREFIX}e2ee${SORA_CHANNEL_ID_SUFFIX}`
const metadata = { access_token: ACCESS_TOKEN }
const options = {
  e2ee: true,
}

const sendrecv = sora.sendrecv(channelId, metadata, options)

sendrecv.on('track', (event) => {
  const stream = event.streams[0]
  if (!stream) {
    return
  }
  const remoteVideoBoxId = `remote-video-box-${stream.id}`
  const remoteVideos = document.querySelector('#sendrecv-remote-videos')
  if (!remoteVideos.querySelector(`#${remoteVideoBoxId}`)) {
    const remoteVideoBox = document.createElement('div')
    remoteVideoBox.id = remoteVideoBoxId
    const connectionIdElement = document.createElement('div')
    connectionIdElement.id = `${remoteVideoBoxId}-connection-id`
    connectionIdElement.textContent = `connectionId: ${stream.id}`
    remoteVideoBox.appendChild(connectionIdElement)
    const fingerprintElement = document.createElement('div')
    fingerprintElement.id = `${remoteVideoBoxId}-fingerprint`
    remoteVideoBox.appendChild(fingerprintElement)
    const remoteVideo = document.createElement('video')
    remoteVideo.style.border = '1px solid red'
    remoteVideo.autoplay = true
    remoteVideo.playsinline = true
    remoteVideo.controls = true
    remoteVideo.srcObject = stream
    remoteVideoBox.appendChild(remoteVideo)
    remoteVideos.appendChild(remoteVideoBox)
  }
})
sendrecv.on('removetrack', (event) => {
  const remoteVideo = document.querySelector(`#remote-video-box-${event.target.id}`)
  if (remoteVideo) {
    document.querySelector('#sendrecv-remote-videos').removeChild(remoteVideo)
  }
})
sendrecv.on('notify', (event) => {
  console.log(event)
  if (event.event_type === 'connection.created' && event.connection_id === sendrecv.connectionId) {
    document.querySelector('#local-connection-id').textContent = `${sendrecv.connectionId}`
    document.querySelector('#local-fingerprint').textContent = `${sendrecv.e2eeSelfFingerprint}`
  }

  if (event.event_type === 'connection.created') {
    const remoteFingerprints = sendrecv.e2eeRemoteFingerprints
    // biome-ignore lint/complexity/noForEach: <explanation>
    Object.keys(remoteFingerprints).forEach((connectionId) => {
      const fingerprintElement = document.querySelector(
        `#remote-video-box-${connectionId}-fingerprint`,
      )
      if (fingerprintElement) {
        fingerprintElement.textContent = `fingerprint: ${remoteFingerprints[connectionId]}`
      }
    })
  }
})

document.querySelector('#start-sendrecv').addEventListener('click', async () => {
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  await sendrecv.connect(mediaStream)
  document.querySelector('#sendrecv-local-video').srcObject = mediaStream
})

document.querySelector('#stop-sendrecv').addEventListener('click', async () => {
  await sendrecv.disconnect()
  document.querySelector('#sendrecv-local-video').srcObject = null
  document.querySelector('#sendrecv-remote-videos').innerHTML = null
})
