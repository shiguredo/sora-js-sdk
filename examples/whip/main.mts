document.addEventListener('DOMContentLoaded', async () => {
  const endpointUrl = import.meta.env.VITE_WHIP_ENDPOINT_URL
  const accessToken = import.meta.env.VITE_ACCESS_TOKEN

  const whipClient = new WhipClient(endpointUrl, accessToken)

  document.getElementById('connect')?.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })

    const localVideo = document.getElementById('local-video') as HTMLVideoElement
    if (!localVideo) {
      throw new Error('Local video element not found')
    }
    localVideo.srcObject = stream

    await whipClient.connect(stream)
  })

  document.getElementById('disconnect')?.addEventListener('click', async () => {
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

  private accessToken: string
  private pc: RTCPeerConnection | undefined

  private stream: MediaStream | undefined

  constructor(endpointUrl: string, accessToken: string) {
    this.endpointUrl = endpointUrl
    this.accessToken = accessToken
  }

  async connect(stream: MediaStream): Promise<void> {
    if (!stream) {
      throw new Error('Stream not found')
    }
    this.stream = stream

    this.pc = new RTCPeerConnection()

    this.pc.onconnectionstatechange = (event) => {
      console.log('connectionState:', this.pc?.connectionState)
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

    const videoCodecs = RTCRtpSender.getCapabilities('video')?.codecs
    if (!videoCodecs) {
      throw new Error('Video codecs not found')
    }
    // mimeType が video/AV1 の codec のみを filter する
    const av1Codecs = videoCodecs.filter((codec) => codec.mimeType === 'video/AV1')
    if (av1Codecs.length === 0) {
      throw new Error('AV1 codec not found')
    }
    videoTransceiver.setCodecPreferences(av1Codecs)

    this.pc.addTrack(this.stream.getVideoTracks()[0], this.stream)
    this.pc.addTrack(this.stream.getAudioTracks()[0], this.stream)

    // まずは offer を作成する
    const offer = await this.pc.createOffer()
    console.log('offer.sdp:', offer.sdp)

    // /whip/:channel_id に POST する
    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        // 認証は Bearer Token を利用する
        Authorization: `Bearer ${this.accessToken}`,
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
    console.log('resourceUrl:', this.resourceUrl)

    // TURN-URL を取得するために Link ヘッダーを取得する
    const linkHeader = response.headers.get('Link')
    if (!linkHeader) {
      throw new Error('Link header not found')
    }
    console.log('linkHeader:', linkHeader)

    // Link ヘッダーから ICE サーバーを取得する
    const iceServers = this.parseLinkHeader(linkHeader)
    console.log('iceServers:', iceServers)

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
    // RTCSessionDescription に変換する
    const answer = new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
    console.log('answer.sdp:', answer.sdp)
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
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (response.status !== 200) {
      throw new Error('Failed to disconnect')
    }
    console.log('Disconnected')

    // 接続を切断する
    this.pc?.close()

    if (!this.stream) {
      throw new Error('Stream not found')
    }

    // ストリームを停止する
    for (const track of this.stream.getTracks()) {
      track.stop()
    }
    this.stream = undefined
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
