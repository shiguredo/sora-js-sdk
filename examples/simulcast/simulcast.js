import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)

const channelId = `${SORA_CHANNEL_ID_PREFIX}${__filename}`
const metadata = { access_token: ACCESS_TOKEN }

const sendonly = sora.sendonly(channelId, metadata, {
  videoCodecType: 'VP8',
  videoBitRate: 3000,
  multistream: true,
})
const recvonlyR0 = sora.recvonly(channelId, null, {
  videoCodecType: 'VP8',
  simulcast: true,
  multistream: true,
  simulcastRid: 'r0',
})
recvonlyR0.on('track', (event) => {
  document.querySelector('#remote-video-client-id-r0').textContent = `(${recvonlyR0.clientId})`
  document.querySelector('#remote-video-r0').srcObject = event.streams[0]
})
const recvonlyR1 = sora.recvonly(channelId, null, {
  videoCodecType: 'VP8',
  simulcast: true,
  multistream: true,
  simulcastRid: 'r1',
})
recvonlyR1.on('track', (event) => {
  document.querySelector('#remote-video-client-id-r1').textContent = `(${recvonlyR0.clientId})`
  document.querySelector('#remote-video-r1').srcObject = event.streams[0]
})
const recvonlyR2 = sora.recvonly(channelId, null, {
  videoCodecType: 'VP8',
  simulcast: true,
  multistream: true,
  simulcastRid: 'r2',
})
recvonlyR2.on('track', (event) => {
  document.querySelector('#remote-video-client-id-r2').textContent = `(${recvonlyR0.clientId})`
  document.querySelector('#remote-video-r2').srcObject = event.streams[0]
})

document.querySelector('#start').addEventListener('click', async () => {
  // sendonly
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: { exact: 1280 }, height: { exact: 720 } },
  })
  await sendonly.connect(mediaStream)
  document.querySelector('#local-video-client-id').textContent = `(${sendonly.clientId})`
  document.querySelector('#local-video').srcObject = mediaStream

  // recvonly
  await recvonlyR0.connect()
  await recvonlyR1.connect()
  await recvonlyR2.connect()
})
