import ExpoModulesCore
import AVFoundation

public class SeamlessRecorderView: ExpoView {
  // MARK: - Session
  private let session = AVCaptureSession()
  private var currentCameraPosition: AVCaptureDevice.Position = .back
  private var videoDeviceInput: AVCaptureDeviceInput?

  private let videoOutput = AVCaptureVideoDataOutput()
  private let audioOutput = AVCaptureAudioDataOutput()
  private let photoOutput = AVCapturePhotoOutput()
  private let sessionQueue = DispatchQueue(label: "com.happyour.seamless.session")
  private let writerQueue  = DispatchQueue(label: "com.happyour.seamless.writer")

  // MARK: - Asset writer
  private var assetWriter: AVAssetWriter?
  private var videoWriterInput: AVAssetWriterInput?
  private var audioWriterInput: AVAssetWriterInput?
  private var isWriting = false
  private var outputURL: URL?
  var stopPromise: Promise?

  // MARK: - Timestamp normalisation (auto-detect gaps > 100 ms)
  private var firstVideoTimestamp: CMTime = .invalid
  private var lastRawVideoTimestamp: CMTime = .invalid
  private var switchGapOffset: CMTime = .zero

  // MARK: - Photo
  private var pendingPhotoPromise: Promise?
  private var currentFlashMode: AVCaptureDevice.FlashMode = .off

  // MARK: - Preview
  private let previewLayer = AVCaptureVideoPreviewLayer()

  // MARK: - Lifecycle
  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    setupSession()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  // Stop the session just before the view leaves the screen.
  public override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      // IMPORTANT : retenir la session FORTEMENT ici. Avec `[weak self]`, si la vue
      // était libérée avant l'exécution du bloc (ce qui arrive au démontage RN, p.ex.
      // capture → preview), `self` valait nil → `stopRunning()` n'était jamais appelé,
      // et l'AVCaptureSession se libérait EN COURS D'EXÉCUTION sur le main thread →
      // gros freeze de plusieurs secondes. En retenant la session, on garantit qu'elle
      // est arrêtée en arrière-plan AVANT sa libération.
      let session = self.session
      sessionQueue.async { if session.isRunning { session.stopRunning() } }
    }
  }

  // Restart the session once the view is actually in a window.
  // willMove(toWindow:) fires *before* the move and isn't reliable for restarts;
  // didMoveToWindow fires *after*, so self.window is guaranteed non-nil here.
  // This handles React Native's brief detach/reattach during reconciliation and JS reloads.
  public override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    sessionQueue.async { [weak self] in
      guard let self, !self.session.isRunning else { return }
      self.session.startRunning()
    }
  }

  // MARK: - Setup
  private func setupSession() {
    session.sessionPreset = .hd1280x720
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.session.beginConfiguration()
      self.addCameraInput(position: .back)
      self.addAudioInput()
      self.addOutputs()
      self.session.commitConfiguration()
      // Orientation MUST be set after commitConfiguration — connections are fully established here.
      self.setPortraitOrientation(on: self.videoOutput.connection(with: .video))
      DispatchQueue.main.async {
        self.previewLayer.session = self.session
        self.previewLayer.videoGravity = .resizeAspectFill
        self.layer.addSublayer(self.previewLayer)
        self.previewLayer.frame = self.bounds
      }
      self.session.startRunning()
    }
  }

  private func addCameraInput(position: AVCaptureDevice.Position) {
    guard let device = bestCamera(for: position),
          let input = try? AVCaptureDeviceInput(device: device) else { return }
    if session.canAddInput(input) {
      session.addInput(input)
      videoDeviceInput = input
      currentCameraPosition = position
    }
  }

  private func addAudioInput() {
    guard let mic = AVCaptureDevice.default(for: .audio),
          let input = try? AVCaptureDeviceInput(device: mic) else { return }
    if session.canAddInput(input) { session.addInput(input) }
  }

  private func addOutputs() {
    videoOutput.setSampleBufferDelegate(self, queue: writerQueue)
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }

    audioOutput.setSampleBufferDelegate(self, queue: writerQueue)
    if session.canAddOutput(audioOutput) { session.addOutput(audioOutput) }

    if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
  }

  private func setPortraitOrientation(on connection: AVCaptureConnection?) {
    guard let connection else { return }
    if #available(iOS 17.0, *) {
      if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
    } else {
      if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
    }
  }

  private func bestCamera(for position: AVCaptureDevice.Position) -> AVCaptureDevice? {
    AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: position
    ).devices.first
  }

  // MARK: - Public API (called from Module)

  func setFacing(_ facing: String) {
    let position: AVCaptureDevice.Position = (facing == "front") ? .front : .back
    guard position != currentCameraPosition, !isWriting else { return }
    sessionQueue.async { [weak self] in self?.switchCamera(to: position) }
  }

  func setFlash(_ flash: String) {
    currentFlashMode = flash == "on" ? .on : flash == "auto" ? .auto : .off
  }

  func setZoom(_ zoom: Double) {
    guard let device = videoDeviceInput?.device else { return }
    sessionQueue.async {
      let minF = device.minAvailableVideoZoomFactor
      let maxF = min(device.maxAvailableVideoZoomFactor, 8.0)
      let factor = minF + CGFloat(zoom) * (maxF - minF)
      try? device.lockForConfiguration()
      device.videoZoomFactor = max(minF, min(maxF, factor))
      device.unlockForConfiguration()
    }
  }

  func setTorch(_ on: Bool) {
    guard let device = videoDeviceInput?.device, device.hasTorch else { return }
    sessionQueue.async {
      try? device.lockForConfiguration()
      device.torchMode = on ? .on : .off
      device.unlockForConfiguration()
    }
  }

  func capturePhoto(promise: Promise) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      // Self-heal: if the session was stopped (e.g. by a brief RN detach), restart it.
      // startRunning() is synchronous on sessionQueue so the session is running by the
      // time capturePhoto executes below.
      if !self.session.isRunning { self.session.startRunning() }
      guard self.pendingPhotoPromise == nil else {
        promise.reject("PHOTO_ERROR", "Photo capture already in progress"); return
      }
      self.pendingPhotoPromise = promise
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      if self.photoOutput.supportedFlashModes.contains(self.currentFlashMode) {
        settings.flashMode = self.currentFlashMode
      }
      self.photoOutput.capturePhoto(with: settings, delegate: self)
    }
  }

  func startRecording() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if !self.session.isRunning { self.session.startRunning() }
    }
    writerQueue.async { [weak self] in self?.prepareWriter() }
  }

  func stopRecording(promise: Promise) {
    writerQueue.async { [weak self] in
      guard let self, self.isWriting else {
        promise.reject("STOP_ERROR", "Not recording"); return
      }
      self.stopPromise = promise
      self.isWriting = false
      self.videoWriterInput?.markAsFinished()
      self.audioWriterInput?.markAsFinished()
      self.assetWriter?.finishWriting { [weak self] in
        guard let self else { return }
        if self.assetWriter?.status == .completed, let url = self.outputURL {
          self.stopPromise?.resolve(url.absoluteString)
        } else {
          self.stopPromise?.reject("STOP_ERROR", self.assetWriter?.error?.localizedDescription ?? "Write failed")
        }
        self.stopPromise = nil
        self.resetWriter()
      }
    }
  }

  func performSwitch() {
    let next: AVCaptureDevice.Position = (currentCameraPosition == .back) ? .front : .back
    sessionQueue.async { [weak self] in self?.switchCamera(to: next) }
  }

  // MARK: - Camera switch
  private func switchCamera(to position: AVCaptureDevice.Position) {
    guard let device = bestCamera(for: position),
          let newInput = try? AVCaptureDeviceInput(device: device) else { return }
    session.beginConfiguration()
    if let old = videoDeviceInput { session.removeInput(old) }
    if session.canAddInput(newInput) {
      session.addInput(newInput)
      videoDeviceInput = newInput
      currentCameraPosition = position
    }
    session.commitConfiguration()
    // Apply orientation AFTER commit — same reason as setupSession.
    setPortraitOrientation(on: videoOutput.connection(with: .video))
  }

  // MARK: - Writer
  private func prepareWriter() {
    let ts = Int(Date().timeIntervalSince1970 * 1000)
    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("rec_\(ts).mp4")
    try? FileManager.default.removeItem(at: url)
    outputURL = url

    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }

    let videoSettings = videoOutput.recommendedVideoSettingsForAssetWriter(writingTo: .mp4)
    let fallback: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 720, AVVideoHeightKey: 1280]
    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings ?? fallback)
    vInput.expectsMediaDataInRealTime = true
    vInput.transform = .identity

    let aSettings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100,
                                    AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000]
    let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: aSettings)
    aInput.expectsMediaDataInRealTime = true

    if writer.canAdd(vInput) { writer.add(vInput) }
    if writer.canAdd(aInput) { writer.add(aInput) }

    assetWriter = writer
    videoWriterInput = vInput
    audioWriterInput = aInput
    firstVideoTimestamp = .invalid
    lastRawVideoTimestamp = .invalid
    switchGapOffset = .zero
    isWriting = true
  }

  private func resetWriter() {
    assetWriter = nil; videoWriterInput = nil; audioWriterInput = nil
    firstVideoTimestamp = .invalid; lastRawVideoTimestamp = .invalid
    switchGapOffset = .zero; isWriting = false; outputURL = nil
  }

  // MARK: - Timestamp normalisation
  private func normalise(_ buffer: CMSampleBuffer, isVideo: Bool) -> CMSampleBuffer? {
    let rawPTS = CMSampleBufferGetPresentationTimeStamp(buffer)

    if isVideo {
      // Auto-detect camera switch: any gap > 100 ms between consecutive frames
      // is dead time (camera reconfiguration). Close it to produce seamless playback.
      if CMTIME_IS_VALID(lastRawVideoTimestamp) {
        let gapSeconds = CMTimeGetSeconds(CMTimeSubtract(rawPTS, lastRawVideoTimestamp))
        if gapSeconds > 0.1 {
          let gap = CMTimeSubtract(rawPTS, lastRawVideoTimestamp)
          let oneFrame = CMTimeMake(value: 1, timescale: 30)
          switchGapOffset = CMTimeAdd(switchGapOffset, CMTimeSubtract(gap, oneFrame))
        }
      }
      lastRawVideoTimestamp = rawPTS
      if !CMTIME_IS_VALID(firstVideoTimestamp) { firstVideoTimestamp = rawPTS }
    }

    guard CMTIME_IS_VALID(firstVideoTimestamp) else { return nil }

    let adjustedPTS = CMTimeSubtract(CMTimeSubtract(rawPTS, firstVideoTimestamp), switchGapOffset)
    let s = CMTimeGetSeconds(adjustedPTS)
    guard s.isFinite, s >= 0 else { return nil }

    var timingInfo = CMSampleTimingInfo(duration: CMSampleBufferGetDuration(buffer),
                                        presentationTimeStamp: adjustedPTS,
                                        decodeTimeStamp: .invalid)
    var out: CMSampleBuffer?
    CMSampleBufferCreateCopyWithNewTiming(allocator: nil, sampleBuffer: buffer,
                                          sampleTimingEntryCount: 1,
                                          sampleTimingArray: &timingInfo,
                                          sampleBufferOut: &out)
    return out
  }
}

// MARK: - Sample buffer delegates
extension SeamlessRecorderView: AVCaptureVideoDataOutputSampleBufferDelegate,
                                AVCaptureAudioDataOutputSampleBufferDelegate {
  public func captureOutput(_ output: AVCaptureOutput,
                             didOutput sampleBuffer: CMSampleBuffer,
                             from connection: AVCaptureConnection) {
    guard isWriting, let writer = assetWriter else { return }
    let isVideo = output is AVCaptureVideoDataOutput
    guard let normalised = normalise(sampleBuffer, isVideo: isVideo) else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(normalised)
    if writer.status == .unknown { writer.startWriting(); writer.startSession(atSourceTime: pts) }
    guard writer.status == .writing else { return }
    if isVideo  { videoWriterInput?.isReadyForMoreMediaData == true ? videoWriterInput?.append(normalised) : nil }
    if !isVideo { audioWriterInput?.isReadyForMoreMediaData == true ? audioWriterInput?.append(normalised) : nil }
  }
}

// MARK: - Photo delegate
extension SeamlessRecorderView: AVCapturePhotoCaptureDelegate {
  public func photoOutput(_ output: AVCapturePhotoOutput,
                           didFinishProcessingPhoto photo: AVCapturePhoto,
                           error: Error?) {
    guard let promise = pendingPhotoPromise else { return }
    pendingPhotoPromise = nil

    if let error { promise.reject("PHOTO_ERROR", error.localizedDescription); return }
    guard let data = photo.fileDataRepresentation() else {
      promise.reject("PHOTO_ERROR", "No photo data"); return
    }
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("photo_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
    do {
      try data.write(to: url)
      promise.resolve(url.absoluteString)
    } catch {
      promise.reject("PHOTO_ERROR", error.localizedDescription)
    }
  }
}
