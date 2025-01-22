document.addEventListener('DOMContentLoaded', async () => {
  const endpointUrl = import.meta.env.VITE_TEST_WHIP_ENDPOINT_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  let whipClient: WhipClient | undefined

  document.getElementById('connect')?.addEventListener('click', async () => {
    const channelName = document.getElementById('channel-name') as HTMLInputElement
    if (!channelName) {
      throw new Error('Channel name input element not found')
    }
    const channelId = `${channelIdPrefix}${channelName.value}${channelIdSuffix}`

    const videoCodecTypeElement = document.getElementById('video-codec-type') as HTMLSelectElement
    if (!videoCodecTypeElement) {
      throw new Error('Video codec type select element not found')
    }

    whipClient = new WhipClient(endpointUrl, channelId, videoCodecTypeElement.value, secretKey)

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })

    const localVideo = document.getElementById('local-video') as HTMLVideoElement
    if (!localVideo) {
      throw new Error('Local video element not found')
    }
    localVideo.srcObject = stream

    await whipClient.connect(stream, channelId)
  })

  document.getElementById('disconnect')?.addEventListener('click', async () => {
    if (!whipClient) {
      throw new Error('WhipClient not found')
    }
    await whipClient.disconnect()

    const localVideo = document.getElementById('local-video') as HTMLVideoElement
    if (!localVideo) {
      throw new Error('Local video element not found')
    }
    localVideo.srcObject = null
  })
})

class WhipClient {
  // WHIP Endpoint URL
  private endpointUrl: string
  // WHIP Resource URL
  private resourceUrl: string | undefined

  private channelId: string

  private videoCodecType: string

  private secretKey: string
  private pc: RTCPeerConnection | undefined

  private stream: MediaStream | undefined

  constructor(endpointUrl: string, channelId: string, videoCodecType: string, secretKey: string) {
    this.endpointUrl = endpointUrl
    this.channelId = channelId
    this.videoCodecType = videoCodecType
    this.secretKey = secretKey
  }

  async connect(stream: MediaStream, channelId: string): Promise<void> {
    if (!stream) {
      throw new Error('Stream not found')
    }
    this.stream = stream

    this.pc = new RTCPeerConnection()

    this.pc.onconnectionstatechange = (event) => {
      console.log('connectionState:', this.pc?.connectionState)
      const connectionState = this.pc?.connectionState
      const connectionStateElement = document.getElementById('connection-state') as HTMLDivElement
      if (connectionStateElement && connectionState) {
        connectionStateElement.textContent = connectionState
      }
    }
    this.pc.onicecandidate = (event) => {
      console.log('iceConnectionState:', this.pc?.iceConnectionState)
    }
    this.pc.onsignalingstatechange = (event) => {
      console.log('signalingState:', this.pc?.signalingState)
    }

    const audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendonly' })
    const videoTransceiver = this.pc.addTransceiver('video', { direction: 'sendonly' })

    const audioCodecs = RTCRtpSender.getCapabilities('audio')?.codecs
    if (!audioCodecs) {
      throw new Error('Audio codecs not found')
    }
    // mimeType が audio/opus の codec のみを filter する
    const opusCodecs = audioCodecs.filter((codec) => codec.mimeType === 'audio/opus')
    if (opusCodecs.length === 0) {
      throw new Error('Opus codec not found')
    }
    audioTransceiver.setCodecPreferences(opusCodecs)

    const senderVideoCodecs = RTCRtpSender.getCapabilities('video')?.codecs
    if (!senderVideoCodecs) {
      throw new Error('Video codecs not found')
    }
    // mimeType が video/${this.videoCodecType} の codec のみを filter する
    const videoCodecs = senderVideoCodecs.filter(
      (codec) => codec.mimeType === `video/${this.videoCodecType}`,
    )
    if (videoCodecs.length === 0) {
      throw new Error(`${this.videoCodecType} codec not found`)
    }
    // コーデックは必ず 1 つだけにする、ただしリストで渡す
    videoTransceiver.setCodecPreferences([videoCodecs[0]])

    this.pc.addTrack(this.stream.getVideoTracks()[0], this.stream)
    this.pc.addTrack(this.stream.getAudioTracks()[0], this.stream)

    // まずは offer を作成する
    const offer = await this.pc.createOffer()
    console.log('offerSdp:', offer.sdp)

    // channelId を path に含める
    const whipEndpointUrl = `${this.endpointUrl}/${this.channelId}`

    // /whip/:channel_id に POST する
    const response = await fetch(whipEndpointUrl.toString(), {
      method: 'POST',
      headers: {
        // 認証は Bearer Token を利用する
        Authorization: `Bearer ${this.secretKey}`,
        // application/sdp を指定する
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    })

    if (response.status !== 201) {
      throw new Error('Failed to create resource')
    }

    // DELETE 送信用に /whip-resource/:channel_id/:secret/ の URL を取得する
    const resourcePath = response.headers.get('Location')
    if (!resourcePath) {
      throw new Error('Resource URL not found')
    }
    // path なので endpointUrl の host と port を付与する
    this.resourceUrl = new URL(resourcePath, this.endpointUrl).toString()

    // TURN-URL を取得するために Link ヘッダーを取得する
    const linkHeader = response.headers.get('Link')
    if (!linkHeader) {
      throw new Error('Link header not found')
    }

    // Link ヘッダーから ICE サーバーを取得する
    const iceServers = this.parseLinkHeader(linkHeader)

    // ICE サーバーを設定する
    this.pc.setConfiguration({
      iceServers: iceServers,
      // Relay を使用する
      iceTransportPolicy: 'relay',
    })

    // ここで setLocalDescription を呼ぶ
    await this.pc.setLocalDescription(offer)

    // Answer を取得する
    const answerSdp = await response.text()
    console.log('answerSdp:', answerSdp)
    // RTCSessionDescription に変換する
    const answer = new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
    // Answer を設定する
    await this.pc.setRemoteDescription(answer)
  }

  async disconnect(): Promise<void> {
    if (!this.resourceUrl) {
      throw new Error('Resource URL not found')
    }

    // /whip-resource/:channel_id/:secret/ に DELETE する
    const response = await fetch(this.resourceUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    })

    if (response.status !== 200) {
      console.warn('Failed to disconnect')
    }

    if (!this.stream) {
      throw new Error('Stream not found')
    }

    // ストリームを停止する
    for (const track of this.stream.getTracks()) {
      track.stop()
    }
    this.stream = undefined

    // 接続を切断する
    this.pc?.close()
    this.pc = undefined
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.pc === undefined) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.pc.getStats()
  }

  get peerConnection(): RTCPeerConnection | undefined {
    return this.pc
  }

  // Link ヘッダーから RTCIceServer[] を生成する
  private parseLinkHeader(str: string): RTCIceServer[] {
    // 項目ごとに分割 (","区切り)
    const entries = str.split(',')

    const urls: string[] = []
    let username: string | undefined
    let credential: string | undefined

    for (const entry of entries) {
      // 前後の空白除去
      const trimmed = entry.trim()

      // URL 抽出: <turn:...> の部分を正規表現で取得
      const urlMatch = trimmed.match(/<([^>]+)>/)
      urlMatch?.[1] && urls.push(urlMatch[1])

      // username 抽出
      const usernameMatch = trimmed.match(/username="([^"]+)"/)
      if (usernameMatch?.[1]) {
        username = usernameMatch[1]
      }

      // credential 抽出
      const credentialMatch = trimmed.match(/credential="([^"]+)"/)
      if (credentialMatch?.[1]) {
        credential = credentialMatch[1]
      }
    }

    return [
      {
        urls,
        username,
        credential,
      },
    ]
  }
}
