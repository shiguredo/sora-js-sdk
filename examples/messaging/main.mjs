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
const recvonly = sora.recvonly(channelId, metadata, options)

recvonly.on('notify', (event) => {
  if (event.event_type === 'connection.created' && event.connection_id === recvonly.connectionId) {
    document.querySelector('#local-connection-id').textContent = `${event.connection_id}`
  }
})

recvonly.on('message', (event) => {
  const message = document.createElement('li')
  message.textContent = new TextDecoder().decode(event.data)
  document.querySelector('#received-messages').appendChild(message)
})
recvonly.on('disconnect', (event) => {
  document.querySelector('#send-message').disabled = true
})

document.querySelector('#start').addEventListener('click', async () => {
  await recvonly.connect()
  document.querySelector('#send-message').disabled = false
})
document.querySelector('#stop').addEventListener('click', async () => {
  await recvonly.disconnect()
})
document.querySelector('#send-message').addEventListener('click', async () => {
  const value = document.querySelector('input[name=message]').value
  if (value !== '') {
    recvonly.sendMessage('#example', new TextEncoder().encode(value))
  }
})
