import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)

const channelId = `${SORA_CHANNEL_ID_PREFIX}simulcast${SORA_CHANNEL_ID_SUFFIX}`
const metadata = { access_token: ACCESS_TOKEN }

const sendonly = sora.sendonly(channelId, metadata, {
  audio: false,
  videoCodecType: 'AV1',
  videoBitRate: 3000,
  simulcast: true,
})

const recvonlyR0 = sora.recvonly(channelId, metadata, {
  simulcast: true,
  simulcastRid: 'r0',
})
recvonlyR0.on('notify', (event) => {
  if (
    event.event_type === 'connection.created' &&
    event.connection_id === recvonlyR0.connectionId
  ) {
    console.log(`recvonly-r0: ${event.connection_id}`)
    document.querySelector('#remote-video-connection-id-r0').textContent = `${event.connection_id}`
  }
})
recvonlyR0.on('track', (event) => {
  document.querySelector('#remote-video-r0').srcObject = event.streams[0]
})

const recvonlyR1 = sora.recvonly(channelId, metadata, {
  simulcast: true,
  simulcastRid: 'r1',
})
recvonlyR1.on('notify', (event) => {
  if (
    event.event_type === 'connection.created' &&
    event.connection_id === recvonlyR1.connectionId
  ) {
    console.log(`recvonly-r1: ${event.connection_id}`)
    document.querySelector('#remote-video-connection-id-r1').textContent = `${event.connection_id}`
  }
})
recvonlyR1.on('track', (event) => {
  document.querySelector('#remote-video-r1').srcObject = event.streams[0]
})

const recvonlyR2 = sora.recvonly(channelId, metadata, {
  simulcast: true,
  simulcastRid: 'r2',
})
recvonlyR2.on('notify', (event) => {
  if (
    event.event_type === 'connection.created' &&
    event.connection_id === recvonlyR2.connectionId
  ) {
    console.log(`recvonly-r2: ${event.connection_id}`)
    document.querySelector('#remote-video-connection-id-r2').textContent = `${event.connection_id}`
  }
})
recvonlyR2.on('track', (event) => {
  document.querySelector('#remote-video-r2').srcObject = event.streams[0]
})

document.querySelector('#start').addEventListener('click', async () => {
  // sendonly
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { exact: 1280 }, height: { exact: 720 } },
  })
  await sendonly.connect(mediaStream)
  document.querySelector('#local-video-connection-id').textContent = `(${sendonly.connectionId})`
  document.querySelector('#local-video').srcObject = mediaStream

  // recvonly r0
  await recvonlyR0.connect()
  // recvonly r1
  await recvonlyR1.connect()
  // recvonly r2
  await recvonlyR2.connect()
})

document.querySelector('#stop').addEventListener('click', async () => {
  await sendonly.disconnect()

  // recvonly r0
  await recvonlyR0.disconnect()
  // recvonly r1
  await recvonlyR1.disconnect()
  // recvonly r2
  await recvonlyR2.disconnect()
})
