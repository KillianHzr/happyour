import ExpoModulesCore
import AVFoundation

public class VideoConcatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoConcat")

    AsyncFunction("concatVideos") { (uris: [String], promise: Promise) in
      Task {
        do {
          let result = try await self.concat(uris: uris)
          promise.resolve(result)
        } catch {
          promise.reject("CONCAT_ERROR", error.localizedDescription)
        }
      }
    }
  }

  private func concat(uris: [String]) async throws -> String {
    guard !uris.isEmpty else {
      throw NSError(domain: "VideoConcat", code: 0,
                    userInfo: [NSLocalizedDescriptionKey: "No URIs provided"])
    }

    let composition = AVMutableComposition()

    guard let compVideo = composition.addMutableTrack(
      withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "VideoConcat", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Could not create video composition track"])
    }
    let compAudio = composition.addMutableTrack(
      withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid
    )

    var cursor = CMTime.zero
    var renderSize: CGSize = .zero
    var frameRate: Int32 = 30
    // (compositionTime, preferredTransform) — one entry per clip
    var clipInfos: [(startTime: CMTime, transform: CGAffineTransform)] = []

    for uriString in uris {
      let url: URL
      if uriString.hasPrefix("file://") {
        guard let u = URL(string: uriString) else { continue }
        url = u
      } else {
        url = URL(fileURLWithPath: uriString)
      }

      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration)
      let range = CMTimeRangeMake(start: .zero, duration: duration)

      let videoTracks = try await asset.loadTracks(withMediaType: .video)
      if let src = videoTracks.first {
        try compVideo.insertTimeRange(range, of: src, at: cursor)

        // Collect the source track's orientation transform.
        // iOS stores rotation in preferredTransform, not in the pixel data.
        let transform = try await src.load(.preferredTransform)
        clipInfos.append((startTime: cursor, transform: transform))

        if cursor == CMTime.zero {
          // Derive render size from first clip (applied transform gives portrait dimensions).
          let naturalSize = try await src.load(.naturalSize)
          let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(transform)
          renderSize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))

          let nominalFrameRate = try await src.load(.nominalFrameRate)
          frameRate = Int32(nominalFrameRate.rounded())
        }
      }

      let audioTracks = try await asset.loadTracks(withMediaType: .audio)
      if let src = audioTracks.first, let compAudio = compAudio {
        try compAudio.insertTimeRange(range, of: src, at: cursor)
      }

      cursor = CMTimeAdd(cursor, duration)
    }

    let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("merged_\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
    try? FileManager.default.removeItem(at: outputURL)

    guard let exporter = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw NSError(domain: "VideoConcat", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Could not create export session"])
    }

    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true

    // Build explicit video composition instructions so each clip's preferredTransform
    // is correctly applied. One instruction per clip avoids transform interpolation
    // that would occur if we used a single instruction with multiple setTransform keyframes.
    if !clipInfos.isEmpty && renderSize != .zero {
      let videoComposition = AVMutableVideoComposition()
      videoComposition.renderSize = renderSize
      videoComposition.frameDuration = CMTimeMake(value: 1, timescale: frameRate)

      var instructions: [AVMutableVideoCompositionInstruction] = []
      for (index, info) in clipInfos.enumerated() {
        let endTime = index + 1 < clipInfos.count
          ? clipInfos[index + 1].startTime
          : composition.duration
        let instrDuration = CMTimeSubtract(endTime, info.startTime)

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRangeMake(start: info.startTime, duration: instrDuration)

        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideo)
        layerInstruction.setTransform(info.transform, at: info.startTime)
        instruction.layerInstructions = [layerInstruction]
        instructions.append(instruction)
      }

      videoComposition.instructions = instructions
      exporter.videoComposition = videoComposition
    }

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      exporter.exportAsynchronously {
        switch exporter.status {
        case .completed:
          cont.resume()
        case .failed:
          cont.resume(throwing: exporter.error ??
            NSError(domain: "VideoConcat", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Export failed"]))
        case .cancelled:
          cont.resume(throwing: NSError(domain: "VideoConcat", code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Export cancelled"]))
        default:
          cont.resume(throwing: NSError(domain: "VideoConcat", code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Export unknown error"]))
        }
      }
    }

    return outputURL.absoluteString
  }
}
