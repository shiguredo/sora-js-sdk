import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const channelId = `${SORA_CHANNEL_ID_PREFIX}spotlight_sendonly_recvonly`
const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)
const metadata = { access_token: ACCESS_TOKEN }
const options = {
  multistream: true,
  simulcast: true,
  spotlight: true,
}
const sendonly = sora.sendonly(channelId, metadata, options)

document.querySelector('#start-sendonly').addEventListener('click', () => {
  sendonly.connect().catch((e) => {
    console.error(e)
  })

  sendonly.on('notify', (event) => {
    if (
      event.event_type === 'connection.created' &&
      sendonly.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector('#sendonly-connection-id')
      connectionIdElement.textContent = event.connection_id
    }
  })

  sendonly.on('track', (event) => {
    const stream = event.streams[0]
    if (!stream) return
    const remoteVideoId = `remotevideo-${stream.id}`
    const remoteVideos = document.querySelector('#remote-videos')
    if (!remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = remoteVideoId
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsinline = true
      remoteVideo.controls = true
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  })

  sendonly.on('removetrack', (event) => {
    const remoteVideo = document.querySelector(`#remotevideo-${event.target.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos').removeChild(remoteVideo)
    }
  })
})
