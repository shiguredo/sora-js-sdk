import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const channelId = `${SORA_CHANNEL_ID_PREFIX}sendonly_recvonly${SORA_CHANNEL_ID_SUFFIX}`
const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)
const metadata = { access_token: ACCESS_TOKEN }
const options = {}

const sendonly = sora.sendonly(channelId, metadata, options)

sendonly.on('notify', (event) => {
  if (event.event_type === 'connection.created' && sendonly.connectionId === event.connection_id) {
    const connectionIdElement = document.querySelector('#sendonly-connection-id')
    connectionIdElement.textContent = event.connection_id
  }
})

document.querySelector('#start-sendonly').addEventListener('click', async () => {
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  await sendonly.connect(mediaStream)
  document.querySelector('#sendonly-local-video').srcObject = mediaStream
})

document.querySelector('#stop-sendonly').addEventListener('click', async () => {
  await sendonly.disconnect()
  document.querySelector('#sendonly-local-video').srcObject = null
})
