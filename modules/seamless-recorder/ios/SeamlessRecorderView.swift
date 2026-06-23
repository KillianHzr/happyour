import ExpoModulesCore
import AVFoundation
import CoreImage
import UIKit

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

  // MARK: - Snapshot (gel de preview)
  // Dernière frame vidéo reçue, pour produire un "gel" instantané de la preview.
  private var latestVideoBuffer: CMSampleBuffer?
  private let snapshotLock = NSLock()
  private lazy var snapshotContext = CIContext()

  // MARK: - Zoom
  // Facteur de zoom "device" correspondant au 1x affiché. Sur un objectif virtuel
  // (dual/triple), 1x = la première valeur de virtualDeviceSwitchOverVideoZoomFactors
  // (le passage ultra-grand-angle → grand-angle) ; videoZoomFactor=1.0 = ultra-wide
  // = 0.5x affiché. Sur un objectif simple, ce facteur vaut 1.0 (pas de 0.5x).
  private var oneXZoomFactor: CGFloat = 1.0
  // Dernier facteur d'affichage demandé par le JS (réappliqué après un switch).
  private var requestedDisplayZoom: CGFloat = 1.0

  // MARK: - Preview
  private let previewLayer = AVCaptureVideoPreviewLayer()

  // MARK: - Lifecycle
  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    // Attacher la preview layer à la session ICI, synchrone sur le main thread, AVANT que
    // la session queue ne touche à la session. `previewLayer.session = ...` déclenche en
    // interne un commitConfiguration (+ validation Cinematic sur iOS 26) ; si ça s'exécute
    // pendant que `startRunning()`/`commitConfiguration()` tournent sur la sessionQueue, deux
    // queues mutent la même AVCaptureSession en parallèle → NSException AVFoundation non
    // rattrapable → SIGABRT (crash observé SeamlessRecorderView.swift:89 vs :94). En faisant
    // l'attache une seule fois ici, avant tout travail sur la sessionQueue, il n'y a plus
    // jamais d'accès concurrent à la session entre les deux queues.
    previewLayer.session = session
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
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
  // Toute la (re)configuration de la session ET startRunning vivent sur la sessionQueue,
  // sérialisés. La preview layer est déjà attachée à la session (dans init, sur le main)
  // avant que ce bloc ne s'exécute → aucune mutation concurrente de la session.
  private func setupSession() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.session.beginConfiguration()
      self.session.sessionPreset = .hd1280x720
      self.addCameraInput(position: .back)
      self.addAudioInput()
      self.addOutputs()
      self.session.commitConfiguration()
      // Orientation + zoom MUST be set after commitConfiguration — connections/device are ready.
      self.setPortraitOrientation(on: self.videoOutput.connection(with: .video))
      self.applyCurrentZoom()
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
      updateOneXZoomFactor(for: device)
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
    // À l'arrière, on privilégie un objectif virtuel multi-cam (triple puis dual-wide)
    // qui inclut l'ultra-grand-angle → permet le 0.5x avec transitions automatiques.
    // À défaut (ou en façade), on retombe sur le grand-angle simple (pas de 0.5x).
    let preferred: [AVCaptureDevice.DeviceType]
    if position == .back {
      preferred = [.builtInTripleCamera, .builtInDualWideCamera, .builtInWideAngleCamera]
    } else {
      preferred = [.builtInWideAngleCamera]
    }
    let discovered = AVCaptureDevice.DiscoverySession(
      deviceTypes: preferred, mediaType: .video, position: position
    ).devices
    // Respecter l'ordre de préférence (la DiscoverySession ne le garantit pas).
    for type in preferred {
      if let match = discovered.first(where: { $0.deviceType == type }) { return match }
    }
    return discovered.first
  }

  // Calcule le facteur "1x" du device. À appeler dans le bloc begin/commitConfiguration
  // (lecture seule, ne verrouille pas le device).
  private func updateOneXZoomFactor(for device: AVCaptureDevice) {
    if let switchOver = device.virtualDeviceSwitchOverVideoZoomFactors.first {
      oneXZoomFactor = CGFloat(truncating: switchOver)
    } else {
      oneXZoomFactor = 1.0
    }
  }

  // Applique le zoom d'affichage courant. À appeler APRÈS commitConfiguration
  // (verrouille le device).
  private func applyCurrentZoom() {
    guard let device = videoDeviceInput?.device else { return }
    applyZoom(device: device, displayFactor: requestedDisplayZoom)
  }

  // displayFactor: 0.5 = ultra grand-angle, 1 = grand-angle, 2, 5… (clampé device).
  private func applyZoom(device: AVCaptureDevice, displayFactor: CGFloat) {
    let target = displayFactor * oneXZoomFactor
    let minF = device.minAvailableVideoZoomFactor
    let maxF = min(device.maxAvailableVideoZoomFactor, 5.0 * oneXZoomFactor)
    try? device.lockForConfiguration()
    device.videoZoomFactor = max(minF, min(maxF, target))
    device.unlockForConfiguration()
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

  // `zoom` = facteur d'affichage absolu (0.5 = ultra grand-angle, 1 = 1x, …).
  func setZoom(_ zoom: Double) {
    requestedDisplayZoom = CGFloat(zoom)
    guard let device = videoDeviceInput?.device else { return }
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.applyZoom(device: device, displayFactor: self.requestedDisplayZoom)
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

  // Gel de preview : encode la dernière frame vidéo en JPEG et renvoie son URI.
  // Quasi instantané (pas de capture photo haute résolution) → sert à figer l'écran
  // à l'appui, avant que la vraie photo soit prête.
  func snapshotPreview(promise: Promise) {
    snapshotLock.lock()
    let buffer = latestVideoBuffer
    snapshotLock.unlock()
    guard let buffer, let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else {
      promise.reject("SNAPSHOT_ERROR", "No frame available"); return
    }
    var ci = CIImage(cvPixelBuffer: pixelBuffer)
    // La preview est en miroir pour la caméra avant, mais pas les buffers → on miroir ici
    // pour que le gel corresponde exactement à ce que voit l'utilisateur.
    if currentCameraPosition == .front {
      ci = ci.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
      ci = ci.transformed(by: CGAffineTransform(translationX: ci.extent.width, y: 0))
    }
    guard let cg = snapshotContext.createCGImage(ci, from: ci.extent) else {
      promise.reject("SNAPSHOT_ERROR", "Render failed"); return
    }
    let image = UIImage(cgImage: cg)
    guard let data = image.jpegData(compressionQuality: 0.85) else {
      promise.reject("SNAPSHOT_ERROR", "Encode failed"); return
    }
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("snap_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
    do {
      try data.write(to: url)
      promise.resolve(url.absoluteString)
    } catch {
      promise.reject("SNAPSHOT_ERROR", error.localizedDescription)
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
      updateOneXZoomFactor(for: device)
    }
    session.commitConfiguration()
    // Apply orientation + zoom AFTER commit — same reason as setupSession.
    setPortraitOrientation(on: videoOutput.connection(with: .video))
    applyCurrentZoom()
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
    let isVideo = output is AVCaptureVideoDataOutput
    // Mémorise la dernière frame vidéo pour le gel de preview (snapshotPreview), uniquement
    // hors enregistrement : le gel ne sert qu'en mode PHOTO, et on évite ainsi de retenir un
    // buffer du pool pendant le hot path d'enregistrement.
    if isVideo && !isWriting {
      snapshotLock.lock(); latestVideoBuffer = sampleBuffer; snapshotLock.unlock()
    }
    guard isWriting, let writer = assetWriter else { return }
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
