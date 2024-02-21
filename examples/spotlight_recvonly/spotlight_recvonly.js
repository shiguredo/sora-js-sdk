import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const channelId = `${SORA_CHANNEL_ID_PREFIX}spotlight_recvonly`
const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)
const metadata = { access_token: ACCESS_TOKEN }
const options = {
  simulcast: true,
  spotlight: true,
}
const recvonly = sora.recvonly(channelId, metadata, options)

document.querySelector('#start-recvonly').addEventListener('click', () => {
  recvonly.connect().catch((e) => {
    console.error(e)
  })

  recvonly.on('track', (event) => {
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

  recvonly.on('removetrack', (event) => {
    const remoteVideo = document.querySelector(`#remotevideo-${event.target.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos').removeChild(remoteVideo)
    }
  })
})
