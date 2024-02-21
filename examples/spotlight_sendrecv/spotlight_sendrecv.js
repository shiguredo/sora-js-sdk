import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const channelId = `${SORA_CHANNEL_ID_PREFIX}${__filename}`
const debug = false
const sora = Sora.connection(SORA_SIGNALING_URL, debug)
const metadata = { access_token: ACCESS_TOKEN }
const options = {
  simulcast: true,
  spotlight: true,
  spotlightNumber: 1,
}
const sendrecv1 = sora.sendrecv(channelId, metadata, options)
const sendrecv2 = sora.sendrecv(channelId, metadata, options)

document.querySelector('#start-sendrecv1').addEventListener('click', async () => {
  // sendrecv1
  const mediaStream = await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .catch((e) => {
      console.error(e)
    })
  await sendrecv1.connect(mediaStream)
  document.querySelector('#sendrecv1-local-video').srcObject = stream
  sendrecv1.on('track', (event) => {
    const stream = event.streams[0]
    if (!stream) return
    const remoteVideoId = `sendrecv1-remotevideo-${stream.id}`
    const remoteVideos = document.querySelector('#sendrecv1-remote-videos')
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
  sendrecv1.on('removetrack', (event) => {
    const remoteVideo = document.querySelector(`#sendrecv1-remotevideo-${event.target.id}`)
    if (remoteVideo) {
      document.querySelector('#sendrecv1-remote-videos').removeChild(remoteVideo)
    }
  })
})
document.querySelector('#start-sendrecv2').addEventListener('click', async () => {
  // sendrecv2
  const mediaStream = await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .catch((e) => {
      console.error(e)
    })
  await sendrecv2.connect(mediaStream)
  document.querySelector('#sendrecv2-local-video').srcObject = stream
  sendrecv2.on('track', (event) => {
    const stream = event.streams[0]
    if (!stream) return
    const remoteVideoId = `sendrecv2-remotevideo-${stream.id}`
    const remoteVideos = document.querySelector('#sendrecv2-remote-videos')
    if (!remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = remoteVideoId
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsinline = true
      remoteVideo.controls = true
      remoteVideo.width = '160'
      remoteVideo.height = '120'
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  })
  sendrecv2.on('removetrack', (event) => {
    const remoteVideo = document.querySelector(`#sendrecv2-remotevideo-${event.target.id}`)
    if (remoteVideo) {
      document.querySelector('#sendrecv2-remote-videos').removeChild(remoteVideo)
    }
  })
})
document.querySelector('#stop-sendrecv1').addEventListener('click', () => {
  sendrecv1.disconnect().then(() => {
    document.querySelector('#sendrecv1-local-video').srcObject = null
    document.querySelector('#sendrecv1-remote-videos').innerHTML = null
  })
})
document.querySelector('#stop-sendrecv2').addEventListener('click', () => {
  sendrecv2.disconnect().then(() => {
    document.querySelector('#sendrecv2-local-video').srcObject = null
    document.querySelector('#sendrecv2-remote-videos').innerHTML = null
  })
})
