import Sora from '../../dist/sora.mjs'

const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN

const debug = true
const sora = Sora.connection(SORA_SIGNALING_URL, debug)

const channelId = `${SORA_CHANNEL_ID_PREFIX}messaging`
const metadata = { access_token: ACCESS_TOKEN }
const options = {
  dataChannelSignaling: true,
  dataChannels: [
    {
      label: '#example',
      direction: 'sendrecv',
      compress: true,
    },
  ],
}
const sendrecv = sora.sendrecv(channelId, metadata, options)

document.querySelector('#start-sendrecv').addEventListener('click', async () => {
  const mediaStream = await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .catch((e) => {
      console.error(e)
    })

  await sendrecv.connect(mediaStream)
  document.querySelector('#sendrecv-local-video').srcObject = stream
  document.querySelector('#send-message').disabled = false

  sendrecv.on('track', (event) => {
    const stream = event.streams[0]
    if (!stream) {
      return
    }
    const remoteVideoId = `sendrecv-remotevideo-${stream.id}`
    const remoteVideos = document.querySelector('#sendrecv-remote-videos')
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
  sendrecv.on('removetrack', (event) => {
    const remoteVideo = document.querySelector(`#sendrecv-remotevideo-${event.target.id}`)
    if (remoteVideo) {
      document.querySelector('#sendrecv-remote-videos').removeChild(remoteVideo)
    }
  })
  sendrecv.on('message', (event) => {
    const message = document.createElement('li')
    message.textContent = new TextDecoder().decode(event.data)
    document.querySelector('#received-messages').appendChild(message)
  })
  sendrecv.on('disconnect', (event) => {
    document.querySelector('#send-message').disabled = true
  })
})
document.querySelector('#stop-sendrecv').addEventListener('click', () => {
  sendrecv.disconnect().then(() => {
    document.querySelector('#sendrecv-local-video').srcObject = null
    document.querySelector('#sendrecv-remote-videos').innerHTML = null
  })
})
document.querySelector('#send-message').addEventListener('click', async () => {
  const value = document.querySelector('input[name=message]').value
  if (value !== '') {
    sendrecv.sendMessage('#example', new TextEncoder().encode(value))
  }
})
