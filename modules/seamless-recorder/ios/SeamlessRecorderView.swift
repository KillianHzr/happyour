import ExpoModulesCore
import AVFoundation

public class SeamlessRecorderView: ExpoView {
  // MARK: - Capture session
  private let session = AVCaptureSession()
  private var currentCameraPosition: AVCaptureDevice.Position = .back
  private var videoDeviceInput: AVCaptureDeviceInput?
  private var audioDeviceInput: AVCaptureDeviceInput?

  private let videoOutput = AVCaptureVideoDataOutput()
  private let audioOutput = AVCaptureAudioDataOutput()
  private let sessionQueue = DispatchQueue(label: "com.happyour.seamless.session")
  private let writerQueue = DispatchQueue(label: "com.happyour.seamless.writer")

  // MARK: - Asset writer
  private var assetWriter: AVAssetWriter?
  private var videoWriterInput: AVAssetWriterInput?
  private var audioWriterInput: AVAssetWriterInput?
  private var isWriting = false
  private var outputURL: URL?
  var stopPromise: Promise?

  // MARK: - Timestamp normalisation
  private var firstVideoTimestamp: CMTime = .invalid
  private var switchGapOffset: CMTime = .zero
  private var lastWrittenVideoTimestamp: CMTime = .invalid
  private var isSwitchPending = false

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
    if session.canAddInput(input) {
      session.addInput(input)
      audioDeviceInput = input
    }
  }

  private func addOutputs() {
    videoOutput.setSampleBufferDelegate(self, queue: writerQueue)
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if session.canAddOutput(videoOutput) {
      session.addOutput(videoOutput)
      videoOutput.connection(with: .video)?.videoRotationAngle = 90
    }

    audioOutput.setSampleBufferDelegate(self, queue: writerQueue)
    if session.canAddOutput(audioOutput) {
      session.addOutput(audioOutput)
    }
  }

  private func bestCamera(for position: AVCaptureDevice.Position) -> AVCaptureDevice? {
    let discovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera],
      mediaType: .video,
      position: position
    )
    return discovery.devices.first
  }

  // MARK: - Public API
  func setFacing(_ facing: String) {
    let position: AVCaptureDevice.Position = (facing == "front") ? .front : .back
    guard position != currentCameraPosition else { return }
    // During active recording performSwitch() owns camera changes — ignore prop updates.
    guard !isWriting else { return }
    sessionQueue.async { [weak self] in
      self?.switchCamera(to: position)
    }
  }

  func startRecording() {
    writerQueue.async { [weak self] in
      self?.prepareWriter()
    }
  }

  func stopRecording(promise: Promise) {
    writerQueue.async { [weak self] in
      guard let self, self.isWriting else {
        promise.reject("STOP_ERROR", "Not recording")
        return
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
          let err = self.assetWriter?.error?.localizedDescription ?? "Write failed"
          self.stopPromise?.reject("STOP_ERROR", err)
        }
        self.stopPromise = nil
        self.resetWriter()
      }
    }
  }

  func performSwitch() {
    let next: AVCaptureDevice.Position = (currentCameraPosition == .back) ? .front : .back
    sessionQueue.async { [weak self] in
      self?.switchCamera(to: next)
    }
  }

  // MARK: - Camera switch
  private func switchCamera(to position: AVCaptureDevice.Position) {
    guard let device = bestCamera(for: position),
          let newInput = try? AVCaptureDeviceInput(device: device) else { return }

    session.beginConfiguration()
    if let old = videoDeviceInput {
      session.removeInput(old)
    }
    if session.canAddInput(newInput) {
      session.addInput(newInput)
      videoDeviceInput = newInput
      currentCameraPosition = position
    }
    videoOutput.connection(with: .video)?.videoRotationAngle = 90
    session.commitConfiguration()

    // Signal the writer queue to insert a gap offset on the next video frame
    writerQueue.async { [weak self] in
      self?.isSwitchPending = true
    }
  }

  // MARK: - Writer setup
  private func prepareWriter() {
    let ts = Int(Date().timeIntervalSince1970 * 1000)
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("rec_\(ts).mp4")
    try? FileManager.default.removeItem(at: url)
    outputURL = url

    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }

    let videoSettings = videoOutput.recommendedVideoSettingsForAssetWriter(writingTo: .mp4) ?? [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: 720,
      AVVideoHeightKey: 1280
    ]
    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings as? [String: Any])
    vInput.expectsMediaDataInRealTime = true
    // Portrait orientation already enforced at the connection level (rotation 90°),
    // but set transform as belt-and-suspenders so players honour it correctly.
    vInput.transform = CGAffineTransform(rotationAngle: 0)

    let aSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 64000
    ]
    let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: aSettings)
    aInput.expectsMediaDataInRealTime = true

    if writer.canAdd(vInput) { writer.add(vInput) }
    if writer.canAdd(aInput) { writer.add(aInput) }

    assetWriter = writer
    videoWriterInput = vInput
    audioWriterInput = aInput

    firstVideoTimestamp = .invalid
    lastWrittenVideoTimestamp = .invalid
    switchGapOffset = .zero
    isSwitchPending = false
    isWriting = true
  }

  private func resetWriter() {
    assetWriter = nil
    videoWriterInput = nil
    audioWriterInput = nil
    firstVideoTimestamp = .invalid
    lastWrittenVideoTimestamp = .invalid
    switchGapOffset = .zero
    isSwitchPending = false
    isWriting = false
    outputURL = nil
  }

  // MARK: - Timestamp normalisation
  private func normalise(_ buffer: CMSampleBuffer, isVideo: Bool) -> CMSampleBuffer? {
    let rawPTS = CMSampleBufferGetPresentationTimeStamp(buffer)

    if isVideo {
      if isSwitchPending {
        // The gap between lastWrittenVideoTimestamp and rawPTS is dead time (camera switch).
        // We close it by accumulating the gap into switchGapOffset.
        if CMTIME_IS_VALID(lastWrittenVideoTimestamp) {
          let gap = CMTimeSubtract(rawPTS, lastWrittenVideoTimestamp)
          // We want the next frame to immediately follow lastWrittenVideoTimestamp + 1 frame.
          // Desired PTS = lastWrittenVideoTimestamp + frameDuration ≈ 1/30.
          // Actual offset needed = rawPTS - desiredPTS = gap - 1 frame.
          let frameDuration = CMTimeMake(value: 1, timescale: 30)
          let extraGap = CMTimeSubtract(gap, frameDuration)
          switchGapOffset = CMTimeAdd(switchGapOffset, extraGap)
        }
        isSwitchPending = false
      }

      if !CMTIME_IS_VALID(firstVideoTimestamp) {
        firstVideoTimestamp = CMTimeSubtract(rawPTS, switchGapOffset)
      }
    }

    guard CMTIME_IS_VALID(firstVideoTimestamp) else { return nil }

    let adjustedPTS = CMTimeSubtract(CMTimeSubtract(rawPTS, firstVideoTimestamp), switchGapOffset)
    guard CMTIME_IS_POSITIVE_INFINITY(adjustedPTS) == false,
          adjustedPTS.value >= 0 else { return nil }

    let duration = CMSampleBufferGetDuration(buffer)
    var timingInfo = CMSampleTimingInfo(
      duration: duration,
      presentationTimeStamp: adjustedPTS,
      decodeTimeStamp: .invalid
    )

    var out: CMSampleBuffer?
    CMSampleBufferCreateCopyWithNewTiming(
      allocator: nil,
      sampleBuffer: buffer,
      sampleTimingEntryCount: 1,
      sampleTimingArray: &timingInfo,
      sampleBufferOut: &out
    )

    if isVideo, let o = out {
      lastWrittenVideoTimestamp = CMSampleBufferGetPresentationTimeStamp(o)
    }

    return out
  }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate
extension SeamlessRecorderView: AVCaptureVideoDataOutputSampleBufferDelegate,
                                AVCaptureAudioDataOutputSampleBufferDelegate {

  public func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard isWriting, let writer = assetWriter else { return }

    let isVideo = (output is AVCaptureVideoDataOutput)

    guard let normalised = normalise(sampleBuffer, isVideo: isVideo) else { return }

    let adjustedPTS = CMSampleBufferGetPresentationTimeStamp(normalised)

    if writer.status == .unknown {
      writer.startWriting()
      writer.startSession(atSourceTime: adjustedPTS)
    }
    guard writer.status == .writing else { return }

    if isVideo, let vInput = videoWriterInput, vInput.isReadyForMoreMediaData {
      vInput.append(normalised)
    } else if !isVideo, let aInput = audioWriterInput, aInput.isReadyForMoreMediaData {
      aInput.append(normalised)
    }
  }
}
